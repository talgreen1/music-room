import { describe, expect, it } from 'vitest';
import { findSeam, type Sample } from './stitch';
import { validateSheet, validateJpeg } from './sheets';
function image(start: number, height: number, chrome = 0): Sample {
  const width = 40, pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = y < chrome ? -1 : y >= height - chrome ? -2 : start + y - chrome;
    const value = row < 0 ? (x % 3 ? 80 : 140) : ((row * 71 + x * 29 + row * x * 13) % 251);
    pixels.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
  }
  return { width, height, pixels };
}
describe('automatic screenshot stitching', () => {
  it('finds a textured scrolling overlap', () => { expect(findSeam(image(0, 180), image(110, 180))).toMatchObject({ overlap: 70, confidence: 'matched' }); });
  it('ignores stationary top and bottom browser chrome', () => { expect(findSeam(image(0, 180, 12), image(100, 180, 12))).toMatchObject({ top: 12, bottom: 12, overlap: 56, confidence: 'matched' }); });
  it('keeps unrelated captures intact', () => { expect(findSeam(image(0, 100), image(1000, 100)).confidence).toBe('uncertain'); });
  it('keeps repeated patterns intact when several joins are equally plausible', () => {
    const sample = image(0, 180);
    for (let row = 20; row < sample.height; row++) sample.pixels.copyWithin(row * sample.width * 3, (row % 20) * sample.width * 3, (row % 20 + 1) * sample.width * 3);
    expect(findSeam(sample, sample)).toMatchObject({ overlap: 0, confidence: 'uncertain' });
  });
  it('does not discard matching blank screenshots', () => {
    const sample = { width: 40, height: 180, pixels: new Uint8Array(40 * 180 * 3).fill(255) };
    expect(findSeam(sample, sample)).toMatchObject({ overlap: 0, top: 0, bottom: 0, confidence: 'uncertain' });
  });
  it('rejects malformed image data', () => { expect(() => findSeam(image(0, 100), { ...image(0, 100), pixels: new Uint8Array(3) })).toThrow(); });
  it('bounds shared manifests and excludes executable URLs', () => {
    const sheet = { id: 'a'.repeat(32), title: 'Song', segments: [{ url: '/api/sheets/test.jpg', width: 100, height: 200 }] };
    expect(validateSheet(sheet)).toEqual(sheet);
    expect(() => validateSheet({ ...sheet, segments: [{ ...sheet.segments[0], url: 'javascript:alert(1)' }] })).toThrow();
    expect(() => validateSheet({ ...sheet, segments: Array(41).fill(sheet.segments[0]) })).toThrow();
    expect(() => validateJpeg(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
