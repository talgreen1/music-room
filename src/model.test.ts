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
  it('retains the selected page when a completed jump is rounded below its boundary', () => {
    const tops = [12, 1024], heights = [1000, 700];
    const target = { position: { page: 2, offset: 0, zoom: 1 }, top: 1024 };
    expect(locatePosition(tops, heights, 1023.75).page).toBe(1);
    expect(locatePosition(tops, heights, 1023.75, target).page).toBe(2);
    expect(locatePosition(tops, heights, 1023.75, target).offset).toBe(0);
  });
  it('retains the final-page anchor when a tall viewport clamps a completed jump', () => {
    const tops = [12, 512, 1012], heights = [488, 488, 488];
    const target = { position: { page: 3, offset: 0, zoom: 1 }, top: 800 };
    expect(locatePosition(tops, heights, 800).page).toBe(2);
    expect(locatePosition(tops, heights, 800, target).page).toBe(3);
    expect(positionTop(locatePosition(tops, heights, 800, target), [12, 262, 512], [244, 244, 244])).toBe(512);
    // A real scroll away from the jump resumes geometric reading coordinates.
    expect(locatePosition(tops, heights, 700, target)).toEqual(locatePosition(tops, heights, 700));
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
