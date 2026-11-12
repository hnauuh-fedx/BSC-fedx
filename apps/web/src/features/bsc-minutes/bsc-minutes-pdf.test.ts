import { afterEach, expect, it, vi } from 'vitest';
import { buildMinutesPdf } from './bsc-minutes-pdf';
import type { MinutesPrintDocumentProps } from './components/bsc-minutes-print-document';

const constructor = vi.hoisted(() => vi.fn());
vi.mock('jspdf', () => ({ jsPDF: constructor }));
vi.mock('jspdf-autotable', () => ({ autoTable: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('rejects a missing embedded font before creating a PDF and allows retry', async () => {
  const fetchFont = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', fetchFont);
  const props = {} as MinutesPrintDocumentProps;
  await expect(buildMinutesPdf(props)).rejects.toThrow('Không thể tải font tiếng Việt');
  await expect(buildMinutesPdf(props)).rejects.toThrow('Không thể tải font tiếng Việt');
  expect(fetchFont).toHaveBeenCalledTimes(8);
  expect(constructor).not.toHaveBeenCalled();
});
