import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { resolvePdfLink } from './pdf-links';

describe('PDF internal links', () => {
  let pdf: PDFDocumentProxy;
  beforeAll(async () => {
    pdf = await getDocument({ data: new Uint8Array(await readFile('public/songbooks/songbook-2026-10.pdf')) }).promise;
  });
  afterAll(async () => { await pdf?.destroy(); });
  it('resolves an actual index object reference and its PDF vertical coordinate', async () => {
    const annotations = await (await pdf.getPage(1)).getAnnotations();
    const link = annotations.find(annotation => annotation.subtype === 'Link');
    const result = await resolvePdfLink(pdf, link.dest);
    expect(result.page).toBe(12);
    expect(result.offset).toBeCloseTo((841.8 - 805) / 841.8, 5);
  });
  it('resolves every internal index link in the supplied songbook', async () => {
    let count = 0;
    for (const number of [1, 2]) {
      for (const annotation of await (await pdf.getPage(number)).getAnnotations()) {
        if (annotation.subtype !== 'Link' || !annotation.dest) continue;
        const result = await resolvePdfLink(pdf, annotation.dest);
        expect(result.page).toBeGreaterThanOrEqual(1);
        expect(result.page).toBeLessThanOrEqual(pdf.numPages);
        expect(result.offset).toBeGreaterThanOrEqual(0);
        expect(result.offset).toBeLessThanOrEqual(1);
        count++;
      }
    }
    expect(count).toBeGreaterThan(100);
  });
  it('supports named destinations and zero-based page destinations', async () => {
    const getDestination = vi.fn().mockResolvedValue([4, { name: 'Fit' }]);
    const namedPdf = { numPages: pdf.numPages, getDestination, getPage: pdf.getPage.bind(pdf) } as unknown as PDFDocumentProxy;
    expect(await resolvePdfLink(namedPdf, 'chorus')).toEqual({ page: 5, offset: 0 });
    expect(getDestination).toHaveBeenCalledWith('chorus');
    expect(await resolvePdfLink(pdf, [0, { name: 'FitH' }, 841.8])).toEqual({ page: 1, offset: 0 });
  });
  it('rejects missing and out-of-range destinations', async () => {
    for (const destination of [null, [], [-1], [145], ['bad reference']]) {
      await expect(resolvePdfLink(pdf, destination)).rejects.toThrow(/destination|unavailable/);
    }
  });
});
