import type { SharedFile } from './sheets';
export interface SearchLocation { page: number; offset: number }
export interface SearchBlock extends SearchLocation { text: string; target?: SearchLocation }
export interface SearchResult { file: SharedFile; location: SearchLocation; snippet: string; kind: 'name' | 'text'; foundPage?: number }

/** Accent/niqqud and punctuation-insensitive literal terms, never query regexes. */
export function normalizeSearch(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function matchesSearch(text: string, query: string) {
  const terms = normalizeSearch(query).split(' ').filter(Boolean), haystack = ` ${normalizeSearch(text)} `;
  return terms.length > 0 && terms.every(term => haystack.includes(term));
}
export function nameResult(file: SharedFile, query: string): SearchResult[] {
  let names = file.fileNames || [];
  if (!names.length && 'pdfUrl' in file) {
    const basename = file.pdfUrl.split(/[?#]/)[0].split('/').pop() || '';
    try { names = [decodeURIComponent(basename)]; } catch { names = [basename]; }
  }
  return matchesSearch([file.title, ...names].join(' '), query)
    ? [{ file, location: { page: 1, offset: 0 }, snippet: names.join(', ') || file.title, kind: 'name' }] : [];
}
export function textResults(file: SharedFile, blocks: SearchBlock[], query: string): SearchResult[] {
  const matches = blocks.filter(block => matchesSearch(block.text, query));
  const matchingPages = new Set(matches.filter(block => !block.target).map(block => block.page));
  // Prefer matching song-page text over index links that open that same page.
  const results = matches.filter(block => !block.target || !matchingPages.has(block.target.page)).map(block => ({ file, location: block.target || { page: block.page, offset: block.offset }, snippet: block.text, kind: 'text' as const, foundPage: block.page }));
  const seen = new Set<string>();
  return results.filter(result => { const key = `${result.location.page}:${result.location.offset.toFixed(3)}:${result.foundPage === result.location.page ? normalizeSearch(result.snippet) : 'index'}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
