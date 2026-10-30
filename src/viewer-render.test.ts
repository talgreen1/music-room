// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ callbacks: undefined as any }));
vi.mock('./gestures', () => ({ PdfGestures: class {
  constructor(_host: HTMLElement, callbacks: unknown) { h.callbacks = callbacks; }
  cancel() { h.callbacks.end(); h.callbacks.pinchEnd(); }
  destroy() {}
} }));
import { SongbookViewer } from './viewer';
let viewer: SongbookViewer;
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('devicePixelRatio', 2); });
afterEach(() => { viewer?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture() {
  const host = document.createElement('div'); Object.defineProperty(host, 'clientWidth', { value: 224 });
  viewer = new SongbookViewer(host); const state = viewer as any;
  const page = document.createElement('div'); page.style.width = '100px';
  Object.defineProperty(page, 'clientWidth', { get: () => parseFloat(page.style.width) }); host.append(page);
  Object.defineProperties(page, { offsetWidth: { configurable: true, get: () => page.clientWidth }, offsetHeight: { configurable: true, get: () => page.clientWidth * 1.5 } });
  const old = document.createElement('canvas'); old.dataset.renderWidth = '100'; page.append(old);
  let complete!: () => void, fail!: (error: Error) => void, replacement!: HTMLCanvasElement;
  const cancel = vi.fn();
  const pdfPage = { getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale }),
    render: vi.fn(({ canvas }) => { replacement = canvas; return { cancel, promise: new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }) }; }) };
  const pdf = { getPage: vi.fn(async () => pdfPage) };
  Object.assign(state, { pdf, pages: [page], ratios: [1.5], visible: new Set([0]), links: new Map([[0, Promise.resolve()]]) });
  return { state, page, old, pdfPage, pdf, cancel, complete: () => complete(), completion: () => complete, fail: () => fail(new Error('test render failure')), replacement: () => replacement };
}
it('keeps the displayed canvas through zoom and swaps only after its replacement finishes', async () => {
  const t = fixture(); t.state.layout(); await vi.advanceTimersByTimeAsync(120);
  expect(t.pdfPage.render).toHaveBeenCalledOnce(); expect(t.page.querySelector('canvas')).toBe(t.old);
  expect(t.replacement().isConnected).toBe(false);
  expect(t.replacement().width * t.replacement().height).toBeLessThanOrEqual(4000000);
  t.complete(); await vi.advanceTimersByTimeAsync(0);
  expect(t.page.querySelector('canvas')).toBe(t.replacement()); expect(t.page.querySelectorAll('canvas')).toHaveLength(1);
  await t.state.render(0); expect(t.pdfPage.render).toHaveBeenCalledOnce();
});
it('retains the old canvas after a render error and permits retry', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const t = fixture(); t.page.style.width = '200px'; const work = t.state.render(0); await Promise.resolve();
  t.fail(); await work; expect(t.page.querySelector('canvas')).toBe(t.old);
  expect(t.page.querySelector('.page-render-error')).not.toBeNull();
  const retry = t.state.render(0); await Promise.resolve(); t.complete(); await retry;
  expect(t.page.querySelector('canvas')).toBe(t.replacement()); expect(t.page.querySelector('.page-render-error')).toBeNull();
});
it('does not render during a held pinch or apply a canceled obsolete replacement', async () => {
  const t = fixture(); t.page.style.width = '200px'; const work = t.state.render(0); await Promise.resolve();
  t.state.pinching = true; t.state.layout(); expect(t.cancel).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000); expect(t.pdfPage.render).toHaveBeenCalledOnce();
  t.complete(); await work; expect(t.page.querySelector('canvas')).toBe(t.old);
  t.state.pinching = false; t.state.scheduleRender(); await vi.advanceTimersByTimeAsync(120);
  t.complete(); await vi.advanceTimersByTimeAsync(0); expect(t.page.querySelector('canvas')).toBe(t.replacement());
});
it('retains canvases through transient pinch visibility changes and evicts them afterward', async () => {
  let observe!: IntersectionObserverCallback;
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { observe = callback; } observe() {} disconnect() {} });
  const t = fixture(); t.state.observePages(); t.page.dataset.page = '1'; t.state.pinching = true;
  observe([{ target: t.page, isIntersecting: false }] as any, {} as any);
  expect(t.state.visible.size).toBe(0); expect(t.page.querySelector('canvas')).toBe(t.old);
  t.state.pinching = false; t.state.scheduleRender(); await vi.advanceTimersByTimeAsync(120);
  expect(t.page.querySelector('canvas')).toBeNull();
});
it('flushes the last coalesced zoom before publishing the end position and drops canceled gesture input', () => {
  const t = fixture(), positions = vi.fn(), ended = vi.fn(() => viewer.position());
  viewer.onPosition = positions; viewer.onPinchEnd = ended;
  h.callbacks.pinchStart(); h.callbacks.zoom(2, { x: 10, y: 10 }, { x: 10, y: 10 }); h.callbacks.zoom(1.5, { x: 10, y: 10 }, { x: 20, y: 20 });
  expect(positions).not.toHaveBeenCalled(); h.callbacks.end(); h.callbacks.pinchEnd();
  expect(positions).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 3 }), false);
  expect(ended.mock.results[0].value?.zoom).toBe(3);
  positions.mockClear(); h.callbacks.pinchStart(); h.callbacks.zoom(.5, { x: 10, y: 10 }, { x: 10, y: 10 });
  viewer.cancelGesture(); expect(viewer.position()?.zoom).toBe(3); expect(positions).not.toHaveBeenCalled();
});
it('reuses measured page geometry between scrolls and remeasures after a layout change', () => {
  const t = fixture(), height = vi.spyOn(t.page, 'offsetHeight', 'get');
  viewer.position(); viewer.position(); expect(height).toHaveBeenCalledOnce();
  t.state.layout(); viewer.position(); expect(height).toHaveBeenCalledTimes(2);
});
it('cannot attach a completed old-source render after a source reset', async () => {
  const t = fixture(); t.page.style.width = '200px'; const work = t.state.render(0); await Promise.resolve();
  t.state.resetSource(); t.complete(); await work;
  expect(t.replacement().parentElement).toBeNull(); expect(t.state.pages).toHaveLength(0);
});
it('keeps image-sheet tiles through pinch layout and does not reload an existing tile', async () => {
  const t = fixture(); t.old.remove(); t.state.pdf = undefined; t.state.sheet = { segments: [{ url: '/tile.jpg' }] };
  await t.state.render(0); const image = t.page.querySelector('img'); expect(image?.getAttribute('src')).toBe('/tile.jpg');
  t.state.pinching = true; t.state.layout(); await vi.advanceTimersByTimeAsync(500);
  expect(t.page.querySelector('img')).toBe(image);
  t.state.pinching = false; t.state.scheduleRender(); await vi.advanceTimersByTimeAsync(120);
  expect(t.page.querySelector('img')).toBe(image); expect(t.page.querySelectorAll('img')).toHaveLength(1);
});
it('can restart a canceled render immediately when a page leaves and reenters the nearby range', async () => {
  let observe!: IntersectionObserverCallback;
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { observe = callback; } observe() {} disconnect() {} });
  const t = fixture(); t.state.observePages(); t.page.dataset.page = '1'; t.page.style.width = '200px';
  const oldWork = t.state.render(0); await Promise.resolve(); const finishOld = t.completion();
  // Capture the first completion before render() creates the second one.
  const oldTask = t.state.tasks.get(0);
  observe([{ target: t.page, isIntersecting: false }] as any, {} as any);
  expect(t.state.tasks.has(0)).toBe(false);
  observe([{ target: t.page, isIntersecting: true }] as any, {} as any); await Promise.resolve();
  expect(t.pdfPage.render).toHaveBeenCalledTimes(2); expect(t.state.tasks.get(0)).not.toBe(oldTask);
  t.complete(); await vi.advanceTimersByTimeAsync(0); expect(t.page.querySelector('canvas')).toBe(t.replacement());
  // A real PDF.js cancellation rejects. Resolve an ignored cancellation too:
  // task identity must prevent the old canvas from replacing the current one.
  const current = t.page.querySelector('canvas'); finishOld(); await oldWork;
  expect(t.page.querySelector('canvas')).toBe(current);
});
it('shows a cached preview during pinch layout and keeps it until a detailed replacement finishes', async () => {
  const t = fixture(); t.old.remove(); const preview = document.createElement('canvas'); preview.dataset.preview = 'true';
  const cache = { entries: () => new Map([[0, preview]]).entries(), setPaused: vi.fn(), update: vi.fn(), remember: vi.fn(), dispose: vi.fn() };
  t.state.previews = cache; t.state.pinching = true; t.state.layout();
  expect(t.page.querySelector('canvas')).toBe(preview); expect(cache.setPaused).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(500); expect(t.pdfPage.render).not.toHaveBeenCalled();
  t.state.pinching = false; t.state.scheduleRender(); await vi.advanceTimersByTimeAsync(120);
  expect(t.page.querySelector('canvas')).toBe(preview);
  t.complete(); await vi.advanceTimersByTimeAsync(0);
  expect(t.page.querySelector('canvas')).toBe(t.replacement()); expect(cache.remember).toHaveBeenCalledWith(0, t.replacement());
  expect(cache.setPaused).toHaveBeenLastCalledWith(false);
});
it('selects bounded nearby pages for previews and disposes them on source reset', () => {
  const t = fixture(), cache = { entries: () => new Map().entries(), setPaused: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  t.state.previews = cache; t.state.visible = new Set([10]); t.state.updatePreviews();
  expect(cache.update).toHaveBeenCalledWith([10, 9, 11, 8, 12]);
  t.state.resetSource(); expect(cache.dispose).toHaveBeenCalledOnce(); expect(t.state.previews).toBeUndefined();
});
it('pauses preview work while dragging and resumes after release', () => {
  const t = fixture(), cache = { entries: () => new Map().entries(), setPaused: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  t.state.previews = cache; h.callbacks.start();
  expect(cache.setPaused).toHaveBeenLastCalledWith(true); t.state.scheduleRender();
  expect(cache.setPaused).toHaveBeenLastCalledWith(true);
  h.callbacks.end(); expect(cache.setPaused).toHaveBeenLastCalledWith(false);
});
