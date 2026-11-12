import { beforeEach, describe, expect, it, vi } from 'vitest';
import html2canvas from 'html2canvas';
import { exportMinutesToPdf } from './bsc-minutes-pdf';
import { createMinutesPdfPages } from './bsc-minutes-pdf-pages';

const pdfMocks = vi.hoisted(() => ({ addImage: vi.fn(), addPage: vi.fn(), save: vi.fn() }));
vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('jspdf', () => ({ jsPDF: class {
  addImage = pdfMocks.addImage;
  addPage = pdfMocks.addPage;
  save = pdfMocks.save;
} }));

describe('exportMinutesToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(html2canvas).mockResolvedValue({ width: 340, height: 400, toDataURL: () => 'data:image/png;base64,page' } as HTMLCanvasElement);
  });

  it('renders whole HTML pages in an isolated document and preserves the editor', async () => {
    const source = document.createElement('article');
    source.className = 'minutes-print-document';
    source.style.color = 'black';
    source.innerHTML = '<p>Meeting content</p>';
    document.body.append(source);
    vi.mocked(html2canvas).mockImplementationOnce(async (page, options) => {
      expect(page).not.toBe(source);
      expect(page.ownerDocument).not.toBe(document);
      expect(page.textContent).toContain('Meeting content');
      expect(page.classList).toContain('minutes-pdf-page');
      expect(options).toMatchObject({ foreignObjectRendering: true, scrollX: 0, scrollY: 0 });
      return { width: 340, height: 400, toDataURL: () => 'data:image/png;base64,page' } as HTMLCanvasElement;
    });

    await exportMinutesToPdf(source, 'minutes.pdf');

    expect(pdfMocks.addImage).toHaveBeenCalledWith(expect.any(String), 'PNG', 20, 20, 170, 200, undefined, 'FAST');
    expect(pdfMocks.save).toHaveBeenCalledWith('minutes.pdf');
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body).not.toHaveClass('minutes-pdf-export');
    expect(source.style.cssText).toBe('color: black;');
    expect(source.innerHTML).toBe('<p>Meeting content</p>');
  });

  it('removes the temporary document if rendering fails', async () => {
    const source = document.createElement('article');
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('Render failed'));
    await expect(exportMinutesToPdf(source, 'minutes.pdf')).rejects.toThrow('Render failed');
    expect(document.querySelector('iframe')).toBeNull();
    expect(pdfMocks.save).not.toHaveBeenCalled();
  });

  it('moves whole rows and department headings, repeating the table header on each page', () => {
    const source = document.createElement('article');
    source.innerHTML = '<section><h2>Results</h2><table><colgroup><col /></colgroup><thead><tr><th>Employee</th></tr></thead><tbody>'
      + '<tr class="minutes-print-group"><th>Marketing</th></tr>'
      + Array.from({ length: 14 }, (_, i) => `<tr data-employee="${i}"><td>Employee ${i + 1}</td></tr>`).join('')
      + '</tbody></table></section>';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = this.classList.contains('minutes-pdf-page')
        ? this.querySelectorAll('tbody tr').length * 100 + this.querySelectorAll('thead').length * 40 + this.querySelectorAll('h2').length * 20 : 0;
      return { height, top: 0, bottom: height, left: 0, right: 640, width: 640 } as DOMRect;
    });

    const pages = createMinutesPdfPages(source, document);

    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(page.querySelector('thead')).toHaveTextContent('Employee');
      expect(page.querySelectorAll('colgroup')).toHaveLength(1);
      expect(page.getBoundingClientRect().height).toBeLessThan(971);
      const group = page.querySelector('.minutes-print-group');
      if (group) expect(group.nextElementSibling).toHaveAttribute('data-employee');
    }
    expect(pages.flatMap((page) => [...page.querySelectorAll('[data-employee]')].map((row) => row.getAttribute('data-employee'))))
      .toEqual(Array.from({ length: 14 }, (_, i) => String(i)));
    pages.forEach((page) => page.remove());
  });
});
