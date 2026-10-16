import type { RoomService } from './rooms';
import { isPdfFile } from './sheets';
import type { SharedFile } from './sheets';
import type { SavedSong } from './song-library';
import type { SearchLocation } from './search';
import { SongbookViewer } from './viewer';
import { createLibraryThumbnails } from './library-thumbnails';

export function showSongLibrary(service: RoomService, pdfTitle: string, options: { viewOnly?: boolean; original?: SharedFile } = {}): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-dialog';
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close song library">×</button><h2>Select file/song</h2><div class="library-tools"><button class="secondary library-refresh">Refresh files</button><div class="library-view-toggle" role="group" aria-label="Library view"><button class="secondary" id="library-thumbnails" aria-pressed="true">Thumbnails</button><button class="secondary" id="library-text-list" aria-pressed="false">List</button></div></div><p class="library-status" role="status">Loading songs…</p><div class="library-list library-grid"></div>';
  document.body.append(dialog); dialog.showModal(); let alive = true, busy = false;
  if (options.viewOnly) dialog.querySelector('h2')!.textContent = 'View files/songs';
  let closePreview: (() => void) | undefined;
  let lastCatalog = '';
  const poll = window.setInterval(() => void reload(true), 2500);
  const list = dialog.querySelector<HTMLElement>('.library-list')!, status = dialog.querySelector<HTMLElement>('.library-status')!;
  const refresh = dialog.querySelector<HTMLButtonElement>('.library-refresh')!;
  const thumbnailButton = dialog.querySelector<HTMLButtonElement>('#library-thumbnails')!, listButton = dialog.querySelector<HTMLButtonElement>('#library-text-list')!;
  let thumbnails = true, songs: SavedSong[] = [], previews: ReturnType<typeof createLibraryThumbnails> | undefined;
  const dispose = () => { alive = false; clearInterval(poll); closePreview?.(); previews?.destroy(); previews = undefined; };
  const close = () => { dispose(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close;
  dialog.addEventListener('close', () => { dispose(); dialog.remove(); });
  const choose = async (song?: SavedSong) => {
    if (options.viewOnly) {
      const file = song || options.original; if (!file) return;
      closePreview?.(); closePreview = showSongPreview(file); return;
    }
    if (busy) return; busy = true; refresh.disabled = true; list.querySelectorAll('button').forEach(button => button.disabled = true);
    try { await service.changeSheet(song); if (alive) close(); }
    catch (error) { if (alive) status.textContent = error instanceof Error ? error.message : 'Could not open song.'; }
    finally { busy = false; if (alive) { refresh.disabled = false; list.querySelectorAll('button').forEach(button => button.disabled = false); } }
  };
  const button = (title: string, song?: SavedSong) => {
    const element = document.createElement('button'); element.className = 'secondary library-choice';
    if (thumbnails) {
      const preview = document.createElement('span'); element.append(preview);
      const file = song || options.original;
      if (file) previews!.add(file, preview); else { preview.className = 'library-thumbnail'; preview.textContent = 'PDF'; }
    }
    const label = document.createElement('span'); label.className = 'library-choice-title'; label.textContent = title; element.append(label);
    element.onclick = () => void choose(song); list.append(element);
  };
  const render = () => {
    previews?.destroy(); previews = thumbnails ? createLibraryThumbnails(dialog) : undefined;
    list.classList.toggle('library-grid', thumbnails); list.replaceChildren();
    button(`PDF · ${pdfTitle}`); songs.forEach(song => button(`${isPdfFile(song) ? 'PDF' : 'Images'} | ${song.title}`, song));
    if (busy) list.querySelectorAll('button').forEach(button => button.disabled = true);
    thumbnailButton.setAttribute('aria-pressed', String(thumbnails)); listButton.setAttribute('aria-pressed', String(!thumbnails));
  };
  const changeView = (value: boolean) => { if (!alive || thumbnails === value) return; thumbnails = value; render(); };
  thumbnailButton.onclick = () => changeView(true); listButton.onclick = () => changeView(false);
  render();
  const reload = async (quiet = false) => {
    if (busy || !alive) return; busy = true; refresh.disabled = true;
    if (!quiet) { list.querySelectorAll('button').forEach(button => button.disabled = true); status.textContent = 'Loading songs…'; }
    try {
      const loaded = await service.songs(); if (!alive) return;
      const catalog = JSON.stringify(loaded);
      if (!quiet || catalog !== lastCatalog) {
        lastCatalog = catalog; songs = loaded; render();
      }
      status.textContent = songs.length ? options.viewOnly ? 'View a file privately. The Master and approved controllers control the shared view.' : 'Select a source for everyone in the room.' : 'No saved songs yet. Upload a PDF or screenshots to add one.';
    } catch (error) { if (alive) status.textContent = error instanceof Error ? error.message : 'Could not load songs.'; }
    finally { busy = false; if (alive) { refresh.disabled = false; list.querySelectorAll('button').forEach(button => button.disabled = false); } }
  };
  refresh.onclick = () => void reload(); void reload();
  return close;
}

export function showSongPreview(song: SharedFile, location: SearchLocation = { page: 1, offset: 0 }): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'song-preview-dialog';
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close song preview">×</button><h2></h2><div class="pdf-host" tabindex="0" aria-label="Saved song preview"></div><div class="preview-controls"><button class="secondary" aria-label="Preview zoom out">−</button><span>100%</span><button class="secondary" aria-label="Preview zoom in">+</button></div>';
  dialog.querySelector('h2')!.textContent = song.title; document.body.append(dialog); dialog.showModal();
  const viewer = new SongbookViewer(dialog.querySelector<HTMLElement>('.pdf-host')!); let alive = true;
  viewer.onPosition = position => { dialog.querySelector('.preview-controls span')!.textContent = `${Math.round(position.zoom * 100)}%`; };
  const close = () => { if (!alive) return; alive = false; viewer.destroy(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close; dialog.addEventListener('close', close);
  dialog.querySelector<HTMLButtonElement>('[aria-label="Preview zoom out"]')!.onclick = () => viewer.setZoom((viewer.position()?.zoom || 1) - .1);
  dialog.querySelector<HTMLButtonElement>('[aria-label="Preview zoom in"]')!.onclick = () => viewer.setZoom((viewer.position()?.zoom || 1) + .1);
  void (isPdfFile(song) ? viewer.load(song.pdfUrl) : viewer.loadSheet(song)).then(() => { if (alive) viewer.follow({ ...location, zoom: 1, horizontal: 0 }, true); }).catch(error => { if (alive) dialog.querySelector('h2')!.textContent = error instanceof Error ? error.message : 'Could not open song.'; });
  return close;
}
