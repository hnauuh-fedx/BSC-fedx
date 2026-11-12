import { createMinutesPdfPages } from './bsc-minutes-pdf-pages';

const createPrintFrame = async () => {
  const frame = document.createElement('iframe');
  frame.title = 'Chuẩn bị biên bản PDF';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:680px;height:1200px;border:0;pointer-events:none;';
  const loaded = new Promise<void>((resolve) => { frame.onload = () => resolve(); });
  document.body.append(frame);
  const renderedWidth = frame.getBoundingClientRect().width;
  // Cancel inherited CSS zoom before measuring the print document.
  if (renderedWidth > 0) frame.style.zoom = String(frame.offsetWidth / renderedWidth);
  await loaded;
  return frame;
};

export const exportMinutesToPdf = async (element: HTMLElement, filename: string) => {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  // A separate document isolates PDF layout from editor scroll, zoom and sticky headings.
  const frame = await createPrintFrame();
  try {
    const target = frame.contentDocument!;
    target.documentElement.className = 'minutes-pdf-export';
    target.body.className = 'minutes-pdf-export';
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((node) => {
      const copy = target.importNode(node, true);
      const ready = copy instanceof target.defaultView!.HTMLLinkElement
        ? new Promise<void>((resolve, reject) => {
          copy.href = (node as HTMLLinkElement).href;
          copy.onload = () => resolve();
          copy.onerror = () => reject(new Error('Không thể tải định dạng biên bản PDF.'));
        }) : Promise.resolve();
      target.head.append(copy);
      return ready;
    });
    const reset = target.createElement('style');
    reset.textContent = `
      html { font-size: 16px; zoom: 1; }
      body { margin: 0; padding: 0; overflow: hidden; }
      .minutes-print-document {
        position: static !important; display: flow-root !important;
        width: 170mm; min-height: 0; margin: 0; padding: 1px;
      }
      .minutes-print-table th { position: static; }
      .minutes-print-table {
        border-collapse: separate; border-spacing: 0;
        border-top: 1px solid black; border-left: 1px solid black;
      }
      .minutes-print-table th, .minutes-print-table td {
        border: 0; border-right: 1px solid black; border-bottom: 1px solid black;
      }
    `;
    target.head.append(reset);
    await Promise.all(styles);
    const source = target.importNode(element, true);
    target.body.append(source);
    if ('fonts' in target) await target.fonts.ready;
    const pages = createMinutesPdfPages(source, target);
    source.remove();
    pages.forEach((page) => { page.style.setProperty('display', 'none', 'important'); });

    const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    for (const [index, page] of pages.entries()) {
      page.style.setProperty('display', 'flow-root', 'important');
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff', foreignObjectRendering: true, logging: false,
        scale: 2, scrollX: 0, scrollY: 0, useCORS: true,
      });
      const pageBounds = page.getBoundingClientRect();
      for (const table of page.querySelectorAll('.minutes-print-table')) {
        const rect = table.getBoundingClientRect();
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Không thể tạo trang PDF.');
        // Keep the outer right border, which SVG capture can omit.
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = '#000000';
        context.fillRect(Math.round((rect.right - pageBounds.left) * 2) - 2,
          Math.round((rect.top - pageBounds.top) * 2), 2, Math.round(rect.height * 2));
        context.restore();
      }
      page.style.setProperty('display', 'none', 'important');
      // An exceptional row taller than one page is scaled as a whole, never clipped.
      const scale = Math.min(170 / canvas.width, 257 / canvas.height);
      const width = canvas.width * scale;
      const height = canvas.height * scale;
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20 + (170 - width) / 2, 20, width, height, undefined, 'FAST');
    }
    pdf.save(filename);
  } finally {
    frame.remove();
  }
};
