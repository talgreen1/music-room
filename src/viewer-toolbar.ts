import { clampZoom, MIN_ZOOM, MAX_ZOOM } from './model';

interface ToolbarOptions {
  position(): { page: number; zoom: number } | undefined;
  count(): number;
  canInteract(): boolean;
  canNavigate(): boolean;
  jump(page: number): void;
  zoom(value: number): void;
}

/** Shared compact controls; permissions are rechecked when each action runs. */
export function createViewerToolbar(options: ToolbarOptions) {
  const element = document.createElement('div'); element.className = 'viewer-controls';
  element.innerHTML = `<div class="page-navigation" role="group" aria-label="Page navigation"><button class="icon-button" id="first-page" aria-label="Jump to page 1" title="Jump to page 1">↑</button><button class="icon-button" id="previous" aria-label="Previous page" title="Previous page">‹</button><button class="icon-button" id="next" aria-label="Next page" title="Next page">›</button></div><div class="zoom-controls" role="group" aria-label="Document zoom"><button class="icon-button" id="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><output id="zoom" aria-label="Zoom level">100%</output><button class="icon-button" id="zoom-in" aria-label="Zoom in" title="Zoom in">+</button></div>`;
  const navigation = element.querySelector<HTMLElement>('.page-navigation')!;
  const first = element.querySelector<HTMLButtonElement>('#first-page')!;
  const previous = element.querySelector<HTMLButtonElement>('#previous')!;
  const next = element.querySelector<HTMLButtonElement>('#next')!;
  const minus = element.querySelector<HTMLButtonElement>('#zoom-out')!;
  const plus = element.querySelector<HTMLButtonElement>('#zoom-in')!;
  const level = element.querySelector<HTMLOutputElement>('#zoom')!;
  function move(delta: number) {
    const position = options.position();
    if (!position || !options.canInteract() || !options.canNavigate()) return;
    const page = Math.max(1, Math.min(options.count(), position.page + delta));
    if (page !== position.page) options.jump(page);
  }
  function zoom(delta: number) {
    const position = options.position();
    if (!position || !options.canInteract()) return;
    const value = clampZoom(Math.round((position.zoom + delta) * 100) / 100);
    if (value !== position.zoom) options.zoom(value);
  }
  first.onclick = () => { if (options.position() && options.canInteract() && options.canNavigate()) options.jump(1); };
  previous.onclick = () => move(-1); next.onclick = () => move(1);
  minus.onclick = () => zoom(-.1); plus.onclick = () => zoom(.1);
  return {
    element,
    refresh() {
      const position = options.position();
      const enabled = Boolean(position && options.canInteract());
      navigation.hidden = !options.canNavigate();
      first.disabled = !enabled || navigation.hidden;
      previous.disabled = !enabled || navigation.hidden || position!.page <= 1;
      next.disabled = !enabled || navigation.hidden || position!.page >= options.count();
      minus.disabled = !enabled || position!.zoom <= MIN_ZOOM;
      plus.disabled = !enabled || position!.zoom >= MAX_ZOOM;
      level.textContent = position ? `${Math.round(position.zoom * 100)}%` : '—';
    }
  };
}
