import { describe, expect, it } from 'vitest';
import { locatePosition, normalizePosition, positionTop, roomCode, validCode } from './model';
describe('page-relative coordinates', () => {
  it('aligns mixed page sizes across different screen widths', () => {
    const position = locatePosition([12, 1024, 1736], [1000, 700, 1200], 1374);
    expect(position).toEqual({ page: 2, offset: .5, zoom: 1 });
    expect(positionTop(position, [12, 524, 886], [500, 350, 600])).toBe(699);
  });
  it('clamps gaps and beginning of document', () => {
    expect(locatePosition([12, 1024], [1000, 700], 1020).offset).toBe(1);
    expect(locatePosition([12], [1000], 0).offset).toBe(0);
  });
  it('rejects nonfinite state and clamps zoom and offset', () => {
    expect(normalizePosition({ page: NaN, offset: Infinity, zoom: NaN })).toEqual({ page: 1, offset: 0, zoom: 1 });
    expect(normalizePosition({ page: -9, offset: 3, zoom: 5 })).toEqual({ page: 1, offset: 1, zoom: 2 });
  });
  it('generates and validates six digit room codes', () => {
    for (let i = 0; i < 100; i++) expect(validCode(roomCode())).toBe(true);
    expect(validCode('12345')).toBe(false); expect(validCode('abcdef')).toBe(false);
  });
});
