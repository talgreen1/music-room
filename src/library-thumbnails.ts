import { getDocument, GlobalWorkerOptions, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { isPdfFile, type SharedFile } from './sheets';
GlobalWorkerOptions.workerSrc = worker;

/** Small first-page canvas; every loading task and worker is disposed after rendering. */
export async function renderPdfThumbnail(url: string, signal: AbortSignal): Promise<HTMLCanvasElement> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const loading = getDocument({ url });
  let render: RenderTask | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const cancel = () => { render?.cancel(); void loading.destroy().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await loading.promise, page = await pdf.getPage(1);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(240 / original.width, 280 / original.height) });
    canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.setAttribute('aria-hidden', 'true');
    render = page.render({ canvas, viewport }); await render.promise;
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return canvas;
  } catch (error) {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    throw error;
  } finally { signal.removeEventListener('abort', cancel); await loading.destroy().catch(() => {}); }
}

/** Observe cards, bound PDF work to two jobs, release offscreen canvases and cancel on close. */
export function createLibraryThumbnails(root: HTMLElement, render = renderPdfThumbnail) {
  type Item = { host: HTMLElement; file: SharedFile; visible: boolean; queued: boolean; done: boolean; controller?: AbortController };
  const items = new Map<Element, Item>(), queue: Item[] = [];
  let alive = true, active = 0;
  const release = (host: HTMLElement) => {
    host.querySelectorAll('canvas').forEach(canvas => { canvas.width = 0; canvas.height = 0; });
    host.replaceChildren();
  };
  const placeholder = (item: Item) => { release(item.host); item.host.textContent = 'PDF'; item.done = false; };
  function schedule(item: Item) {
    if (!alive || !item.visible || item.queued || item.controller || item.done) return;
    item.queued = true; queue.push(item); pump();
  }
  function pump() {
    while (alive && active < 2 && queue.length) {
      const item = queue.shift()!; item.queued = false;
      if (!item.visible || item.done) continue;
      const controller = new AbortController(); item.controller = controller; active++;
      void render((item.file as { pdfUrl: string }).pdfUrl, controller.signal).then(canvas => {
        if (!alive || controller.signal.aborted || !item.visible) { canvas.width = 0; canvas.height = 0; return; }
        release(item.host); item.host.append(canvas); item.done = true;
      }).catch(() => {
        if (alive && item.visible && !controller.signal.aborted) { item.host.textContent = 'Preview unavailable'; item.done = true; }
      }).finally(() => {
        active--; item.controller = undefined;
        if (alive && item.visible && !item.done) schedule(item);
        pump();
      });
    }
  }
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const item = items.get(entry.target); if (!item || !alive) continue;
      item.visible = entry.isIntersecting;
      if (item.visible) schedule(item);
      else { item.controller?.abort(); placeholder(item); }
    }
  }, { root, rootMargin: '120px' });
  return {
    add(file: SharedFile, host: HTMLElement) {
      if (!alive) return;
      host.className = 'library-thumbnail'; host.setAttribute('aria-hidden', 'true');
      const item: Item = { host, file, visible: !observer, queued: false, done: false }; items.set(host, item);
      if (!isPdfFile(file)) {
        const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
        image.onerror = () => { if (alive) { host.textContent = 'Preview unavailable'; } };
        image.src = file.segments[0].url; host.append(image);
      } else { placeholder(item); if (observer) observer.observe(host); else schedule(item); }
    },
    destroy() {
      if (!alive) return; alive = false; observer?.disconnect(); queue.length = 0;
      for (const item of items.values()) {
        item.controller?.abort();
        item.host.querySelectorAll('img').forEach(image => { image.onerror = null; image.removeAttribute('src'); });
        release(item.host);
      }
      items.clear();
    }
  };
}
