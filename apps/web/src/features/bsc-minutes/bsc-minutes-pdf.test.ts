import { beforeEach, describe, expect, it, vi } from 'vitest';
import html2canvas from 'html2canvas';
import { exportMinutesToPdf } from './bsc-minutes-pdf';

const pdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
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
    addPage = vi.fn();
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
  });

  it('renders aligned HTML at the viewport origin and restores export state', async () => {
    const element = document.createElement('article');
    element.style.color = 'black';
    document.body.append(element);
    vi.mocked(html2canvas).mockImplementationOnce(async (target, options) => {
      expect((target as HTMLElement).style.left).toBe('0px');
      expect((target as HTMLElement).style.zIndex).toBe('-1');
      expect(options?.foreignObjectRendering).toBe(true);
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
});
