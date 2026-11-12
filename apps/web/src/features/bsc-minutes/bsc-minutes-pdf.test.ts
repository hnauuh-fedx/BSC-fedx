import { beforeEach, describe, expect, it, vi } from 'vitest';
import html2canvas from 'html2canvas';
import { exportMinutesToPdf } from './bsc-minutes-pdf';

const pdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  drawImage: vi.fn(),
  constructor: vi.fn(),
  save: vi.fn(),
}));

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    height: 297,
    width: 210,
    toDataURL: () => 'data:image/png;base64,pdf',
  }),
}));
vi.mock('jspdf', () => ({
  jsPDF: class JsPdfMock {
    constructor(options: unknown) { pdfMocks.constructor(options); }
    addImage = pdfMocks.addImage;
    addPage = pdfMocks.addPage;
    save = pdfMocks.save;
  },
}));

describe('exportMinutesToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), drawImage: pdfMocks.drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,page');
  });

  it('renders aligned HTML at the viewport origin and restores export state', async () => {
    const element = document.createElement('article');
    element.style.color = 'black';
    document.body.append(element);
    vi.mocked(html2canvas).mockImplementationOnce(async (target, options) => {
      expect((target as HTMLElement).style.left).toBe('0px');
      expect((target as HTMLElement).style.zIndex).toBe('-1');
      expect(options?.foreignObjectRendering).toBe(true);
      expect(options?.scrollX).toBe(0);
      expect(options?.scrollY).toBe(0);
      return {
        height: 297,
        width: 210,
        toDataURL: () => 'data:image/png;base64,pdf',
      } as unknown as HTMLCanvasElement;
    });

    await exportMinutesToPdf(element, 'bien-ban.pdf');

    expect(pdfMocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ format: 'a4' }));
    expect(pdfMocks.addImage).toHaveBeenCalled();
    expect(pdfMocks.save).toHaveBeenCalledWith('bien-ban.pdf');
    expect(document.documentElement).not.toHaveClass('minutes-pdf-export');
    expect(document.body).not.toHaveClass('minutes-pdf-export');
    expect(element.style.cssText).toBe('color: black;');
  });

  it('repeats table headings, preserves rows and leaves 20mm margins on every PDF page', async () => {
    const element = document.createElement('article');
    element.innerHTML = '<table class="minutes-print-table"><thead><tr><th>Header</th></tr></thead><tbody><tr class="minutes-print-group"><th>Department</th></tr>'
      + Array.from({ length: 14 }, (_, i) => `<tr><td>Employee ${i + 1}</td></tr>`).join('') + '</tbody></table>';
    document.body.append(element);
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 170, width: 170, height }) as DOMRect;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(0, 1000));
    vi.spyOn(element.querySelector('table')!, 'getBoundingClientRect').mockReturnValue(rect(100, 900));
    vi.spyOn(element.querySelector('thead')!, 'getBoundingClientRect').mockReturnValue(rect(100, 40));
    const rows = [...element.querySelectorAll('tbody tr')];
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue(rect(140, 20));
    rows.slice(1).forEach((row, i) => vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(160 + i * 60, 60)));
    const source = { width: 340, height: 2000, toDataURL: () => 'data:image/png;base64,source' } as HTMLCanvasElement;
    vi.mocked(html2canvas).mockResolvedValueOnce(source);

    await exportMinutesToPdf(element, 'multi-page.pdf');

    expect(pdfMocks.addPage).toHaveBeenCalled();
    for (const call of pdfMocks.addImage.mock.calls) {
      expect(call.slice(2, 5)).toEqual([20, 20, 170]);
      expect(call[5]).toBeLessThanOrEqual(257);
    }
    // First page ends before the employee row that would cross its bottom edge.
    expect(pdfMocks.drawImage.mock.calls[0]).toEqual([source, 0, 0, 340, 440, 0, 0, 340, 440]);
    // The second page starts with a copy of both table heading rows.
    expect(pdfMocks.drawImage.mock.calls[1]).toEqual([source, 0, 200, 340, 80, 0, 0, 340, 80]);
    expect(pdfMocks.drawImage.mock.calls[2]).toEqual([source, 0, 440, 340, 360, 0, 80, 340, 360]);
    const contentSlices = pdfMocks.drawImage.mock.calls.filter((call) => call[2] !== 200);
    let offset = 0;
    for (const call of contentSlices) {
      expect(call[2]).toBe(offset);
      offset += call[4] as number;
    }
    expect(offset).toBe(source.height);
  });
});
