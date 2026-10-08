import './style.css';
import QRCode from 'qrcode';
import { shareIcon, copyIcon, searchIcon } from './icons';
import { copyRoomUrl } from './clipboard';
import { RoomService, cloudConfigured, localServerConfigured, songbook, type Connection } from './rooms';
import { validCode, type Room } from './model';
import { SongbookViewer } from './viewer';
import { PositionPublisher } from './sync';
import { PdfScrollbar } from './scrollbar';
import { FollowerSync } from './follower-sync';
import { showSettings, showSettingsDialog } from './settings';
import { showSongLibrary, showSongPreview } from './song-dialog';
import { showSearchDialog } from './search-dialog';
import type { SearchResult } from './search';
import { isPdfFile } from './sheets';
import { showSheetDialog } from './sheet-dialog';

const app = document.querySelector<HTMLDivElement>('#app')!;
const service = new RoomService();
let viewer: SongbookViewer | undefined;
let scrollbar: PdfScrollbar | undefined;
let publisher: PositionPublisher | undefined;
let followerSync: FollowerSync | undefined;
let closeSheet: (() => void) | undefined;
let closeSettings: (() => void) | undefined;
let closeMenu: (() => void) | undefined;
let room: Room | undefined;
let master = false;
let following = true;
let ready = false;
let generation = 0;
let lastSequence = -1;
let connection: Connection = 'Reconnecting…';
let lastPublished = '';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<T>(selector)!;
const safe = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
let noticeTimer: number | undefined;
const message = (value: string, duration = 0) => {
  window.clearTimeout(noticeTimer); noticeTimer = undefined;
  const element = app.querySelector<HTMLElement>('#notice');
  if (element) {
    element.textContent = value; element.hidden = !value;
    if (value && duration) noticeTimer = window.setTimeout(() => { element.textContent = ''; element.hidden = true; noticeTimer = undefined; }, duration);
  }
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
function cleanup() { generation++; window.clearTimeout(noticeTimer); noticeTimer = undefined; closeMenu?.(); closeMenu = undefined; closeSheet?.(); closeSheet = undefined; closeSettings?.(); closeSettings = undefined; followerSync?.destroy(); followerSync = undefined; publisher?.stop(); publisher = undefined; scrollbar?.destroy(); scrollbar = undefined; viewer?.destroy(); viewer = undefined; service.leave(); room = undefined; ready = false; lastSequence = -1; lastPublished = ''; }

function home() {
  cleanup();
  app.innerHTML = `<main class="home"><header class="brand"><span class="brand-icon" aria-hidden="true">♫</span> music room</header>
    <section class="welcome"><p class="eyebrow">PLAY TOGETHER. STAY TOGETHER.</p><h1>One songbook.<br><span>Everyone in sync.</span></h1><p class="intro">A shared space for your next session.<br>One person leads. Everyone follows.</p></section>
    <section class="entry-card"><button id="create" class="primary">Create a room <span aria-hidden="true">↗</span></button><p class="hint">You’ll lead the session as Master</p><div class="divider"><span>or join your group</span></div><form id="join"><label for="code">Room code</label><div class="join-row"><input id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit code" required autocomplete="off"/><button class="secondary" type="submit">Join room</button></div></form><p id="notice" class="notice" role="alert" hidden></p></section>
    <footer><span class="book-dot"></span><span>${safe(songbook.pdfTitle)} · ${safe(songbook.pdfVersion)}</span></footer>
    ${localServerConfigured ? '<aside class="demo-note"><strong>Local development</strong><br>Rooms are shared by this server. Join from another browser, or use your computer’s network address from a phone on the same Wi-Fi. Rooms reset when the server restarts.</aside>' : !cloudConfigured ? '<aside class="demo-note"><strong>Browser-only demo</strong><br>Open a second tab in this browser to try following. Set up Firebase to connect separate browsers or phones.</aside>' : '<p class="privacy">No account needed. Just bring your instrument.</p>'}</main>`;
  const settingsButton = document.createElement('button'); settingsButton.className = 'secondary'; settingsButton.textContent = 'Settings'; settingsButton.id = 'settings'; $('.brand').append(settingsButton);
  const explainerLink = document.createElement('a'); explainerLink.className = 'explainer-link'; explainerLink.href = '/explainer/index.html'; explainerLink.dir = 'rtl'; explainerLink.lang = 'he'; explainerLink.textContent = 'איך זה עובד? צפו בסרטון קצר';
  $('.entry-card').after(explainerLink);
  settingsButton.onclick = () => { history.pushState({}, '', '?settings=1'); route(); };
  $('#create').onclick = async () => {
    const button = $<HTMLButtonElement>('#create'); button.disabled = true; button.textContent = 'Creating room…'; message('');
    try { await service.init(); const code = await service.create(); history.pushState({}, '', `?room=${code}`); openRoom(code); }
    catch (error) { message(errorText(error)); button.disabled = false; button.textContent = 'Create a room ↗'; }
  };
  $<HTMLFormElement>('#join').onsubmit = async event => {
    event.preventDefault(); const code = $<HTMLInputElement>('#code').value.trim();
    if (!validCode(code)) { message('Enter a 6-digit room code.'); return; }
    history.pushState({}, '', `?room=${code}`); openRoom(code);
  };
}

async function openRoom(code: string) {
  cleanup(); const token = generation; master = false; following = true; connection = 'Reconnecting…';
  app.innerHTML = `<main class="session"><header class="room-header"><button id="leave" class="icon-button" aria-label="Leave room">←</button><div class="room-identity"><span class="small-label">ROOM ${safe(code)}</span><strong id="role">Joining your group…</strong></div><span id="connection" class="connection" role="status">Reconnecting…</span><button id="share" class="icon-button" aria-label="Share room" title="Share room">${shareIcon}</button></header>${!cloudConfigured ? localServerConfigured ? '<div class="demo-bar">LOCAL DEVELOPMENT · Shared across browsers</div>' : '<div class="demo-bar">BROWSER-ONLY DEMO · Same-browser tabs only</div>' : ''}<div id="notice" class="notice room-notice" role="alert" hidden></div><div id="pdf" class="pdf-host" tabindex="0" aria-label="Songbook"></div><nav class="toolbar" aria-label="Songbook controls"><button id="previous" class="icon-button" aria-label="Previous page">‹</button><form id="page-form"><label class="sr-only" for="page">Page number</label><input id="page" type="number" min="1" value="1" aria-label="Page number"/><span id="count"> / —</span></form><button id="next" class="icon-button" aria-label="Next page">›</button><div class="toolbar-divider"></div><button id="zoom-out" class="icon-button" aria-label="Zoom out">−</button><span id="zoom">100%</span><button id="zoom-in" class="icon-button" aria-label="Zoom in">+</button></nav></main><dialog id="share-dialog"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close">×</button></form><p class="eyebrow">INVITE YOUR GROUP</p><h2>Room ${safe(code)}</h2><canvas id="qr"></canvas><p id="share-url"></p><div class="share-actions"><button id="native-share" class="icon-button" aria-label="Share room link" title="Share room link">${shareIcon}</button><button id="copy" class="icon-button" aria-label="Copy room link" title="Copy room link">${copyIcon}</button></div><p id="copy-status" role="status"></p></dialog>`;
  $('#leave').onclick = () => { history.pushState({}, '', '/'); home(); };
  const settingsButton = document.createElement('button');
  settingsButton.className = 'icon-button'; settingsButton.textContent = '⚙';
  settingsButton.setAttribute('aria-label', 'Settings'); settingsButton.title = 'Settings';
  const searchButton = document.createElement('button'); searchButton.className = 'icon-button room-search'; searchButton.innerHTML = searchIcon; searchButton.hidden = true; searchButton.setAttribute('aria-label', 'Search songs'); searchButton.title = 'Search songs';
  $('.room-header').append(searchButton, settingsButton);
  const menu = document.createElement('dialog'); menu.id = 'room-menu'; menu.className = 'room-menu';
  menu.setAttribute('aria-label', 'Room menu');
  menu.innerHTML = '<button class="dialog-close icon-button" aria-label="Close room menu">×</button><h2>Room menu</h2><div class="room-menu-actions"></div>';
  app.append(menu);
  const menuActions = menu.querySelector<HTMLElement>('.room-menu-actions')!;
  const dismissMenu = () => { if (menu.open) menu.close(); settingsButton.setAttribute('aria-expanded', 'false'); };
  closeMenu = dismissMenu;
  menu.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = dismissMenu;
  menu.addEventListener('cancel', event => { event.preventDefault(); dismissMenu(); });
  menu.addEventListener('close', () => settingsButton.setAttribute('aria-expanded', 'false'));
  menu.addEventListener('click', event => {
    if (event.target !== menu) return;
    const bounds = menu.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismissMenu();
  });
  const openSettings = () => { dismissMenu(); closeSettings?.(); closeSettings = showSettingsDialog(); };
  settingsButton.onclick = () => {
    menu.showModal(); settingsButton.setAttribute('aria-expanded', 'true');
  };
  $('#share').onclick = async () => {
    const url = new URL(location.href); url.search = `?room=${code}`;
    const dialog = $<HTMLDialogElement>('#share-dialog'); $('#share-url').textContent = url.href; dialog.showModal();
    const nativeShare = $<HTMLButtonElement>('#native-share');
    $('#copy-status').textContent = '';
    nativeShare.disabled = typeof navigator.share !== 'function';
    if (nativeShare.disabled) $('#copy-status').textContent = 'Sharing is unavailable in this browser. Copy the room link instead.';
    nativeShare.onclick = async () => {
      try { await navigator.share({ title: `Music Room ${code}`, url: url.href }); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) $('#copy-status').textContent = 'Could not share. Copy the room link instead.'; }
    };
    try { await QRCode.toCanvas($<HTMLCanvasElement>('#qr'), url.href, { width: 220, margin: 2 }); } catch { $('#copy-status').textContent = 'QR unavailable. Use the room link.'; }
    $('#copy').onclick = async () => {
      $('#copy-status').textContent = await copyRoomUrl(url.href, dialog) ? 'Link copied.' : 'Copy failed. Press and hold the room link above, then choose Copy.';
    };
  };
  const pdfFrame = document.createElement('div'); pdfFrame.className = 'pdf-frame';
  $('#pdf').before(pdfFrame); pdfFrame.append($('#pdf'));
  scrollbar = new PdfScrollbar($('#pdf')); pdfFrame.append(scrollbar.element);
  const firstPage = document.createElement('button');
  firstPage.id = 'first-page'; firstPage.className = 'icon-button';
  firstPage.setAttribute('aria-label', 'Jump to page 1'); firstPage.title = 'Jump to page 1';
  firstPage.textContent = '↑'; $('.toolbar').prepend(firstPage);
  const followerPage = document.createElement('span'); followerPage.id = 'follower-page'; followerPage.textContent = 'Page 1';
  $('.toolbar').append(followerPage);
  viewer = new SongbookViewer($('#pdf'));
  viewer.onLinkError = message;
  const syncControl = document.createElement('label'); syncControl.className = 'sync-control'; syncControl.hidden = true;
  const syncCheckbox = document.createElement('input'); syncCheckbox.type = 'checkbox'; syncCheckbox.checked = true;
  syncControl.append(syncCheckbox, document.createTextNode('Master sync')); $('.toolbar').prepend(syncControl);
  const sync = new FollowerSync(value => {
    following = value; syncCheckbox.checked = value;
    if (!value) viewer?.cancelFollow();
    updateFollow();
  }, () => { if (ready && room && token === generation) viewer?.follow(room.position, true); });
  followerSync = sync;
  const beginBrowsing = () => { if (token === generation && !master && ready) sync.begin(); };
  const endBrowsing = () => { if (token === generation && !master && ready) sync.end(); };
  viewer.onInteractionStart = beginBrowsing; viewer.onInteractionEnd = endBrowsing;
  scrollbar.onInteractionStart = beginBrowsing; scrollbar.onInteractionEnd = endBrowsing;
  syncCheckbox.onchange = () => { if (!master && ready) sync.setManual(syncCheckbox.checked); };
  const orientation = document.createElement('label');
  orientation.className = 'orientation-control'; orientation.hidden = true;
  const rtl = document.createElement('input'); rtl.type = 'checkbox'; rtl.checked = true;
  rtl.setAttribute('aria-label', 'RTL orientation');
  orientation.append(rtl, document.createTextNode('RTL'));
  rtl.onchange = () => { if (master && ready) viewer?.setRtl(rtl.checked); };
  let loadedSource = '', loadingSource = '', sourceRevision = 0;
  const publishPosition = (position: import('./model').Position, immediate = false) => publisher?.push({ ...position, sourceId: loadedSource }, immediate);
  const screenshots = document.createElement('button'); screenshots.className = 'secondary'; screenshots.textContent = 'Add file/song';
  const songsButton = document.createElement('button'); songsButton.className = 'secondary'; songsButton.textContent = 'Select file/song';
  songsButton.onclick = () => { dismissMenu(); closeSheet?.(); closeSheet = showSongLibrary(service, room?.pdfTitle || 'Songbook', { viewOnly: !master, original: originalFile() }); };
  const menuSettings = document.createElement('button'); menuSettings.className = 'secondary'; menuSettings.textContent = 'Settings'; menuSettings.onclick = openSettings;
  const originalFile = () => ({ id: 'pdf', title: room!.pdfTitle, pdfUrl: room!.pdfUrl });
  const openSearch = () => {
    if (!ready || !room) return;
    dismissMenu(); closeSheet?.();
    const capturedCurrent = room.sheet || originalFile();
    closeSheet = showSearchDialog({
      current: capturedCurrent,
      files: async () => { const songs = await service.songs(); return [originalFile(), ...songs]; },
      open: async (result: SearchResult) => {
        if (token !== generation || !room || !ready) throw new Error('The room changed. Search again.');
        if (result.file.id === (room.sheet?.id || 'pdf')) {
          beginBrowsing();
          const position = { ...viewer!.position()!, ...result.location, horizontal: rtl.checked ? 1 : 0 };
          viewer!.follow(position, true);
          if (master) publishPosition(viewer!.position()!, true);
          endBrowsing();
        } else if (master) await service.changeSheet(result.file.id === 'pdf' ? undefined : result.file, result.location);
        else closeSheet = showSongPreview(result.file, result.location);
      }
    });
  };
  searchButton.onclick = openSearch;
  menuActions.append(screenshots, songsButton, menuSettings, orientation);
  const pdfButton = document.createElement('button'); pdfButton.className = 'secondary source-button'; pdfButton.textContent = 'PDF';
  $('.toolbar').append(pdfButton);
  screenshots.onclick = () => {
    dismissMenu(); closeSheet?.();
    closeSheet = showSheetDialog(service, undefined, { libraryOnly: !master, roomContribution: !master, onSaved: () => { if (token === generation && !master) message('File added. Everyone in the room can find it in the library; the Master can select it.', 5000); } });
  };
  pdfButton.onclick = async () => { pdfButton.disabled = true; try { await service.changeSheet(); } catch (error) { message(errorText(error)); } finally { if (token === generation) updateFollow(); } };
  publisher = new PositionPublisher(position => service.publish(position), error => message(errorText(error)));
  viewer.onPage = page => { $<HTMLInputElement>('#page').value = String(page); followerPage.textContent = room?.sheet && !isPdfFile(room.sheet) ? room.sheet.title : `Page ${page} / ${viewer?.count || '…'}`; };
  viewer.onPosition = position => {
    scrollbar?.refresh();
    $('#zoom').textContent = `${Math.round(position.zoom * 100)}%`;
    if (!master || !ready || connection !== 'Connected') return;
    const key = `${position.page}:${position.offset.toFixed(4)}:${(position.horizontal || 0).toFixed(4)}:${position.zoom}`;
    if (key !== lastPublished) { lastPublished = key; publishPosition(position); }
  };
  const independent = () => master || !following;
  const jump = (page: number) => { if (independent() && ready && Number.isFinite(page)) { viewer?.jump(page); const p = viewer?.position(); if (master && p) publishPosition(p, true); } };
  firstPage.onclick = () => jump(1);
  $('#previous').onclick = () => jump(Number($<HTMLInputElement>('#page').value) - 1);
  $('#next').onclick = () => jump(Number($<HTMLInputElement>('#page').value) + 1);
  $<HTMLFormElement>('#page-form').onsubmit = event => { event.preventDefault(); jump(Number($<HTMLInputElement>('#page').value)); $<HTMLInputElement>('#page').blur(); };
  $('#zoom-out').onclick = () => { if (independent()) viewer?.setZoom((viewer.position()?.zoom || 1) - .1); };
  $('#zoom-in').onclick = () => { if (independent()) viewer?.setZoom((viewer.position()?.zoom || 1) + .1); };
  function updateFollow() {
    if (scrollbar) scrollbar.element.hidden = !master;
    scrollbar?.setEnabled(ready && master);
    orientation.hidden = !master;
    settingsButton.textContent = '☰';
    settingsButton.setAttribute('aria-label', 'Room menu'); settingsButton.title = 'Room menu';
    settingsButton.setAttribute('aria-haspopup', 'dialog'); settingsButton.setAttribute('aria-controls', menu.id); settingsButton.setAttribute('aria-expanded', String(menu.open));
    rtl.disabled = !ready; searchButton.disabled = !ready;
    syncControl.hidden = master; syncCheckbox.disabled = !ready;
    $('#share').hidden = !master;
    $('#pdf').classList.toggle('locked', !ready);
    $('#pdf').classList.toggle('following', !master && following);
    for (const selector of ['#first-page', '#previous', '#next', '#page', '#zoom-out', '#zoom-in']) ($<HTMLButtonElement | HTMLInputElement>(selector)).disabled = !ready || !independent();
    for (const selector of ['#first-page', '#previous', '#next']) $(selector).hidden = !master;
    for (const selector of ['#zoom-out', '#zoom-in', '.toolbar-divider']) $(selector).hidden = true;
    $('#zoom').hidden = master;
    $('#page-form').hidden = !master || Boolean(room?.sheet && !isPdfFile(room.sheet));
    for (const selector of ['#previous', '#next']) $(selector).hidden = !master || Boolean(room?.sheet && !isPdfFile(room.sheet));
    songsButton.hidden = false; songsButton.textContent = master ? 'Select file/song' : 'View files/songs'; songsButton.disabled = !ready || connection !== 'Connected';
    screenshots.hidden = false; screenshots.disabled = !ready || connection !== 'Connected';
    pdfButton.hidden = !master || !room?.sheet; pdfButton.disabled = !ready || connection !== 'Connected';
    $('#follower-page').hidden = master;
  }
  updateFollow();
  const recovery = document.createElement('section');
  recovery.className = 'room-recovery'; recovery.hidden = true;
  pdfFrame.before(recovery);
  function unavailable(title: string, explanation: string) {
    if (token !== generation) return;
    ready = false; master = false; viewer?.cancelFollow();
    scrollbar?.setEnabled(false);
    orientation.hidden = true;
    dismissMenu();
    $('#role').textContent = 'Room unavailable';
    sync.destroy();
    pdfFrame.hidden = true;
    $('.toolbar').hidden = true;
    $<HTMLButtonElement>('#share').disabled = true;
    message('');
    recovery.innerHTML = `<h1>${safe(title)}</h1><p>${safe(explanation)}</p><div class="recovery-actions"><button class="primary" id="retry-room">Try again</button><button class="secondary" id="back-home">Back to home</button></div>`;
    recovery.hidden = false;
    $('#retry-room').onclick = () => void openRoom(code);
    $('#back-home').onclick = () => { history.pushState({}, '', '/'); home(); };
  }
  async function receive(next: Room | null) {
    if (token !== generation) return;
    if (!next) {
      unavailable(`Room ${code} isn’t available`, localServerConfigured
        ? 'This room is not on the local server. Rooms expire after 24 hours and reset when the development server restarts. Rooms from the old browser-only demo are not shared. Create a fresh room, then join its code from any browser connected to this server.'
        : cloudConfigured
        ? 'Check the code with the person leading your session. Rooms expire after 24 hours. You can retry, or return home to create or join another room.'
        : `This is a local demo. Open this link in the same browser and profile that created the room, using the same address (${location.origin}). Rooms expire after 24 hours. For another browser or phone, configure Firebase. You can also return home to create a fresh room.`);
      return;
    }
    if ((next.position.sequence || 0) < lastSequence) return;
    const first = !room; const previous = room?.position; room = next; master = service.isMaster(next);
    $('#role').textContent = master ? 'Master' : 'Follower';
    searchButton.hidden = !master;
    const source = next.sheet?.id || 'pdf';
    if (first || (loadingSource ? source !== loadingSource : source !== loadedSource)) {
      const revision = ++sourceRevision; loadingSource = source; ready = false; lastPublished = '';
      publisher?.stop(); publisher = undefined; updateFollow();
      recovery.hidden = true; pdfFrame.hidden = false; $('.toolbar').hidden = false;
      $<HTMLButtonElement>('#share').disabled = false;
      try {
        if (next.sheet && !isPdfFile(next.sheet)) await viewer!.loadSheet(next.sheet); else await viewer!.load(next.sheet && isPdfFile(next.sheet) ? next.sheet.pdfUrl : next.pdfUrl);
        if (token !== generation || revision !== sourceRevision) return;
        loadedSource = source; loadingSource = '';
        publisher = new PositionPublisher(position => service.publish(position), error => message(errorText(error)));
        ready = true; $('#count').textContent = ` / ${viewer!.count}`; $<HTMLInputElement>('#page').max = String(viewer!.count);
        viewer!.follow(room!.position, true); updateFollow();
      } catch (error) { if (token !== generation || revision !== sourceRevision) return; unavailable('Could not open the songbook', `${errorText(error)} Try again, or return home to join another room.`); }
    } else if (ready && !master && following && (next.position.sequence || 0) >= lastSequence) {
      viewer!.follow(next.position, Boolean(previous && Math.abs(previous.page - next.position.page) > 1));
    }
    lastSequence = Math.max(lastSequence, next.position.sequence || 0);
  }
  function status(value: Connection) {
    if (token !== generation) return;
    const reconnected = connection !== 'Connected' && value === 'Connected'; connection = value;
    updateFollow();
    $('#connection').textContent = value; $('#connection').classList.toggle('online', value === 'Connected');
    if (reconnected && ready) {
      if (master) { const p = viewer?.position(); if (p) publishPosition(p, true); }
      else if (following && room) viewer?.follow(room.position, true);
    }
  }
  try { await service.init(); if (token !== generation) return; service.watch(code, next => void receive(next), status, error => unavailable('Could not join the room', error)); }
  catch (error) { unavailable('Could not join the room', errorText(error)); }
}

window.addEventListener('popstate', route);
function route() {
  const params = new URLSearchParams(location.search);
  if (params.get('settings') === '1') { cleanup(); closeSettings = showSettings(app, () => { history.pushState({}, '', '/'); home(); }); return; }
  const code = params.get('room'); if (code && validCode(code)) void openRoom(code); else home();
}
route();
