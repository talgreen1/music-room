import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { resolvePdfLink } from './pdf-links';
import type { SearchBlock } from './search';
GlobalWorkerOptions.workerSrc = worker;
type TextItem = { str: string; dir?: string; transform: number[]; width: number; height: number; hasEOL: boolean };
export function joinTextItems(items: TextItem[]) {
  let text = '', previous: TextItem | undefined;
  for (const item of items) {
    if (!item.str) continue;
    if (previous && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const gap = previous.dir === 'rtl' && item.dir === 'rtl' ? previous.transform[4] - item.transform[4] - item.width : item.transform[4] - previous.transform[4] - previous.width;
      if (gap > Math.max(1, Math.min(previous.height, item.height) * .15) || Math.abs(previous.transform[5] - item.transform[5]) > 2) text += ' ';
    }
    text += item.str; previous = item;
  }
  return text.replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
}
const aborted = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException('Search cancelled.', 'AbortError'); };

/** Search index contains text and coordinates only; no canvases or PDF bytes. */
export async function extractPdfSearch(pdf: PDFDocumentProxy, signal: AbortSignal, progress: (page: number, total: number) => void): Promise<SearchBlock[]> {
  const blocks: SearchBlock[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    aborted(signal); const page = await pdf.getPage(n), viewport = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.filter(item => 'str' in item) as TextItem[];
    const consumed = new Set<TextItem>();
    for (const link of await page.getAnnotations()) {
      if (link.subtype !== 'Link' || !link.dest || !Array.isArray(link.rect)) continue;
      const [left, bottom, right, top] = link.rect;
      const inside = items.filter(item => item.str.trim() && item.transform[4] + item.width / 2 >= left - 1 && item.transform[4] + item.width / 2 <= right + 1 && item.transform[5] >= bottom - 1 && item.transform[5] <= top + 1);
      const text = joinTextItems(inside);
      if (!text) continue;
      try {
        const target = await resolvePdfLink(pdf, link.dest); aborted(signal);
        blocks.push({ page: n, offset: 0, text, target }); inside.forEach(item => consumed.add(item));
      } catch (error) { aborted(signal); /* Unresolvable links remain searchable as ordinary text. */ }
    }
    let line: TextItem[] = [];
    const flush = () => {
      const text = joinTextItems(line);
      if (text) blocks.push({ page: n, offset: Math.max(0, Math.min(1, viewport.convertToViewportPoint(0, line[0].transform[5] + line[0].height)[1] / viewport.height)), text });
      line = [];
    };
    for (const item of items) { if (consumed.has(item)) continue; if (item.str.trim()) line.push(item); if (item.hasEOL) flush(); }
    flush(); aborted(signal); progress(n, pdf.numPages);
    // Let touch input, cancellation and progressive results repaint on phones.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return blocks;
}

let cacheDb: Promise<IDBDatabase | undefined> | undefined;
function database() {
  return cacheDb ||= new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(undefined); return; }
    const request = indexedDB.open('music-room-search-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pdfs');
    request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(undefined); request.onblocked = () => resolve(undefined);
  });
}
async function cached(url: string): Promise<SearchBlock[] | undefined> {
  const db = await database(); if (!db) return;
  return new Promise(resolve => { try { const req = db.transaction('pdfs').objectStore('pdfs').get(url); req.onsuccess = () => resolve(req.result && Date.now() - req.result.savedAt < 86400000 ? req.result.blocks : undefined); req.onerror = () => resolve(undefined); } catch { resolve(undefined); } });
}
async function store(url: string, blocks: SearchBlock[]) {
  const db = await database(); if (!db) return;
  // Cache errors never prevent searching (private browsing/quota limits).
  try {
    const transaction = db.transaction('pdfs', 'readwrite'), records = transaction.objectStore('pdfs');
    records.put({ blocks, savedAt: Date.now() }, url);
    const request = records.getAllKeys();
    request.onsuccess = () => { const keys = request.result; if (keys.length > 20) for (const key of keys.filter(key => key !== url).slice(0, keys.length - 20)) records.delete(key); };
  } catch { /* Fall back to reading the PDF next time. */ }
}
export async function searchPdfIndex(url: string, signal: AbortSignal, progress: (page: number, total: number) => void) {
  aborted(signal); const existing = await cached(url); aborted(signal); if (existing) return existing;
  const task = getDocument({ url });
  const cancel = () => { void task.destroy(); }; signal.addEventListener('abort', cancel, { once: true });
  try { const pdf = await task.promise; const blocks = await extractPdfSearch(pdf, signal, progress); aborted(signal); await store(url, blocks); return blocks; }
  finally { signal.removeEventListener('abort', cancel); await task.destroy(); }
}
