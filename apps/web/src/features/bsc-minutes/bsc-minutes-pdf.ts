const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const exportMinutesToPdf = async (element: HTMLElement, filename: string) => {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const originalInlineStyle = element.style.cssText;
  document.documentElement.classList.add('minutes-pdf-export');
  document.body.classList.add('minutes-pdf-export');
  element.style.left = '0px';
  element.style.zIndex = '-1';

  try {
    if ('fonts' in document) await document.fonts.ready;
    await nextFrame();
    await nextFrame();

    const scale = 2;
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      foreignObjectRendering: true,
      logging: false,
      scale,
      // The print document is fixed at the viewport origin, independent of editor scroll.
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
    });
    const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    const margin = 20;
    const contentWidth = 210 - margin * 2;
    const mmPerPixel = contentWidth / canvas.width;
    const pageHeight = Math.floor((297 - margin * 2) / mmPerPixel);
    const documentRect = element.getBoundingClientRect();
    const bounds = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return {
        top: Math.max(0, Math.round((rect.top - documentRect.top) * scale)),
        bottom: Math.round((rect.bottom - documentRect.top) * scale),
      };
    };
    // Keep rows and short text blocks intact. A group title stays with its next row.
    const blocks = [...element.querySelectorAll('tr, thead, h2, h3, p, .minutes-print-header, .minutes-print-title, .minutes-print-multiline, section:last-of-type')].map((node) => {
      const block = bounds(node);
      if (node.matches('h2, h3, .minutes-print-group')) {
        let next = node.nextElementSibling;
        if (!next && node.matches('tr')) next = node.parentElement?.nextElementSibling?.firstElementChild ?? null;
        if (next?.matches('table')) next = next.querySelector('thead');
        if (next) block.bottom = bounds(next).bottom;
      }
      if (node.matches('thead')) {
        const firstRow = node.parentElement?.querySelector('tbody tr:not(.minutes-print-group)')
          ?? node.parentElement?.querySelector('tbody tr');
        if (firstRow) block.bottom = bounds(firstRow).bottom;
      }
      return block;
    });
    const table = element.querySelector('.minutes-print-table');
    const head = table?.querySelector('thead');
    const header = head ? bounds(head) : null;
    const tableBottom = table ? bounds(table).bottom : 0;

    let offset = 0;
    while (offset < canvas.height) {
      const repeatHeader = header && offset >= header.bottom && offset < tableBottom;
      const headerHeight = repeatHeader ? header.bottom - header.top : 0;
      if (headerHeight >= pageHeight) throw new Error('Tiêu đề bảng quá cao để hiển thị trên một trang PDF.');
      let end = Math.min(canvas.height, offset + pageHeight - headerHeight);
      // Moving a break back can intersect another keep-with-next block.
      let previousEnd;
      do {
        previousEnd = end;
        for (const block of blocks) {
          if (block.top > offset && block.top < end && block.bottom > end) end = block.top;
        }
      } while (end !== previousEnd);

      const page = document.createElement('canvas');
      page.width = canvas.width;
      page.height = headerHeight + end - offset;
      const context = page.getContext('2d');
      if (!context) throw new Error('Không thể tạo trang PDF.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, page.width, page.height);
      if (repeatHeader) context.drawImage(canvas, 0, header.top, canvas.width, headerHeight, 0, 0, canvas.width, headerHeight);
      context.drawImage(canvas, 0, offset, canvas.width, end - offset, 0, headerHeight, canvas.width, end - offset);
      if (table && header && end > header.top && offset < tableBottom) {
        const rect = table.getBoundingClientRect();
        const borderWidth = Math.max(1, Math.round(scale));
        const left = (rect.left - documentRect.left) * scale;
        const width = rect.width * scale;
        const top = repeatHeader ? 0 : Math.max(0, header.top - offset);
        const bottom = headerHeight + Math.min(end, tableBottom) - offset;
        context.fillStyle = '#000000';
        // Close the raster table at each page boundary, including collapsed outer borders.
        context.fillRect(left, top, borderWidth, bottom - top);
        context.fillRect(left + width - borderWidth, top, borderWidth, bottom - top);
        if (end < tableBottom) context.fillRect(left, page.height - borderWidth, width, borderWidth);
      }
      if (offset > 0) pdf.addPage();
      pdf.addImage(page.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, page.height * mmPerPixel, undefined, 'FAST');
      offset = end;
    }

    pdf.save(filename);
  } finally {
    element.style.cssText = originalInlineStyle;
    document.documentElement.classList.remove('minutes-pdf-export');
    document.body.classList.remove('minutes-pdf-export');
  }
};
