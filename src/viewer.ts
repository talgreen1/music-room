// Use the matching compatibility bundles in both realms: page rendering uses
// newer APIs (e.g. Promise.try) that some phone browsers have not implemented.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask, type PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { clampZoom, horizontalOffset, horizontalLeft, locatePosition, positionTop, type Position, type ReadingTarget } from './model';
import { PdfGestures, type Point } from './gestures';
import { resolvePdfLink } from './pdf-links';
import { validateSheet, type ImageSheet } from './sheets';
GlobalWorkerOptions.workerSrc = worker;
export class SongbookViewer {
  private pdf?: PDFDocumentProxy;
  private sheet?: ImageSheet;
  private loading?: PDFDocumentLoadingTask;
  private destroyed = false;
  private pages: HTMLDivElement[] = [];
  private ratios: number[] = [];
  private observer?: IntersectionObserver;
  private tasks = new Map<number, RenderTask>();
  private visible = new Set<number>();
  private links = new Map<number, Promise<void>>();
  private zoom = 1;
  private rtl = true;
  private frame = 0;
  private target?: { top: number; left: number };
  private sharedPosition?: Position;
  private settledPosition?: ReadingTarget;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private gestures: PdfGestures;
  private events = new AbortController();
  private generation = 0;
  private sourceRevision = 0;
  private resizeObserver: ResizeObserver;
  onPosition?: (position: Position) => void;
  onPage?: (page: number) => void;
  onLinkError?: (message: string) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  constructor(private host: HTMLElement) {
    host.addEventListener('scroll', () => this.emitPosition(), { passive: true, signal: this.events.signal });
    this.gestures = new PdfGestures(host, {
      locked: () => host.classList.contains('locked') || (!this.pdf && !this.sheet),
      start: () => { this.onInteractionStart?.(); this.cancelFollow(); },
      end: () => { this.emitPosition(); this.onInteractionEnd?.(); },
      pan: (dx, dy) => { host.scrollLeft += dx; host.scrollTop += dy; this.emitPosition(); },
      zoom: (factor, from, to) => this.zoomAt(this.zoom * factor, from, to)
    });
    host.addEventListener('wheel', event => {
      if (event.ctrlKey || host.classList.contains('locked')) return;
      this.onInteractionStart?.(); this.cancelFollow(); this.onInteractionEnd?.();
    }, { passive: true, signal: this.events.signal });
    host.addEventListener('keydown', event => {
      if (event.target !== host || host.classList.contains('locked') || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
      this.onInteractionStart?.(); this.cancelFollow(); this.onInteractionEnd?.();
    }, { signal: this.events.signal });
    this.resizeObserver = new ResizeObserver(() => {
      if (this.pdf || this.sheet) {
        // A following viewer must retain the Master's coordinates through resize,
        // rather than reinterpret old scroll pixels using its new viewport width.
        const position = host.classList.contains('following') ? this.sharedPosition || this.position() : this.position();
        this.layout(); if (position) this.follow(position, true);
      }
    });
    this.resizeObserver.observe(host);
  }
  get count() { return this.sheet?.segments.length || this.pdf?.numPages || 0; }
  private resetSource() {
    this.sourceRevision++; this.cancelFollow(); this.observer?.disconnect(); this.observer = undefined;
    clearTimeout(this.renderTimer); this.generation++; this.tasks.forEach(task => task.cancel()); this.tasks.clear();
    this.visible.clear(); this.links.clear(); this.pages = []; this.ratios = []; this.sheet = undefined; this.pdf = undefined;
    void this.loading?.destroy(); this.loading = undefined;
    this.zoom = 1; this.host.classList.remove('image-sheet'); this.host.innerHTML = '';
  }
  async loadSheet(value: ImageSheet) {
    this.resetSource(); this.sheet = validateSheet(value); this.host.classList.add('image-sheet');
    this.sheet.segments.forEach((segment, index) => {
      const element = document.createElement('div'); element.className = 'pdf-page'; element.dataset.page = String(index + 1);
      element.setAttribute('aria-label', `Screenshot segment ${index + 1}`);
      this.pages.push(element); this.ratios.push(segment.height / segment.width); this.host.append(element);
    });
    this.layout(); this.observePages();
  }
  async load(url: string) {
    this.resetSource();
    const revision = this.sourceRevision;
    this.host.innerHTML = '<div class="viewer-message">Opening your songbook…</div>';
    this.loading = getDocument({ url });
    const pdf = await this.loading.promise;
    if (this.destroyed || revision !== this.sourceRevision) return;
    this.pdf = pdf;
    this.host.innerHTML = ''; this.pages = []; this.ratios = [];
    for (let n = 1; n <= this.pdf.numPages; n++) {
      const page = await pdf.getPage(n); const viewport = page.getViewport({ scale: 1 });
      if (this.destroyed || revision !== this.sourceRevision) return;
      const element = document.createElement('div'); element.className = 'pdf-page'; element.dataset.page = String(n);
      element.setAttribute('aria-label', `Songbook page ${n}`);
      element.innerHTML = `<span class="page-placeholder">${n}</span>`;
      this.ratios.push(viewport.height / viewport.width); this.pages.push(element); this.host.append(element);
    }
    this.layout();
    this.observePages();
  }
  private observePages() {
    const revision = this.sourceRevision;
    this.observer = new IntersectionObserver(entries => {
      if (this.destroyed || revision !== this.sourceRevision) return;
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.page) - 1;
        if (entry.isIntersecting) { this.visible.add(index); void this.render(index); }
        else { this.visible.delete(index); this.tasks.get(index)?.cancel(); this.pages[index].querySelector('canvas, img')?.remove(); }
      }
    }, { root: this.host, rootMargin: '700px' });
    this.pages.forEach(page => this.observer!.observe(page));
  }
  private layout() {
    this.generation++; this.tasks.forEach(task => task.cancel()); this.tasks.clear();
    const width = Math.max(200, Math.min(this.host.clientWidth - 24, 1000)) * this.zoom;
    // Scale existing canvases during gestures, then refresh their resolution after
    // zoom settles. Re-rendering on every pointer move causes flicker and backlog.
    this.pages.forEach((page, index) => { page.style.width = `${width}px`; page.style.height = `${width * this.ratios[index]}px`; });
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.generation++; this.tasks.forEach(task => task.cancel()); this.tasks.clear();
      this.pages.forEach(page => page.querySelector('canvas')?.remove());
      this.visible.forEach(index => void this.render(index));
    }, 120);
  }
  private async render(index: number) {
    if (this.sheet) {
      const element = this.pages[index];
      if (element.querySelector('img')) return;
      const image = document.createElement('img'); image.alt = ''; image.draggable = false; image.decoding = 'async';
      image.src = this.sheet.segments[index].url;
      image.onerror = () => { image.remove(); if (!this.destroyed && this.visible.has(index)) { element.textContent = 'Image unavailable. Tap to retry.'; element.onclick = () => { element.textContent = ''; void this.render(index); }; } };
      element.append(image); return;
    }
    // Link regions use percentage coordinates, so they survive canvas refreshes
    // and remain aligned while pinch zoom temporarily scales an existing canvas.
    if (!this.links.has(index)) this.links.set(index, this.addLinks(index));
    const generation = this.generation;
    const element = this.pages[index];
    if (!this.pdf || this.tasks.has(index) || element.querySelector('canvas')) return;
    let canvas: HTMLCanvasElement | undefined;
    let task: RenderTask | undefined;
    try {
      const page = await this.pdf.getPage(index + 1);
      if (generation !== this.generation || !this.visible.has(index) || this.tasks.has(index) || element.querySelector('canvas')) return;
      element.querySelector('.page-render-error')?.remove();
      const viewport = page.getViewport({ scale: element.clientWidth / page.getViewport({ scale: 1 }).width });
      const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4000000 / (viewport.width * viewport.height)));
      canvas = document.createElement('canvas'); canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
      element.append(canvas);
      task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }); this.tasks.set(index, task);
      await task.promise;
    } catch (error) {
      canvas?.remove();
      if (this.destroyed || generation !== this.generation || (error as Error).name === 'RenderingCancelledException') return;
      console.error(error);
      element.querySelector('.page-render-error')?.remove();
      const notice = document.createElement('div'); notice.className = 'page-render-error'; notice.setAttribute('role', 'alert');
      const text = document.createElement('p');
      text.textContent = `Could not display page ${index + 1}: ${error instanceof Error ? error.message : String(error)}`;
      const retry = document.createElement('button'); retry.className = 'secondary'; retry.textContent = 'Retry page';
      retry.onclick = () => { notice.remove(); void this.render(index); };
      notice.append(text, retry); element.append(notice);
    } finally { if (task && this.tasks.get(index) === task) this.tasks.delete(index); }
  }
  private async addLinks(index: number) {
    try {
      if (!this.pdf) return;
      const revision = this.sourceRevision;
      const page = await this.pdf.getPage(index + 1);
      const annotations = await page.getAnnotations({ intent: 'display' });
      if (this.destroyed || revision !== this.sourceRevision) return;
      const viewport = page.getViewport({ scale: 1 });
      const layer = document.createElement('div'); layer.className = 'pdf-links';
      for (const annotation of annotations) {
        if (annotation.subtype !== 'Link' || !annotation.dest || !Array.isArray(annotation.rect)) continue;
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
        const link = document.createElement('a'); link.className = 'pdf-link';
        link.href = '#';
        link.setAttribute('aria-label', annotation.overlaidText ? `Go to song: ${annotation.overlaidText}` : 'Go to linked PDF page');
        Object.assign(link.style, {
          left: `${Math.min(x1, x2) / viewport.width * 100}%`, top: `${Math.min(y1, y2) / viewport.height * 100}%`,
          width: `${Math.abs(x2 - x1) / viewport.width * 100}%`, height: `${Math.abs(y2 - y1) / viewport.height * 100}%`
        });
        link.onclick = async event => {
          event.preventDefault();
          if (this.host.classList.contains('locked') || this.destroyed || !this.pdf) return;
          this.onInteractionStart?.();
          try {
            const destination = await resolvePdfLink(this.pdf, annotation.dest);
            if (this.host.classList.contains('locked') || this.destroyed) return;
            this.cancelFollow();
            this.follow({ ...destination, zoom: this.zoom, horizontal: this.rtl ? 1 : 0 }, true);
          } catch (error) { if (!this.destroyed) this.onLinkError?.(error instanceof Error ? error.message : 'Could not open this PDF link.'); }
          finally { this.onInteractionEnd?.(); }
        };
        layer.append(link);
      }
      this.pages[index].append(layer);
    } catch (error) {
      this.links.delete(index);
      if (!this.destroyed) console.error('Could not load PDF links', error);
    }
  }
  private geometry() { return { tops: this.pages.map(page => page.offsetTop), heights: this.pages.map(page => page.offsetHeight) }; }
  position(): Position | undefined {
    if (!this.pages.length) return;
    const { tops, heights } = this.geometry();
    if (this.settledPosition && Math.abs(this.host.scrollTop - this.settledPosition.top) > 1) this.settledPosition = undefined;
    return { ...locatePosition(tops, heights, this.host.scrollTop, this.settledPosition), zoom: this.zoom, horizontal: horizontalOffset(this.host.scrollLeft, this.host.scrollWidth, this.host.clientWidth) };
  }
  private emitPosition() { const position = this.position(); if (position) { this.onPage?.(position.page); this.onPosition?.(position); } }
  setZoom(value: number) {
    this.cancelFollow();
    const center = { x: this.host.clientWidth / 2, y: this.host.clientHeight / 2 };
    this.zoomAt(value, center, center);
  }
  setRtl(value: boolean) {
    this.rtl = value;
    const position = this.position();
    if (position) {
      this.cancelFollow();
      this.follow({ ...position, horizontal: value ? 1 : 0 }, true);
    }
  }
  private zoomAt(value: number, from: Point, to: Point) {
    if (!this.pages.length) return;
    const { tops, heights } = this.geometry();
    const anchor = locatePosition(tops, heights, this.host.scrollTop + from.y);
    const page = this.pages[anchor.page - 1];
    const horizontalAnchor = (this.host.scrollLeft + from.x - page.offsetLeft) / page.offsetWidth;
    const nextZoom = clampZoom(value);
    if (nextZoom !== this.zoom) { this.zoom = nextZoom; this.layout(); }
    const geometry = this.geometry();
    this.host.scrollTop = positionTop(anchor, geometry.tops, geometry.heights) - to.y;
    this.host.scrollLeft = page.offsetLeft + horizontalAnchor * page.offsetWidth - to.x;
    this.emitPosition();
  }
  jump(page: number) { this.follow({ page: Math.max(1, Math.min(this.count, Math.floor(page))), offset: 0, zoom: this.zoom, horizontal: this.position()?.horizontal }, true); }
  follow(position: Position, immediate = false) {
    if (!this.pages.length) return;
    this.sharedPosition = { ...position };
    this.settledPosition = undefined;
    const zoom = clampZoom(position.zoom);
    if (this.zoom !== zoom) { this.zoom = zoom; this.layout(); }
    const { tops, heights } = this.geometry();
    this.target = {
      top: Math.min(Math.max(0, positionTop(position, tops, heights)), Math.max(0, this.host.scrollHeight - this.host.clientHeight)),
      left: horizontalLeft(position, this.host.scrollWidth, this.host.clientWidth)
    };
    cancelAnimationFrame(this.frame);
    const finish = () => {
      this.host.scrollTop = this.target!.top; this.host.scrollLeft = this.target!.left;
      this.settledPosition = { position: { ...position }, top: this.host.scrollTop };
      this.target = undefined; this.emitPosition();
    };
    if (immediate) { finish(); return; }
    let previous = performance.now();
    const animate = (now: number) => {
      if (this.target === undefined) return;
      const dy = this.target.top - this.host.scrollTop;
      const dx = this.target.left - this.host.scrollLeft;
      if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) { finish(); return; }
      const factor = 1 - Math.exp(-Math.min(now - previous, 64) / 45);
      const step = (delta: number) => Math.abs(delta * factor) < 1 ? Math.sign(delta) : delta * factor;
      this.host.scrollTop += step(dy); this.host.scrollLeft += step(dx); previous = now;
      this.frame = requestAnimationFrame(animate);
    };
    this.frame = requestAnimationFrame(animate);
  }
  cancelFollow() { cancelAnimationFrame(this.frame); this.target = undefined; this.sharedPosition = undefined; this.settledPosition = undefined; }
  async search(query: string): Promise<{ page: number; text: string }[]> {
    if (!this.pdf) return [];
    const matches: { page: number; text: string }[] = [];
    for (let n = 1; n <= this.count; n++) {
      const page = await this.pdf.getPage(n); const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
      const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
      if (index >= 0) matches.push({ page: n, text: text.slice(Math.max(0, index - 25), index + query.length + 65) });
    }
    return matches;
  }
  destroy() { this.destroyed = true; this.events.abort(); this.gestures.destroy(); clearTimeout(this.renderTimer); cancelAnimationFrame(this.frame); this.observer?.disconnect(); this.resizeObserver.disconnect(); this.tasks.forEach(task => task.cancel()); void this.loading?.destroy(); }
}
