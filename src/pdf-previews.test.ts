// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PdfPreviews, PREVIEW_LIMIT, PREVIEW_PIXELS } from './pdf-previews';
let previews: PdfPreviews;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { previews?.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  const renders: { canvas: HTMLCanvasElement; resolve: () => void; reject: (error: Error) => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 1200 * scale, height: 1800 * scale }),
    render: vi.fn(({ canvas }) => {
      let resolve!: () => void, reject!: (error: Error) => void;
      const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      const cancel = vi.fn(); renders.push({ canvas, resolve, reject, cancel }); return { promise, cancel };
    }) };
  const pdf = { numPages: 40, getPage: vi.fn(async () => page) }, ready = vi.fn();
  previews = new PdfPreviews(pdf as any, ready);
  return { pdf, ready, renders, page };
}
it('prepares a bounded nearby cache one page at a time with small canvases', async () => {
  const t = fixture(); previews.update(Array.from({ length: 40 }, (_, i) => i));
  await vi.advanceTimersByTimeAsync(150); expect(t.renders).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1000); expect(t.renders).toHaveLength(1);
  for (let n = 0; n < PREVIEW_LIMIT; n++) {
    const render = t.renders[n]; expect(render.canvas.width).toBeLessThanOrEqual(256);
    expect(render.canvas.width * render.canvas.height).toBeLessThanOrEqual(PREVIEW_PIXELS);
    render.resolve(); await vi.advanceTimersByTimeAsync(150);
  }
  expect(t.pdf.getPage).toHaveBeenCalledTimes(PREVIEW_LIMIT);
  expect([...previews.entries()]).toHaveLength(PREVIEW_LIMIT); expect(t.ready).toHaveBeenCalledTimes(PREVIEW_LIMIT);
});
it('pauses idle work during a pinch and never attaches a canceled completion after resuming', async () => {
  const t = fixture(); previews.update([0, 1]); previews.setPaused(true);
  await vi.advanceTimersByTimeAsync(1000); expect(t.renders).toHaveLength(0);
  previews.setPaused(false); await vi.advanceTimersByTimeAsync(150);
  previews.setPaused(true); expect(t.renders[0].cancel).toHaveBeenCalledOnce();
  previews.setPaused(false); await vi.advanceTimersByTimeAsync(1000); expect(t.renders).toHaveLength(1);
  t.renders[0].resolve(); await vi.advanceTimersByTimeAsync(150);
  expect(t.ready).not.toHaveBeenCalled(); expect(t.renders).toHaveLength(2);
  t.renders[1].resolve(); await vi.advanceTimersByTimeAsync(0);
  expect([...previews.entries()].map(([index]) => index)).toEqual([0]);
});
it('evicts distant previews and rejects obsolete range/source completions', async () => {
  const t = fixture(); previews.update([0]); await vi.advanceTimersByTimeAsync(150);
  t.renders[0].resolve(); await vi.advanceTimersByTimeAsync(0);
  const old = [...previews.entries()][0][1]; document.body.append(old);
  previews.update([10]); expect(old.isConnected).toBe(false); expect(old.width).toBe(0);
  await vi.advanceTimersByTimeAsync(150); previews.update([20]); expect(t.renders[1].cancel).toHaveBeenCalledOnce(); t.renders[1].resolve();
  await vi.advanceTimersByTimeAsync(150); expect([...previews.entries()]).toHaveLength(0);
  previews.dispose(); expect(t.renders[2].cancel).toHaveBeenCalledOnce(); t.renders[2].resolve();
  await vi.advanceTimersByTimeAsync(1000); expect([...previews.entries()]).toHaveLength(0); expect(t.ready).toHaveBeenCalledOnce();
});
it('reuses a detailed render as a preview and skips duplicate PDF work', async () => {
  const drawImage = vi.fn(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any);
  const t = fixture(); previews.update([0]); const detailed = document.createElement('canvas'); detailed.width = 2000; detailed.height = 3000;
  previews.remember(0, detailed); previews.remember(0, detailed);
  await vi.advanceTimersByTimeAsync(1000); expect(t.pdf.getPage).not.toHaveBeenCalled(); expect(drawImage).toHaveBeenCalledOnce();
  const preview = [...previews.entries()][0][1]; expect(preview.dataset.preview).toBe('true');
  expect(preview.width * preview.height).toBeLessThanOrEqual(PREVIEW_PIXELS);
  previews.remember(9, detailed); expect([...previews.entries()]).toHaveLength(1);
});
it('tolerates preview errors without retry loops or affecting other nearby pages', async () => {
  const t = fixture(); previews.update([0, 1]); await vi.advanceTimersByTimeAsync(150);
  t.renders[0].reject(new Error('bad page')); await vi.advanceTimersByTimeAsync(150);
  expect(t.pdf.getPage).toHaveBeenLastCalledWith(2); t.renders[1].resolve();
  await vi.advanceTimersByTimeAsync(1000); expect(t.renders).toHaveLength(2); expect([...previews.entries()]).toHaveLength(1);
});
it('handles a pinch beginning while the PDF page is still being fetched', async () => {
  const t = fixture(); let loaded!: (value: unknown) => void;
  t.pdf.getPage.mockImplementationOnce(() => new Promise(resolve => { loaded = resolve; }) as any);
  previews.update([0]); await vi.advanceTimersByTimeAsync(150); previews.setPaused(true); loaded(t.page);
  await vi.advanceTimersByTimeAsync(1000); expect(t.renders).toHaveLength(0);
  previews.setPaused(false); await vi.advanceTimersByTimeAsync(150); expect(t.renders).toHaveLength(1);
});
it('bounds previews even for an extremely tall PDF page and ignores duplicate/invalid indices', async () => {
  const t = fixture(); t.page.getViewport = ({ scale }) => ({ width: scale, height: 1e9 * scale });
  previews.update([-1, NaN, 0, 0, 900]); await vi.advanceTimersByTimeAsync(150);
  expect(t.renders[0].canvas.width * t.renders[0].canvas.height).toBeLessThanOrEqual(PREVIEW_PIXELS);
  t.renders[0].resolve(); await vi.advanceTimersByTimeAsync(1000);
  expect(t.pdf.getPage).toHaveBeenCalledExactlyOnceWith(1); expect([...previews.entries()]).toHaveLength(1);
});
