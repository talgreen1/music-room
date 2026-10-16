// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const index = vi.hoisted(() => vi.fn());
vi.mock('./pdf-search', () => ({ searchPdfIndex: index }));
import { showSearchDialog } from './search-dialog';
import type { SharedFile } from './sheets';
beforeEach(() => {
  vi.clearAllMocks(); index.mockResolvedValue([]);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
const flush = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
async function search(files: SharedFile[], query: string) {
  const open = vi.fn(), close = showSearchDialog({ files: async () => files, open });
  const input = document.querySelector<HTMLInputElement>('.search-query')!; input.value = query;
  document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await flush();
  return { open, close, result: document.querySelector<HTMLButtonElement>('.search-result')! };
}
describe('search result headings', () => {
  it('puts matching Hebrew PDF text first in bold, followed by file/page details, without changing its destination', async () => {
    const file = { id: 'pdf', title: 'Songbook.pdf', pdfUrl: '/book.pdf' };
    index.mockResolvedValue([{ text: 'אדון עולם - עוזי חיטמן', page: 5, offset: .2 }]);
    const t = await search([file], 'אדון');
    expect(t.result.firstElementChild?.tagName).toBe('STRONG');
    expect(t.result.firstElementChild?.textContent).toBe('אדון עולם - עוזי חיטמן');
    expect(t.result.lastElementChild?.textContent).toBe('Songbook.pdf | Page 5');
    expect(t.result.firstElementChild?.getAttribute('dir')).toBe('auto');
    t.result.click(); await flush(); expect(t.open).toHaveBeenCalledWith(expect.objectContaining({ file, location: { page: 5, offset: .2 } }));
  });
  it('uses a matching file title or original filename for name-only result headings', async () => {
    const file = { id: 'a'.repeat(32), title: 'My favorite song', fileNames: ['original-song.pdf'], pdfUrl: '/song.pdf' };
    let t = await search([file], 'favorite'); expect(t.result.firstElementChild?.textContent).toBe(file.title); t.close();
    t = await search([file], 'original'); expect(t.result.firstElementChild?.textContent).toBe('original-song.pdf');
    expect(t.result.lastElementChild?.textContent).toBe('My favorite song | File name'); t.close();
  });
  it('renders matched content as text without interpreting HTML', async () => {
    index.mockResolvedValue([{ text: '<img src=x onerror=alert(1)> song', page: 2, offset: 0 }]);
    const t = await search([{ id: 'pdf', title: 'Book', pdfUrl: '/book.pdf' }], 'song');
    expect(t.result.querySelector('img')).toBeNull(); expect(t.result.firstElementChild?.textContent).toContain('<img'); t.close();
  });
});
