/** Small RGB samples, at a common width, keep matching independent of canvas. */
export interface Sample { width: number; height: number; pixels: Uint8Array }
export interface Seam { top: number; bottom: number; overlap: number; confidence: 'matched' | 'uncertain'; error: number }
function rowError(a: Sample, ay: number, b: Sample, by: number) {
  let sum = 0; let texture = 0;
  const start = Math.floor(a.width * .08), end = Math.ceil(a.width * .92);
  for (let x = start; x < end; x++) {
    const ai = (ay * a.width + x) * 3, bi = (by * b.width + x) * 3;
    for (let c = 0; c < 3; c++) sum += Math.abs(a.pixels[ai + c] - b.pixels[bi + c]);
    if (x > start) texture += Math.abs(a.pixels[ai] - a.pixels[ai - 3]);
  }
  return { error: sum / ((end - start) * 3), texture: texture / (end - start) };
}
/** Detect stationary chrome, then match the longest unambiguous textured overlap.
 * Ambiguous/repeated/blank areas are appended intact rather than losing content. */
export function findSeam(a: Sample, b: Sample): Seam {
  if (a.width !== b.width || a.width < 16 || a.height < 20 || b.height < 20 || a.pixels.length !== a.width * a.height * 3 || b.pixels.length !== b.width * b.height * 3) throw new Error('Invalid stitching samples.');
  const min = Math.min(a.height, b.height), maxBand = Math.floor(min * .23);
  let top = 0, bottom = 0;
  while (top < maxBand && rowError(a, top, b, top).error < 2.5) top++;
  while (bottom < maxBand && rowError(a, a.height - bottom - 1, b, b.height - bottom - 1).error < 2.5) bottom++;
  // A cut-off band has no observed boundary: do not assume it is browser chrome.
  if (top === maxBand || top < 2) top = 0;
  if (bottom === maxBand || bottom < 2) bottom = 0;
  const candidates: { overlap: number; error: number }[] = [];
  const maximum = Math.min(a.height - top - bottom, b.height - top - bottom);
  for (let overlap = Math.max(12, Math.floor(min * .07)); overlap <= maximum; overlap++) {
    let error = 0, rows = 0;
    const start = a.height - bottom - overlap;
    for (let y = 0; y < overlap; y++) {
      const row = rowError(a, start + y, b, top + y);
      if (row.texture > 2) { error += row.error; rows++; }
    }
    if (rows >= Math.max(4, overlap * .08)) candidates.push({ overlap, error: error / rows });
  }
  candidates.sort((x, y) => x.error - y.error || y.overlap - x.overlap);
  const best = candidates[0];
  const competitor = candidates.find(candidate => best && Math.abs(candidate.overlap - best.overlap) > 4);
  if (!best || best.error > 7 || (competitor && competitor.error < best.error + 1.5)) return { top: 0, bottom: 0, overlap: 0, confidence: 'uncertain', error: best?.error ?? 255 };
  return { top, bottom, overlap: best.overlap, confidence: 'matched', error: best.error };
}
