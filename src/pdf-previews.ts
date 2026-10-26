import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const PREVIEW_LIMIT = 8;
export const PREVIEW_PIXELS = 98304;
/** Small, source-local previews: one idle render at a time, never during a pinch. */
export class PdfPreviews {
  private canvases = new Map<number, HTMLCanvasElement>();
  private wanted = new Set<number>();
  private timer?: ReturnType<typeof setTimeout>;
  private task?: RenderTask;
  private busy = false;
  private activeIndex?: number;
  private paused = false;
  private disposed = false;
  private revision = 0;
  constructor(private pdf: PDFDocumentProxy, private ready: () => void) {}
  update(indices: number[]) {
    if (this.disposed) return;
    this.wanted = new Set([...new Set(indices.filter(index => Number.isInteger(index) && index >= 0 && index < this.pdf.numPages))].slice(0, PREVIEW_LIMIT));
    if (this.activeIndex !== undefined && !this.wanted.has(this.activeIndex)) { this.revision++; this.task?.cancel(); }
    for (const [index, canvas] of this.canvases) if (!this.wanted.has(index)) { canvas.remove(); canvas.width = canvas.height = 0; this.canvases.delete(index); }
    this.schedule();
  }
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) { this.revision++; clearTimeout(this.timer); this.timer = undefined; this.task?.cancel(); }
    else this.schedule();
  }
  entries() { return this.canvases.entries(); }
  /** Reuse a finished detailed render instead of parsing/drawing that PDF twice. */
  remember(index: number, source: HTMLCanvasElement) {
    if (this.disposed || !this.wanted.has(index) || this.canvases.has(index)) return;
    const canvas = this.canvas(source.width, source.height);
    if (!canvas) return;
    try {
      const context = canvas.getContext('2d'); if (!context) return;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      this.canvases.set(index, canvas);
    } catch { /* A preview is optional; keep the detailed page. */ }
  }
  private canvas(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const scale = Math.min(1, 256 / width, Math.sqrt(PREVIEW_PIXELS / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.min(Math.floor(height * scale), Math.floor(PREVIEW_PIXELS / canvas.width)));
    canvas.dataset.preview = 'true';
    return canvas;
  }
  private schedule() {
    if (this.disposed || this.paused || this.busy || this.timer !== undefined) return;
    const index = [...this.wanted].find(index => !this.canvases.has(index));
    if (index === undefined) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.render(index); }, 150);
  }
  private async render(index: number) {
    if (this.disposed || this.paused || !this.wanted.has(index) || this.canvases.has(index)) { this.schedule(); return; }
    this.busy = true; this.activeIndex = index; const revision = this.revision;
    let failed = false;
    try {
      const page = await this.pdf.getPage(index + 1);
      if (this.disposed || this.paused || revision !== this.revision || !this.wanted.has(index) || this.canvases.has(index)) return;
      const original = page.getViewport({ scale: 1 }), canvas = this.canvas(original.width, original.height);
      if (!canvas) { failed = true; return; }
      const scale = Math.min(canvas.width / original.width, canvas.height / original.height);
      const viewport = page.getViewport({ scale });
      this.task = page.render({ canvas, viewport });
      await this.task.promise;
      if (this.disposed || this.paused || revision !== this.revision || !this.wanted.has(index) || this.canvases.has(index)) return;
      this.canvases.set(index, canvas); this.ready();
    } catch (error) { failed = (error as Error).name !== 'RenderingCancelledException'; }
    finally {
      this.task = undefined; this.activeIndex = undefined; this.busy = false;
      // Don't spin on a broken page. A later nearby-range update may retry it.
      if (failed) this.wanted.delete(index);
      this.schedule();
    }
  }
  dispose() {
    this.disposed = true; this.revision++; clearTimeout(this.timer); this.task?.cancel();
    for (const canvas of this.canvases.values()) { canvas.remove(); canvas.width = canvas.height = 0; }
    this.canvases.clear(); this.wanted.clear();
  }
}
