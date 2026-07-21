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

    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      foreignObjectRendering: true,
      logging: false,
      scale: 2,
      useCORS: true,
    });
    const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    const pageWidth = 210;
    const pageHeight = 297;
    const imageHeight = canvas.height * pageWidth / canvas.width;
    const image = canvas.toDataURL('image/png');

    let offset = 0;
    do {
      if (offset > 0) pdf.addPage();
      pdf.addImage(image, 'PNG', 0, -offset, pageWidth, imageHeight, undefined, 'FAST');
      offset += pageHeight;
    } while (offset < imageHeight - 0.1);

    pdf.save(filename);
  } finally {
    element.style.cssText = originalInlineStyle;
    document.documentElement.classList.remove('minutes-pdf-export');
    document.body.classList.remove('minutes-pdf-export');
  }
};
