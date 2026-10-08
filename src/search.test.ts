import { describe, expect, it } from 'vitest';
import { matchesSearch, nameResult, textResults } from './search';
import { extractPdfSearch, joinTextItems } from './pdf-search';
import { validateFile } from './sheets';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
const file = { id: 'a'.repeat(32), title: 'A renamed book', pdfUrl: '/book.pdf', fileNames: ['Original songbook.pdf'] };
describe('song search', () => {
  it('matches readable Hebrew with niqqud, English accents/case and literal punctuation safely', () => {
    expect(matchesSearch('שָׁלוֹם עֲלֵיכֶם', 'שלום עליכם')).toBe(true);
    expect(matchesSearch('Café songs', 'CAFE')).toBe(true);
    expect(matchesSearch('A [special] song', '[special]')).toBe(true);
    expect(matchesSearch('other', '.*')).toBe(false);
    expect(matchesSearch('one song', 'missing')).toBe(false);
  });
  it('searches original file names even when the display title was changed', () => {
    expect(nameResult(file, 'original')).toHaveLength(1);
    expect(nameResult(file, 'renamed')).toHaveLength(1);
    expect(nameResult(file, 'unrelated')).toEqual([]);
    expect(nameResult({ id: 'pdf', title: 'Book', pdfUrl: '/Original%20songbook.pdf' }, 'original')).toHaveLength(1);
    expect(nameResult({ id: 'pdf', title: 'Book', pdfUrl: '/malformed%.pdf' }, 'malformed')).toHaveLength(1);
    expect(validateFile(file)).toEqual(file);
    expect(() => validateFile({ ...file, fileNames: Array(21).fill('file.jpg') })).toThrow('names');
  });
  it('lists distinct occurrences while deduplicating identical index targets', () => {
    const blocks = [{ page: 1, offset: 0, text: 'One song', target: { page: 37, offset: .04 } }, { page: 2, offset: 0, text: 'One song', target: { page: 37, offset: .04 } }, { page: 40, offset: .6, text: 'One song again' }];
    const hits = textResults(file, blocks, 'song'); expect(hits).toHaveLength(2);
    expect(hits[0].location).toEqual({ page: 37, offset: .04 }); expect(hits[1].location.page).toBe(40);
  });
  it('reassembles glyph runs without inserting spaces inside words', () => {
    const item = (str: string, x: number, width: number) => ({ str, transform: [10, 0, 0, 10, x, 20], width, height: 10, hasEOL: false });
    expect(joinTextItems([item('Hel', 0, 15), item('lo', 15, 10), item('world', 30, 25)])).toBe('Hello world');
  });
  it('prefers song-page matches over index links while retaining index-only destinations', () => {
    const blocks = [
      { page: 1, offset: 0, text: 'Song - Artist', target: { page: 27, offset: 0 } },
      { page: 27, offset: .08, text: 'Artist - Song' },
      { page: 2, offset: 0, text: 'Another Song', target: { page: 65, offset: 0 } },
      { page: 3, offset: 0, text: 'Song by another artist', target: { page: 65, offset: 0 } },
      { page: 27, offset: .6, text: 'Song in a later verse' }
    ];
    const hits = textResults(file, blocks, 'song');
    expect(hits).toHaveLength(3);
    expect(hits.filter(hit => hit.location.page === 27).every(hit => hit.foundPage === 27)).toBe(true);
    expect(hits.filter(hit => hit.location.page === 65)).toHaveLength(1);
  });
  it('finds the supplied book index text and follows its internal song destination', async () => {
    GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href;
    const pdf = await getDocument({ data: new Uint8Array(await readFile('public/songbooks/songbook-2026-10.pdf')) }).promise;
    try {
      const blocks = await extractPdfSearch(pdf, new AbortController().signal, () => {});
      const repeatedSong = textResults(file, blocks, '\u05d4\u05dc\u05d5\u05d5\u05d0\u05d9');
      expect(repeatedSong.map(hit => hit.location.page)).toEqual([27]);
      const hits = textResults(file, blocks, 'אדון עולם');
      expect(hits.length).toBeGreaterThan(0); expect(hits.some(hit => hit.location.page > 4 && hit.foundPage! <= 4)).toBe(true);
      const cancelled = new AbortController(); cancelled.abort();
      await expect(extractPdfSearch(pdf, cancelled.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
    } finally { await pdf.destroy(); }
  }, 20000);
});
