import type { SharedFile } from './sheets';
export interface Position { page: number; offset: number; zoom: number; horizontal?: number; sequence?: number; updatedAt?: number; sourceId?: string }
export interface Room { masterId: string; pdfUrl: string; pdfVersion: string; pdfTitle: string; createdAt: number; expiresAt: number; position: Position; sheet?: SharedFile }
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 4;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, finite(zoom, 1)));
export const normalizePosition = (p: Position): Position => ({ page: Math.max(1, Math.floor(finite(p.page, 1))), offset: Math.max(0, Math.min(1, finite(p.offset, 0))), zoom: clampZoom(p.zoom), horizontal: Math.max(0, Math.min(1, finite(p.horizontal ?? 0, 0))) });
export const horizontalOffset = (scrollLeft: number, scrollWidth: number, viewportWidth: number) => Math.max(0, Math.min(1, scrollLeft / Math.max(1, scrollWidth - viewportWidth)));
export const horizontalLeft = (position: Position, scrollWidth: number, viewportWidth: number) => normalizePosition(position).horizontal! * Math.max(0, scrollWidth - viewportWidth);
export interface ReadingTarget { position: Position; top: number }
export function locatePosition(tops: number[], heights: number[], scrollTop: number, settled?: ReadingTarget): Position {
  if (!tops.length) return { page: 1, offset: 0, zoom: 1 };
  // A completed jump can be rounded by the browser or clamped at the document
  // end. Keep its reading anchor until scrolling moves away from that location.
  if (settled && Math.abs(scrollTop - settled.top) <= 1) {
    const position = normalizePosition(settled.position);
    return { ...position, page: Math.min(position.page, tops.length) };
  }
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
