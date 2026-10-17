import type { PdfScrollbar } from './scrollbar';

/** Local visibility preference; only room editors have the vertical scrollbar. */
export function createVerticalScrollbarToggle(scrollbar: PdfScrollbar) {
  const toggle = document.createElement('label'); toggle.className = 'orientation-control';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
  checkbox.setAttribute('aria-label', 'Show vertical scrollbar');
  toggle.append(checkbox, document.createTextNode('Show vertical scrollbar'));
  let available = false, interactive = false;
  const refresh = () => {
    toggle.hidden = !available;
    scrollbar.element.hidden = !available || !checkbox.checked;
    scrollbar.setEnabled(available && checkbox.checked && interactive);
  };
  checkbox.onchange = refresh; refresh();
  return { toggle, update(canControl: boolean, ready: boolean) { available = canControl; interactive = ready; refresh(); }, destroy() { checkbox.onchange = null; toggle.remove(); } };
}
