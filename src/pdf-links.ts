import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Resolve named destinations and PDF object references to our reading coordinates. */
export async function resolvePdfLink(pdf: PDFDocumentProxy, destination: unknown) {
  const dest = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  if (!Array.isArray(dest) || !dest.length) throw new Error('This PDF link has no destination.');
  const ref = dest[0];
  const index = Number.isInteger(ref) ? ref : ref && Number.isInteger(ref.num) && Number.isInteger(ref.gen)
    ? await pdf.getPageIndex(ref) : -1;
  if (index < 0 || index >= pdf.numPages) throw new Error('This PDF link points to an unavailable page.');
  const page = await pdf.getPage(index + 1);
  const viewport = page.getViewport({ scale: 1 });
  const kind = dest[1]?.name;
  const top = kind === 'XYZ' ? dest[3] : kind === 'FitH' || kind === 'FitBH' ? dest[2] : null;
  // PDF coordinates start at the bottom; viewport coordinates start at the top.
  const offset = typeof top === 'number' && Number.isFinite(top)
    ? Math.max(0, Math.min(1, viewport.convertToViewportPoint(0, top)[1] / viewport.height)) : 0;
  return { page: index + 1, offset };
}
