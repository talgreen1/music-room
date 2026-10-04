export interface Songbook { pdfUrl: string; pdfVersion: string; pdfTitle: string }
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export function validatePdfUpload(size: number, header: Uint8Array) {
  if (size < 5 || size > MAX_PDF_BYTES) throw new Error('Choose a PDF file up to 30 MB.');
  if (!new TextDecoder().decode(header.slice(0, 1024)).includes('%PDF-')) throw new Error('This file is not a PDF.');
}
export function validateSongbook(value: Songbook): Songbook {
  if (!value || typeof value.pdfUrl !== 'string' || typeof value.pdfVersion !== 'string' || typeof value.pdfTitle !== 'string') throw new Error('Enter the PDF URL, version, and title.');
  const result = { pdfUrl: value.pdfUrl.trim(), pdfVersion: value.pdfVersion.trim(), pdfTitle: value.pdfTitle.trim() };
  if ((!/^https:\/\//.test(result.pdfUrl) && !/^\/(?!\/)/.test(result.pdfUrl)) || result.pdfUrl.length > 2048) throw new Error('Use an HTTPS PDF URL or a local path starting with /.');
  if (!result.pdfVersion || result.pdfVersion.length > 100 || !result.pdfTitle || result.pdfTitle.length > 200) throw new Error('Enter a title and version within the allowed lengths.');
  return result;
}
