import { inspectCaptures, autoStitch, exportSegments, type Capture, type PreparedSegment } from './screenshot-import';
import type { ImageSheet } from './sheets';
export interface ScreenshotDestination {
  uploadSegment(blob: Blob, sheetId: string, index: number): Promise<string>;
  saveSong(song: ImageSheet): Promise<void>;
  changeSheet?(song: ImageSheet): Promise<void>;
}
export interface SheetDialogOptions { libraryOnly?: boolean; onSaved?: () => void | Promise<void> }

/** All stitching stays on this device; publish only after every segment uploads. */
export function showSheetDialog(service: ScreenshotDestination, initialFiles?: File[], options: SheetDialogOptions = {}): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-dialog';
  dialog.innerHTML = `<button class="dialog-close icon-button" aria-label="Close screenshots">×</button><h2>Share screenshots</h2><p>Capture the page from top to bottom, with overlapping content. Keep the same zoom in every screenshot. Set transposition on the website before capturing.</p><label>Song name (optional)<input class="sheet-title" maxlength="120" placeholder="Leave blank to use the screenshot name"></label><label class="secondary sheet-picker">Choose screenshots<input type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p class="sheet-status" role="status"></p><ol class="capture-list"></ol><div class="sheet-actions"><button class="secondary auto-stitch" disabled>Auto stitch</button><button class="secondary preview-sheet" disabled>Update preview</button><button class="primary publish-sheet" disabled>Share with room</button></div><div class="sheet-preview" aria-label="Stitched preview"></div>`;
  document.body.append(dialog); dialog.showModal();
  const get = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const status = get<HTMLParagraphElement>('.sheet-status');
  const input = get<HTMLInputElement>('input[type=file]');
  const auto = get<HTMLButtonElement>('.auto-stitch'), preview = get<HTMLButtonElement>('.preview-sheet'), publish = get<HTMLButtonElement>('.publish-sheet');
  if (options.libraryOnly) { get('h2').textContent = 'Add song'; publish.textContent = 'Save song'; }
  let captures: Capture[] = [], segments: PreparedSegment[] = [], urls: string[] = [], busy = false, closed = false;
  const progress = (text: string) => { if (!closed) status.textContent = text; };
  const clearPreview = () => { urls.forEach(URL.revokeObjectURL); urls = []; segments = []; get('.sheet-preview').replaceChildren(); publish.disabled = true; };
  const controls = () => { dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach(element => element.disabled = busy); auto.disabled = busy || !captures.length; preview.disabled = busy || !captures.length; publish.disabled = busy || !segments.length; };
  const close = () => { if (closed) return; closed = true; clearPreview(); dialog.close(); dialog.remove(); captures = []; };
  get<HTMLButtonElement>('.dialog-close').onclick = close;
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', close);
  const work = async (task: () => Promise<void>) => {
    if (busy || closed) return; busy = true; controls();
    try { await task(); } catch (error) { progress(error instanceof Error ? error.message : 'Could not prepare the screenshots.'); }
    finally { busy = false; if (!closed) controls(); }
  };
  const renderList = () => {
    const list = get<HTMLOListElement>('.capture-list'); list.replaceChildren();
    captures.forEach((capture, index) => {
      const row = document.createElement('li'), name = document.createElement('span'); name.textContent = capture.name;
      row.append(name);
      for (const [label, delta] of [['Move up', -1], ['Move down', 1]] as const) {
        const button = document.createElement('button'); button.className = 'secondary'; button.textContent = delta < 0 ? '↑' : '↓'; button.setAttribute('aria-label', `${label}: ${capture.name}`);
        button.onclick = () => { const other = index + delta; if (other < 0 || other >= captures.length) return; [captures[index], captures[other]] = [captures[other], captures[index]]; captures.forEach(item => { item.top = item.bottom = 0; item.matched = undefined; }); clearPreview(); renderList(); progress('Order changed. Press Auto stitch.'); };
        row.append(button);
      }
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = index && capture.matched === false ? 'Review join / crop' : 'Adjust crop'; details.append(summary);
      for (const side of ['top', 'bottom'] as const) {
        const label = document.createElement('label'); label.textContent = `Remove ${side} (pixels)`;
        const field = document.createElement('input'); field.type = 'number'; field.min = '0'; field.max = String(capture.height); field.value = String(capture[side]); field.setAttribute('aria-label', `Remove ${side} from ${capture.name} (pixels)`);
        field.oninput = () => { const other = side === 'top' ? 'bottom' : 'top'; capture[side] = Math.max(0, Math.min(capture.height - capture[other], Math.round(Number(field.value) || 0))); field.value = String(capture[side]); clearPreview(); progress(`Crop changed. Update the preview before ${options.libraryOnly ? 'saving' : 'sharing'}.`); };
        label.append(field); details.append(label);
      }
      row.append(details); list.append(row);
    });
    controls();
  };
  const makePreview = async () => {
    clearPreview(); const prepared = await exportSegments(captures, progress); if (closed) return; segments = prepared;
    for (const segment of segments) { const url = URL.createObjectURL(segment.blob); urls.push(url); const image = new Image(); image.loading = 'lazy'; image.decoding = 'async'; image.width = segment.width; image.height = segment.height; image.src = url; image.alt = 'Stitched screenshot'; get('.sheet-preview').append(image); }
    const uncertain = captures.slice(1).filter(capture => capture.matched === false).length;
    progress(uncertain ? `${uncertain} join(s) could not be matched confidently. Review the preview; adjust the crops if needed.` : `Preview ready. Check the joins, then ${options.libraryOnly ? 'save the song' : 'share with your room'}.`);
  };
  const loadFiles = (files: File[]) => work(async () => { clearPreview(); captures = []; renderList(); captures = await inspectCaptures(files, progress); await autoStitch(captures, progress); if (closed) return; renderList(); await makePreview(); });
  input.onchange = () => void loadFiles(Array.from(input.files || []));
  auto.onclick = () => void work(async () => { clearPreview(); await autoStitch(captures, progress); if (closed) return; renderList(); await makePreview(); });
  preview.onclick = () => void work(makePreview);
  publish.onclick = () => void work(async () => {
    const title = get<HTMLInputElement>('.sheet-title').value.trim() || captures[0]?.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Untitled song';
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    const uploaded = [];
    for (const [index, segment] of segments.entries()) { if (closed) return; progress(`Uploading ${index + 1} / ${segments.length}…`); const url = await service.uploadSegment(segment.blob, id, index); uploaded.push({ url, width: segment.width, height: segment.height }); }
    if (closed) return;
    const song = { id, title, segments: uploaded };
    progress('Saving song...'); await service.saveSong(song);
    if (!options.libraryOnly && service.changeSheet) {
      try { await service.changeSheet(song); } catch (error) { progress(`Song saved to the library, but could not open it in this room: ${error instanceof Error ? error.message : 'Please reconnect.'}`); return; }
    }
    close();
    await options.onSaved?.();
  });
  if (initialFiles) void loadFiles(initialFiles);
  return close;
}
