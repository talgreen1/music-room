// Simulate a browser missing newer built-ins, then exercise actual PDF rendering.
// Node-only check; @napi-rs/canvas is PDF.js's optional Node canvas dependency.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

delete Promise.try;
delete Promise.withResolvers;
delete Uint8Array.prototype.toBase64;
delete Uint8Array.fromBase64;
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = await import('@napi-rs/canvas');
assert.equal(typeof Promise.try, 'function');
assert.equal(typeof Promise.withResolvers, 'function');
assert.equal(typeof Uint8Array.prototype.toBase64, 'function');
const data = new Uint8Array(await readFile(new URL('../public/songbooks/songbook-2026-10.pdf', import.meta.url)));
const pdf = await getDocument({ data, isOffscreenCanvasSupported: false, isImageDecoderSupported: false }).promise;
try {
  assert.equal(pdf.numPages, 145);
  for (const pageNumber of [1, 73]) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: .6 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let inkPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      // The index contains blue text, so count colored ink as well as black.
      if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 180 && pixels[index + 3] > 0) inkPixels++;
    }
    if (inkPixels <= 1000) {
      await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
      await writeFile(new URL(`../artifacts/pdf-compat-page-${pageNumber}.png`, import.meta.url), canvas.toBuffer('image/png'));
    }
    assert(inkPixels > 1000, `Page ${pageNumber} should contain visible text/score pixels (found ${inkPixels})`);
    console.log(`PASS: page ${pageNumber} renders ${inkPixels} ink pixels with modern built-ins initially absent.`);
  }
} finally { await pdf.destroy(); }
