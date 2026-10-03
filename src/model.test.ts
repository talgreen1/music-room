import { describe, expect, it } from 'vitest';
import { horizontalLeft, horizontalOffset, locatePosition, normalizePosition, positionTop, roomCode, validCode } from './model';
describe('page-relative coordinates', () => {
  it('aligns mixed page sizes across different screen widths', () => {
    const position = locatePosition([12, 1024, 1736], [1000, 700, 1200], 1374);
    expect(position).toEqual({ page: 2, offset: .5, zoom: 1, horizontal: 0 });
    expect(positionTop(position, [12, 524, 886], [500, 350, 600])).toBe(699);
  });
  it('clamps gaps and beginning of document', () => {
    expect(locatePosition([12, 1024], [1000, 700], 1020).offset).toBe(1);
    expect(locatePosition([12], [1000], 0).offset).toBe(0);
  });
  it('rejects nonfinite state and clamps zoom and offset', () => {
    expect(normalizePosition({ page: NaN, offset: Infinity, zoom: NaN, horizontal: NaN })).toEqual({ page: 1, offset: 0, zoom: 1, horizontal: 0 });
    expect(normalizePosition({ page: -9, offset: 3, zoom: 5, horizontal: 2 })).toEqual({ page: 1, offset: 1, zoom: 4, horizontal: 1 });
  });
  it('maps horizontal travel across screen sizes and handles old rooms', () => {
    const horizontal = horizontalOffset(300, 1200, 600);
    expect(horizontal).toBe(.5);
    expect(horizontalLeft({ page: 1, offset: 0, zoom: 2, horizontal }, 800, 400)).toBe(200);
    expect(horizontalLeft({ page: 1, offset: 0, zoom: 1 }, 800, 400)).toBe(0);
    expect(horizontalOffset(0, 400, 400)).toBe(0);
    expect(horizontalLeft({ page: 1, offset: 0, zoom: 2, horizontal: 1 }, 400, 600)).toBe(0);
    expect(horizontalOffset(-20, 800, 400)).toBe(0);
  });
  it('generates and validates six digit room codes', () => {
    for (let i = 0; i < 100; i++) expect(validCode(roomCode())).toBe(true);
    expect(validCode('12345')).toBe(false); expect(validCode('abcdef')).toBe(false);
  });
});
