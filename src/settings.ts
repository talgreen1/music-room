import { SettingsService } from './admin';
import { showSheetDialog } from './sheet-dialog';
import { showSearchDialog } from './search-dialog';
import { showSongPreview } from './song-dialog';
import { isPdfFile, type SharedFile } from './sheets';
import { roomUploads } from './song-library';
import { showRoomDeleteDialog } from './room-delete-dialog';

export function showSettings(app: HTMLElement, back: () => void) {
  const service = new SettingsService();
  let alive = true; let closePreview: (() => void) | undefined;
  let closeDeletion: (() => void) | undefined;
  const deletionChoice = async (label: string, count: number) => {
    const choice = showRoomDeleteDialog(label, count); closeDeletion = choice.close;
    const result = await choice.result; closeDeletion = undefined; return result;
  };
  app.innerHTML = `<main class="settings"><header><button id="settings-back" class="secondary">Back</button><h1>Settings</h1><button id="settings-logout" class="secondary" hidden>Lock</button></header>
    <p id="settings-status" role="status"></p><form id="settings-login" class="entry-card"><label for="settings-password">Settings password</label><input id="settings-password" type="password" autocomplete="current-password" autofocus required><button class="primary" type="submit">Unlock settings</button></form>
    <section id="settings-content" hidden><section class="entry-card"><h2>Rooms</h2><div class="settings-actions"><button id="rooms-refresh" class="secondary">Refresh</button><button id="rooms-delete-all" class="danger">Delete all rooms</button></div><p>Deleting a room disconnects its participants.</p><div id="settings-rooms"></div></section>
    <section class="entry-card"><h2>Files &amp; songs</h2><button id="songs-add" class="primary">Add file/song</button><button id="songs-search" class="secondary">Search songs</button><button id="songs-refresh" class="secondary">Refresh files</button><p>The default opens in new rooms. Existing rooms keep their selected file. To delete the default, choose another default first. Deleted files stay visible in active rooms until those rooms switch away or expire.</p><div id="settings-songs"></div></section></section></main>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
  const report = (text: string) => { if (alive) $('#settings-status').textContent = text; };
  const fail = (error: unknown) => report(error instanceof Error ? error.message : 'Settings operation failed.');
  const dispose = () => { if (!alive) return; alive = false; closeDeletion?.(); closePreview?.(); void service.logout().catch(() => {}); };
  const leave = () => { dispose(); back(); };
  $('#settings-back').onclick = leave;
  const lock = async () => { closePreview?.(); await service.logout(); if (!alive) return; $('#settings-login').hidden = false; $('#settings-content').hidden = true; $('#settings-logout').hidden = true; $('#settings-rooms').replaceChildren(); $('#settings-songs').replaceChildren(); };
  $('#settings-logout').onclick = () => void lock().catch(fail);
  async function refresh() {
    const [rooms, songs] = await Promise.all([service.rooms(), service.songs()]); if (!alive) return;
    const list = $('#settings-rooms'); list.replaceChildren();
    for (const [code, room] of Object.entries(rooms).sort()) {
      const row = document.createElement('div'); row.className = 'settings-room';
      const text = document.createElement('span'); text.textContent = `${code} · ${room.sheet?.title || room.pdfTitle} · page ${room.position.page} · ${room.expiresAt > Date.now() ? 'Active' : 'Expired'}`;
      const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete room ${code}`);
      const uploads = roomUploads(songs, { [code]: room });
      const details = document.createElement('details'); details.className = 'room-upload-list';
      const summary = document.createElement('summary'); summary.textContent = `Uploaded files (${uploads.length})`; details.append(summary);
      for (const file of uploads) {
        const view = document.createElement('button'); view.className = 'secondary'; view.textContent = `${file.title} | ${isPdfFile(file) ? 'PDF' : 'Images'}`;
        view.setAttribute('aria-label', `View ${file.title} uploaded in room ${code}`);
        view.onclick = () => { closePreview?.(); closePreview = showSongPreview(file); }; details.append(view);
      }
      if (!uploads.length) { const note = document.createElement('p'); note.textContent = 'No files uploaded here. Selecting an existing library file does not count as an upload.'; details.append(note); }
      remove.onclick = async () => {
        remove.disabled = true;
        const deleteFiles = await deletionChoice(`room ${code}`, uploads.length);
        if (deleteFiles === undefined || !alive) { remove.disabled = false; return; }
        try { await service.deleteRooms(code, deleteFiles); await refresh(); await refreshSongs(); report(`Room ${code} deleted. ${deleteFiles ? 'Uploaded files deleted; the default is kept.' : 'Files kept for future rooms.'}`); } catch (error) { fail(error); remove.disabled = false; }
      };
      row.append(text, remove); list.append(row, details);
    }
    if (!Object.keys(rooms).length) list.textContent = 'No rooms.';
    $<HTMLButtonElement>('#rooms-delete-all').disabled = !Object.keys(rooms).length;
  }
  async function refreshSongs() {
    const [songs, defaultId, original] = await Promise.all([service.songs(), service.defaultFile(), service.defaultPdf()]);
    if (!alive) return;
    const list = $('#settings-songs'); list.replaceChildren();
    const files: SharedFile[] = [{ id: 'pdf', title: original.pdfTitle, pdfUrl: original.pdfUrl }, ...songs];
    for (const song of files) {
      const row = document.createElement('div'); row.className = 'settings-room settings-file';
      const name = document.createElement('span');
      name.textContent = `${song.title} | ${isPdfFile(song) ? 'PDF' : 'Images'}${song.id === defaultId ? ' | Default' : ''}`;
      const view = document.createElement('button'); view.className = 'secondary'; view.textContent = 'View'; view.setAttribute('aria-label', `View file ${song.title}`);
      const saved = songs.find(file => file.id === song.id);
      if (saved) name.textContent += ` | ${saved.roomCode ? `Uploaded in room ${saved.roomCode}` : 'Uploaded in Settings'} | ${new Date(saved.createdAt).toLocaleString()}`;
      view.onclick = () => { closePreview?.(); closePreview = showSongPreview(song); };
      const makeDefault = document.createElement('button'); makeDefault.className = 'secondary'; makeDefault.textContent = song.id === defaultId ? 'Default' : 'Make default';
      makeDefault.disabled = song.id === defaultId; makeDefault.setAttribute('aria-label', `Make default: ${song.title}`);
      makeDefault.onclick = async () => {
        makeDefault.disabled = true;
        try { await service.setDefault(song.id); await refreshSongs(); report('Default updated for new rooms.'); } catch (error) { fail(error); await refreshSongs().catch(() => {}); }
      };
      row.append(name, view, makeDefault);
      if (song.id === 'pdf') {
        const replace = document.createElement('button'); replace.className = 'secondary'; replace.textContent = 'Replace original PDF';
        replace.onclick = () => {
          closePreview?.();
          closePreview = showSheetDialog({
            uploadPdf: (file, id) => service.uploadPdf(file, id),
            uploadSegment: async () => { throw new Error('Choose a PDF file.'); },
            saveSong: async file => {
              if (!isPdfFile(file)) throw new Error('Choose a PDF file.');
              await service.updatePdf({ pdfUrl: file.pdfUrl, pdfTitle: file.title, pdfVersion: file.id });
            }
          }, undefined, { libraryOnly: true, replaceOriginalPdf: true, onSaved: async () => {
            if (!alive) return;
            await refreshSongs().catch(fail); report('Original PDF updated. Existing rooms keep their current file; the selected default is unchanged.');
          } });
        };
        row.append(replace);
      }
      if (song.id !== 'pdf') {
        const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete file ${song.title}`);
        remove.disabled = song.id === defaultId; if (remove.disabled) remove.title = 'Choose another default before deleting this file.';
        remove.onclick = async () => {
          if (!confirm(`Delete "${song.title}" from the file library?`)) return;
          remove.disabled = true;
          try { await service.deleteSong(song.id); await refreshSongs(); await refresh(); report('File deleted from the library.'); } catch (error) { fail(error); await refreshSongs().catch(() => {}); }
        };
        row.append(remove);
      }
      list.append(row);
    }
  }
  $<HTMLFormElement>('#settings-login').onsubmit = async event => {
    event.preventDefault(); const button = $<HTMLButtonElement>('#settings-login button'); button.disabled = true; report('');
    const input = $<HTMLInputElement>('#settings-password'); const password = input.value; input.value = '';
    try {
      await service.login(password); if (!alive) { await service.logout(); return; }
      await refresh(); await refreshSongs(); if (!alive) return;
      $('#settings-login').hidden = true; $('#settings-content').hidden = false; $('#settings-logout').hidden = false;
    } catch (error) { fail(error); } finally { if (alive) button.disabled = false; }
  };
  $('#songs-add').onclick = () => { closePreview?.(); closePreview = showSheetDialog(service, undefined, { libraryOnly: true, onSaved: async () => { if (!alive) return; report('File saved.'); await refreshSongs().catch(fail); await refresh().catch(fail); } }); };
  $('#songs-search').onclick = () => { closePreview?.(); closePreview = showSearchDialog({
    files: async () => { const [original, songs] = await Promise.all([service.defaultPdf(), service.songs()]); return [{ id: 'pdf', title: original.pdfTitle, pdfUrl: original.pdfUrl }, ...songs]; },
    open: result => { closePreview = showSongPreview(result.file, result.location); }
  }); };
  $('#songs-refresh').onclick = () => void refreshSongs().catch(fail);
  $('#rooms-refresh').onclick = () => void refresh().catch(fail);
  $('#rooms-delete-all').onclick = async () => {
    const button = $<HTMLButtonElement>('#rooms-delete-all'); button.disabled = true;
    try {
      const [rooms, songs] = await Promise.all([service.rooms(), service.songs()]); if (!alive) return;
      const deleteFiles = await deletionChoice('all rooms', roomUploads(songs, rooms).length);
      if (deleteFiles === undefined || !alive) { button.disabled = false; return; }
      await service.deleteRooms(undefined, deleteFiles); await refresh(); await refreshSongs(); report(`All rooms deleted. ${deleteFiles ? 'Uploaded files deleted; the default is kept.' : 'Files kept for future rooms.'}`);
    } catch (error) { fail(error); button.disabled = false; }
  };
  $<HTMLInputElement>('#settings-password').focus({ preventScroll: true });
  return dispose;
}

export function showSettingsDialog(): () => void {
  const dialog = document.createElement('dialog'); dialog.className = 'room-settings-dialog';
  dialog.setAttribute('aria-label', 'Room settings');
  const content = document.createElement('div'); dialog.append(content); document.body.append(dialog);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    dispose(); dialog.close(); dialog.remove();
  };
  const dispose = showSettings(content, close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', close);
  dialog.showModal();
  content.querySelector<HTMLInputElement>('#settings-password')!.focus({ preventScroll: true });
  return close;
}
