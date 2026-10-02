export interface Position { page: number; offset: number; zoom: number; sequence?: number; updatedAt?: number }
export interface Room { masterId: string; pdfUrl: string; pdfVersion: string; pdfTitle: string; createdAt: number; expiresAt: number; position: Position }
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
export const normalizePosition = (p: Position): Position => ({ page: Math.max(1, Math.floor(finite(p.page, 1))), offset: Math.max(0, Math.min(1, finite(p.offset, 0))), zoom: Math.max(0.75, Math.min(2, finite(p.zoom, 1))) });
export function locatePosition(tops: number[], heights: number[], scrollTop: number): Position {
  if (!tops.length) return { page: 1, offset: 0, zoom: 1 };
  let i = 0;
  while (i + 1 < tops.length && tops[i + 1] <= scrollTop) i++;
  return normalizePosition({ page: i + 1, offset: (scrollTop - tops[i]) / heights[i], zoom: 1 });
}
export const positionTop = (p: Position, tops: number[], heights: number[]) => tops[Math.min(p.page, tops.length) - 1] + p.offset * heights[Math.min(p.page, tops.length) - 1];
export function roomCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + values[0] % 900000);
}
export const validCode = (code: string) => /^\d{6}$/.test(code);
