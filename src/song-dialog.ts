import type { RoomService } from './rooms';
import type { SavedSong } from './song-library';
import { SongbookViewer } from './viewer';

export function showSongLibrary(service: RoomService, pdfTitle: string): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-dialog';
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close song library">×</button><h2>Choose a song</h2><p class="library-status" role="status">Loading songs…</p><div class="library-list"></div>';
  document.body.append(dialog); dialog.showModal(); let alive = true, busy = false;
  const list = dialog.querySelector<HTMLElement>('.library-list')!, status = dialog.querySelector<HTMLElement>('.library-status')!;
  const close = () => { alive = false; dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close;
  dialog.addEventListener('close', () => { alive = false; dialog.remove(); });
  const choose = async (song?: SavedSong) => {
    if (busy) return; busy = true; list.querySelectorAll('button').forEach(button => button.disabled = true);
    try { await service.changeSheet(song); if (alive) close(); }
    catch (error) { if (alive) status.textContent = error instanceof Error ? error.message : 'Could not open song.'; }
    finally { busy = false; if (alive) list.querySelectorAll('button').forEach(button => button.disabled = false); }
  };
  const button = (title: string, song?: SavedSong) => { const element = document.createElement('button'); element.className = 'secondary library-choice'; element.textContent = title; element.onclick = () => void choose(song); list.append(element); };
  button(`PDF · ${pdfTitle}`);
  void service.songs().then(songs => { if (!alive) return; songs.forEach(song => button(song.title, song)); status.textContent = songs.length ? 'Select a source for everyone in the room.' : 'No saved songs yet. Upload screenshots to add one.'; }).catch(error => { if (alive) status.textContent = error instanceof Error ? error.message : 'Could not load songs.'; });
  return close;
}

export function showSongPreview(song: SavedSong): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'song-preview-dialog';
  dialog.innerHTML = '<button class="dialog-close icon-button" aria-label="Close song preview">×</button><h2></h2><div class="pdf-host" tabindex="0" aria-label="Saved song preview"></div><div class="preview-controls"><button class="secondary" aria-label="Preview zoom out">−</button><span>100%</span><button class="secondary" aria-label="Preview zoom in">+</button></div>';
  dialog.querySelector('h2')!.textContent = song.title; document.body.append(dialog); dialog.showModal();
  const viewer = new SongbookViewer(dialog.querySelector<HTMLElement>('.pdf-host')!); let alive = true;
  viewer.onPosition = position => { dialog.querySelector('.preview-controls span')!.textContent = `${Math.round(position.zoom * 100)}%`; };
  const close = () => { if (!alive) return; alive = false; viewer.destroy(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = close; dialog.addEventListener('close', close);
  dialog.querySelector<HTMLButtonElement>('[aria-label="Preview zoom out"]')!.onclick = () => viewer.setZoom((viewer.position()?.zoom || 1) - .1);
  dialog.querySelector<HTMLButtonElement>('[aria-label="Preview zoom in"]')!.onclick = () => viewer.setZoom((viewer.position()?.zoom || 1) + .1);
  void viewer.loadSheet(song).then(() => { if (alive) viewer.follow({ page: 1, offset: 0, zoom: 1, horizontal: 0 }, true); }).catch(error => { if (alive) dialog.querySelector('h2')!.textContent = error instanceof Error ? error.message : 'Could not open song.'; });
  return close;
}
