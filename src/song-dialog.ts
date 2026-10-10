import type { RoomService } from './rooms';
import { isPdfFile } from './sheets';
import type { SharedFile } from './sheets';
import type { SavedSong } from './song-library';
import type { SearchLocation } from './search';
import { SongbookViewer } from './viewer';

export function showSongLibrary(service: RoomService, pdfTitle: string, options: { viewOnly?: boolean; original?: SharedFile } = {}): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-dialog';
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close song library">×</button><h2>Select file/song</h2><button class="secondary library-refresh">Refresh files</button><p class="library-status" role="status">Loading songs…</p><div class="library-list"></div>';
  document.body.append(dialog); dialog.showModal(); let alive = true, busy = false;
  if (options.viewOnly) dialog.querySelector('h2')!.textContent = 'View files/songs';
  let closePreview: (() => void) | undefined;
  let lastCatalog = '';
  const poll = window.setInterval(() => void reload(true), 2500);
  const list = dialog.querySelector<HTMLElement>('.library-list')!, status = dialog.querySelector<HTMLElement>('.library-status')!;
  const refresh = dialog.querySelector<HTMLButtonElement>('.library-refresh')!;
  const close = () => { alive = false; clearInterval(poll); closePreview?.(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close;
  dialog.addEventListener('close', () => { alive = false; clearInterval(poll); closePreview?.(); dialog.remove(); });
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
  const button = (title: string, song?: SavedSong) => { const element = document.createElement('button'); element.className = 'secondary library-choice'; element.textContent = title; element.onclick = () => void choose(song); list.append(element); };
  button(`PDF · ${pdfTitle}`);
  const reload = async (quiet = false) => {
    if (busy || !alive) return; busy = true; refresh.disabled = true;
    if (!quiet) { list.querySelectorAll('button').forEach(button => button.disabled = true); status.textContent = 'Loading songs…'; }
    try {
      const songs = await service.songs(); if (!alive) return;
      const catalog = JSON.stringify(songs);
      if (!quiet || catalog !== lastCatalog) {
        lastCatalog = catalog; list.replaceChildren(); button(`PDF · ${pdfTitle}`); songs.forEach(song => button(`${isPdfFile(song) ? 'PDF' : 'Images'} | ${song.title}`, song));
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
