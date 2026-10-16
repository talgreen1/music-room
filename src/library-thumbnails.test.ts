// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: {} }));
import { createLibraryThumbnails, renderPdfThumbnail } from './library-thumbnails';
let intersect: (entries: { target: Element; isIntersecting: boolean }[]) => void;
const disconnect = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} disconnect = disconnect; });
});
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
const file = { id: 'a'.repeat(32), title: 'Song', pdfUrl: '/song.pdf' };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
describe('bounded library thumbnail rendering', () => {
  it('loads PDFs lazily, limits work to two and cancels/releases offscreen and closed cards', async () => {
    const jobs: { resolve: (canvas: HTMLCanvasElement) => void; signal: AbortSignal }[] = [];
    const render = vi.fn((_url: string, signal: AbortSignal) => new Promise<HTMLCanvasElement>(resolve => jobs.push({ resolve, signal })));
    const previews = createLibraryThumbnails(document.body, render), hosts = Array.from({ length: 3 }, () => document.createElement('span'));
    hosts.forEach(host => { document.body.append(host); previews.add(file, host); }); expect(render).not.toHaveBeenCalled();
    intersect(hosts.map(target => ({ target, isIntersecting: true }))); expect(render).toHaveBeenCalledTimes(2);
    const canvas = document.createElement('canvas'); jobs[0].resolve(canvas); await flush(); expect(hosts[0].contains(canvas)).toBe(true); expect(render).toHaveBeenCalledTimes(3);
    intersect([{ target: hosts[0], isIntersecting: false }]); expect(canvas.width).toBe(0); expect(hosts[0].querySelector('canvas')).toBeNull();
    previews.destroy(); expect(jobs[1].signal.aborted).toBe(true); expect(disconnect).toHaveBeenCalled();
    const stale = document.createElement('canvas'); jobs[1].resolve(stale); jobs[2].resolve(document.createElement('canvas')); await flush();
    expect(stale.width).toBe(0); expect(hosts[1].querySelector('canvas')).toBeNull();
  });
  it('uses the first image tile with native lazy loading and has a selectable-card fallback on error', () => {
    const render = vi.fn(), previews = createLibraryThumbnails(document.body, render), host = document.createElement('span');
    previews.add({ id: file.id, title: 'Images', segments: [{ url: '/first.jpg', width: 900, height: 1200 }, { url: '/second.jpg', width: 900, height: 1200 }] }, host);
    const image = host.querySelector('img')!; expect(image.getAttribute('src')).toBe('/first.jpg'); expect(image.loading).toBe('lazy'); expect(render).not.toHaveBeenCalled();
    image.dispatchEvent(new Event('error')); expect(host.textContent).toBe('Preview unavailable'); previews.destroy();
  });
  it('falls back after a PDF error and works without IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const render = vi.fn().mockRejectedValue(new Error('Unavailable')), host = document.createElement('span');
    const previews = createLibraryThumbnails(document.body, render); previews.add(file, host); await flush();
    expect(host.textContent).toBe('Preview unavailable'); expect(render).toHaveBeenCalledOnce(); previews.destroy();
  });
  it('renders only the first PDF page within the thumbnail bounds and destroys its document', async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
    const getPage = vi.fn(async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 900 * scale }), render }));
    const destroy = vi.fn().mockResolvedValue(undefined); pdf.getDocument.mockReturnValue({ promise: Promise.resolve({ getPage }), destroy });
    const canvas = await renderPdfThumbnail('/song.pdf', new AbortController().signal);
    expect(getPage).toHaveBeenCalledWith(1); expect(canvas.width).toBeLessThanOrEqual(240); expect(canvas.height).toBeLessThanOrEqual(280);
    expect(render).toHaveBeenCalledOnce(); expect(destroy).toHaveBeenCalledOnce();
  });
  it('destroys pending PDF loading when the dialog or view is cancelled', async () => {
    let reject!: (reason: Error) => void;
    const destroy = vi.fn(async () => { reject(new Error('Cancelled')); });
    pdf.getDocument.mockReturnValue({ promise: new Promise((_resolve, failure) => { reject = failure; }), destroy });
    const controller = new AbortController();
    const result = renderPdfThumbnail('/slow.pdf', controller.signal);
    const expected = expect(result).rejects.toThrow('Cancelled'); controller.abort(); await expected;
    expect(destroy).toHaveBeenCalled();
  });
});
