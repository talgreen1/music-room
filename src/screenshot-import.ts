import { findSeam, type Sample } from './stitch';
export interface Capture { file: File; name: string; width: number; height: number; top: number; bottom: number; sample: Sample; matched?: boolean }
export interface PreparedSegment { blob: Blob; width: number; height: number }
function canvas(width: number, height: number) { const element = document.createElement('canvas'); element.width = width; element.height = height; return element; }
export async function decodeCapture(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file), image = new Image();
  try { image.src = url; await image.decode(); return image; }
  catch { throw new Error(`Could not read ${file.name}. Use PNG, JPEG or WebP screenshots.`); }
  finally { URL.revokeObjectURL(url); }
}
export async function inspectCaptures(files: File[], progress: (text: string) => void): Promise<Capture[]> {
  if (!files.length || files.length > 20 || files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error('Choose 1–20 screenshots, up to 100 MB in total.');
  const captures: Capture[] = [];
  for (const file of files) {
    progress(`Reading screenshot ${captures.length + 1} / ${files.length}…`);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use PNG, JPEG or WebP screenshots.');
    const image = await decodeCapture(file);
    if (image.naturalWidth < 100 || image.naturalHeight < 100 || image.naturalWidth * image.naturalHeight > 20000000) throw new Error(`${file.name} is too large or too small. Use screenshots up to 20 megapixels.`);
    const height = Math.max(20, Math.min(600, Math.round(image.naturalHeight / image.naturalWidth * 96)));
    const sampleCanvas = canvas(96, height), context = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, 96, height);
    const rgba = context.getImageData(0, 0, 96, height).data, pixels = new Uint8Array(96 * height * 3);
    for (let n = 0; n < pixels.length / 3; n++) for (let c = 0; c < 3; c++) pixels[n * 3 + c] = rgba[n * 4 + c];
    captures.push({ file, name: file.name, width: image.naturalWidth, height: image.naturalHeight, top: 0, bottom: 0, sample: { width: 96, height, pixels } });
    image.src = ''; sampleCanvas.width = 0;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return captures;
}
export async function autoStitch(captures: Capture[], progress: (text: string) => void) {
  captures.forEach(capture => { capture.top = 0; capture.bottom = 0; capture.matched = undefined; });
  for (let n = 1; n < captures.length; n++) {
    progress(`Matching screenshots ${n} and ${n + 1}…`);
    await new Promise(resolve => setTimeout(resolve, 0));
    const a = captures[n - 1], b = captures[n];
    // Different aspect ratios can have different vertical sample scales.
    if (Math.abs(a.width / a.sample.width / (a.height / a.sample.height) - b.width / b.sample.width / (b.height / b.sample.height)) > .1) { b.matched = false; continue; }
    const seam = findSeam(a.sample, b.sample); b.matched = seam.confidence === 'matched';
    if (b.matched) {
      const aScale = a.height / a.sample.height, bScale = b.height / b.sample.height;
      if (n === 1) a.top = Math.round(seam.top * aScale);
      a.bottom = Math.round(seam.bottom * aScale);
      b.top = Math.round((seam.top + seam.overlap) * bScale);
      b.bottom = Math.round(seam.bottom * bScale);
      // Duplicate captures add no content; allow the exporter to omit them.
      b.top = Math.min(b.top, b.height - b.bottom);
    }
  }
}
export async function exportSegments(captures: Capture[], progress: (text: string) => void): Promise<PreparedSegment[]> {
  const width = Math.min(1600, ...captures.map(capture => capture.width)), segments: PreparedSegment[] = [];
  for (let n = 0; n < captures.length; n++) {
    const capture = captures[n];
    const remaining = capture.height - capture.top - capture.bottom;
    if (remaining <= 0) continue;
    progress(`Preparing screenshot ${n + 1} / ${captures.length}…`);
    const image = await decodeCapture(capture.file), scale = width / capture.width;
    const outputHeight = Math.max(1, Math.round(remaining * scale));
    for (let y = 0; y < outputHeight; y += 2048) {
      if (segments.length >= 40) throw new Error('The stitched sheet is too long. Use fewer screenshots.');
      const height = Math.min(2048, outputHeight - y), part = canvas(width, height), context = part.getContext('2d')!;
      context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, capture.top + y / scale, capture.width, height / scale, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => part.toBlob(result => result ? resolve(result) : reject(new Error('Could not prepare the screenshot.')), 'image/jpeg', .9));
      part.width = 0;
      if (blob.size > 3 * 1024 * 1024) throw new Error('A screenshot segment is too large. Use smaller screenshots.');
      segments.push({ blob, width, height });
      if (segments.reduce((sum, segment) => sum + segment.blob.size, 0) > 30 * 1024 * 1024) throw new Error('The sheet exceeds 30 MB. Use fewer or smaller screenshots.');
    }
    image.src = '';
  }
  if (!segments.length) throw new Error('The sheet has no visible content. Check the crop values.');
  return segments;
}
