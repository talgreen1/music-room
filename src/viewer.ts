import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { locatePosition, positionTop, type Position } from './model';
GlobalWorkerOptions.workerSrc = worker;
export class SongbookViewer {
  private pdf?: PDFDocumentProxy;
  private loading?: PDFDocumentLoadingTask;
  private destroyed = false;
  private pages: HTMLDivElement[] = [];
  private ratios: number[] = [];
  private observer?: IntersectionObserver;
  private tasks = new Map<number, RenderTask>();
  private visible = new Set<number>();
  private zoom = 1;
  private frame = 0;
  private target?: number;
  private generation = 0;
  private resizeObserver: ResizeObserver;
  onPosition?: (position: Position) => void;
  onPage?: (page: number) => void;
  constructor(private host: HTMLElement) {
    host.addEventListener('scroll', () => { const position = this.position(); if (position) { this.onPage?.(position.page); this.onPosition?.(position); } }, { passive: true });
    host.addEventListener('touchstart', () => { if (!this.target) cancelAnimationFrame(this.frame); }, { passive: true });
    this.resizeObserver = new ResizeObserver(() => { if (this.pdf) { const position = this.position(); this.layout(); if (position) this.follow(position, true); } });
    this.resizeObserver.observe(host);
  }
  get count() { return this.pdf?.numPages || 0; }
  async load(url: string) {
    this.host.innerHTML = '<div class="viewer-message">Opening your songbook…</div>';
    this.loading = getDocument({ url });
    this.pdf = await this.loading.promise;
    if (this.destroyed) return;
    this.host.innerHTML = ''; this.pages = []; this.ratios = [];
    for (let n = 1; n <= this.pdf.numPages; n++) {
      const page = await this.pdf.getPage(n); const viewport = page.getViewport({ scale: 1 });
      if (this.destroyed) return;
      const element = document.createElement('div'); element.className = 'pdf-page'; element.dataset.page = String(n);
      element.setAttribute('aria-label', `Songbook page ${n}`);
      element.innerHTML = `<span class="page-placeholder">${n}</span>`;
      this.ratios.push(viewport.height / viewport.width); this.pages.push(element); this.host.append(element);
    }
    this.layout();
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.page) - 1;
        if (entry.isIntersecting) { this.visible.add(index); void this.render(index); }
        else { this.visible.delete(index); this.tasks.get(index)?.cancel(); this.pages[index].querySelector('canvas')?.remove(); }
      }
    }, { root: this.host, rootMargin: '700px' });
    this.pages.forEach(page => this.observer!.observe(page));
  }
  private layout() {
    this.generation++; this.tasks.forEach(task => task.cancel()); this.tasks.clear();
    const width = Math.max(200, Math.min(this.host.clientWidth - 24, 1000)) * this.zoom;
    this.pages.forEach((page, index) => { page.style.width = `${width}px`; page.style.height = `${width * this.ratios[index]}px`; page.querySelector('canvas')?.remove(); });
    this.visible.forEach(index => void this.render(index));
  }
  private async render(index: number) {
    const generation = this.generation;
    const element = this.pages[index];
    if (!this.pdf || this.tasks.has(index) || element.querySelector('canvas')) return;
    const page = await this.pdf.getPage(index + 1);
    if (generation !== this.generation || !this.visible.has(index) || this.tasks.has(index) || element.querySelector('canvas')) return;
    const viewport = page.getViewport({ scale: element.clientWidth / page.getViewport({ scale: 1 }).width });
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4000000 / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas'); canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
    element.append(canvas);
    const task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }); this.tasks.set(index, task);
    try { await task.promise; } catch (error) { canvas.remove(); if ((error as Error).name !== 'RenderingCancelledException') console.error(error); }
    finally { if (this.tasks.get(index) === task) this.tasks.delete(index); }
  }
  private geometry() { return { tops: this.pages.map(page => page.offsetTop), heights: this.pages.map(page => page.offsetHeight) }; }
  position(): Position | undefined {
    if (!this.pages.length) return;
    const { tops, heights } = this.geometry();
    return { ...locatePosition(tops, heights, this.host.scrollTop), zoom: this.zoom };
  }
  setZoom(value: number) {
    const position = this.position(); this.zoom = Math.max(.75, Math.min(2, value)); this.layout();
    if (position) this.follow({ ...position, zoom: this.zoom }, true);
    const next = this.position(); if (next) this.onPosition?.(next);
  }
  jump(page: number) { this.follow({ page: Math.max(1, Math.min(this.count, page)), offset: 0, zoom: this.zoom }, true); const p = this.position(); if (p) { this.onPage?.(p.page); this.onPosition?.(p); } }
  follow(position: Position, immediate = false) {
    if (!this.pages.length) return;
    if (this.zoom !== position.zoom) { this.zoom = position.zoom; this.layout(); }
    const { tops, heights } = this.geometry();
    this.target = Math.min(Math.max(0, positionTop(position, tops, heights)), this.host.scrollHeight - this.host.clientHeight);
    cancelAnimationFrame(this.frame);
    if (immediate) { this.host.scrollTop = this.target; this.target = undefined; return; }
    let previous = performance.now();
    const animate = (now: number) => {
      if (this.target === undefined) return;
      const delta = this.target - this.host.scrollTop;
      if (Math.abs(delta) < 1.5) { this.host.scrollTop = this.target; this.target = undefined; return; }
      const step = delta * (1 - Math.exp(-Math.min(now - previous, 64) / 45));
      this.host.scrollTop += Math.abs(step) < 1 ? Math.sign(delta) : step; previous = now;
      this.frame = requestAnimationFrame(animate);
    };
    this.frame = requestAnimationFrame(animate);
  }
  cancelFollow() { cancelAnimationFrame(this.frame); this.target = undefined; }
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
  destroy() { this.destroyed = true; cancelAnimationFrame(this.frame); this.observer?.disconnect(); this.resizeObserver.disconnect(); this.tasks.forEach(task => task.cancel()); void this.loading?.destroy(); }
}
