import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES, validatePdfUpload, validateSongbook } from './songbook';

const header = new TextEncoder().encode('%PDF-1.7');
describe('PDF uploads and original songbook configuration', () => {
  it('accepts PDF headers within the size limit and rejects invalid or oversized files', () => {
    expect(() => validatePdfUpload(MAX_PDF_BYTES, header)).not.toThrow();
    expect(() => validatePdfUpload(MAX_PDF_BYTES + 1, header)).toThrow('30 MB');
    expect(() => validatePdfUpload(4, header)).toThrow();
    expect(() => validatePdfUpload(100, new TextEncoder().encode('<html>'))).toThrow('not a PDF');
    expect(() => validatePdfUpload(100, new TextEncoder().encode('prefix\n%PDF-1.7'))).not.toThrow();
  });
  it('accepts versioned local/HTTPS descriptors and trims fields', () => {
    const value = { pdfUrl: ' https://example.org/new.pdf ', pdfTitle: ' New book ', pdfVersion: ' v2 ' };
    expect(validateSongbook(value)).toEqual({ pdfUrl: value.pdfUrl.trim(), pdfTitle: 'New book', pdfVersion: 'v2' });
    expect(validateSongbook({ ...value, pdfUrl: '/songbooks/new.pdf' }).pdfUrl).toBe('/songbooks/new.pdf');
  });
  it('rejects unsafe URLs and invalid descriptor fields', () => {
    const value = { pdfUrl: '/book.pdf', pdfTitle: 'Book', pdfVersion: 'v2' };
    for (const pdfUrl of ['javascript:alert(1)', 'http://example.org/book.pdf', '//example.org/book.pdf', 'book.pdf']) {
      expect(() => validateSongbook({ ...value, pdfUrl })).toThrow();
    }
    for (const change of [{ pdfTitle: ' ' }, { pdfVersion: '' }, { pdfTitle: 'x'.repeat(201) }, { pdfVersion: 'x'.repeat(101) }, { pdfUrl: '/' + 'x'.repeat(2048) }]) {
      expect(() => validateSongbook({ ...value, ...change })).toThrow();
    }
  });
});
