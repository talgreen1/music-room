import './style.css';
import QRCode from 'qrcode';
import { RoomService, cloudConfigured, localServerConfigured, songbook, type Connection } from './rooms';
import { validCode, type Room } from './model';
import { SongbookViewer } from './viewer';
import { PositionPublisher } from './sync';

const app = document.querySelector<HTMLDivElement>('#app')!;
const service = new RoomService();
let viewer: SongbookViewer | undefined;
let publisher: PositionPublisher | undefined;
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
const message = (value: string) => { const element = app.querySelector<HTMLElement>('#notice'); if (element) { element.textContent = value; element.hidden = !value; } };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
function cleanup() { generation++; publisher?.stop(); publisher = undefined; viewer?.destroy(); viewer = undefined; service.leave(); room = undefined; ready = false; lastSequence = -1; lastPublished = ''; }

function home() {
  cleanup();
  app.innerHTML = `<main class="home"><header class="brand"><span class="brand-icon" aria-hidden="true">♫</span> music room</header>
    <section class="welcome"><p class="eyebrow">PLAY TOGETHER. STAY TOGETHER.</p><h1>One songbook.<br><span>Everyone in sync.</span></h1><p class="intro">A shared space for your next session.<br>One person leads. Everyone follows.</p></section>
    <section class="entry-card"><button id="create" class="primary">Create a room <span aria-hidden="true">↗</span></button><p class="hint">You’ll lead the session as Master</p><div class="divider"><span>or join your group</span></div><form id="join"><label for="code">Room code</label><div class="join-row"><input id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit code" required autocomplete="off"/><button class="secondary" type="submit">Join room</button></div></form><p id="notice" class="notice" role="alert" hidden></p></section>
    <footer><span class="book-dot"></span><span>${safe(songbook.pdfTitle)} · ${safe(songbook.pdfVersion)}</span></footer>
    ${localServerConfigured ? '<aside class="demo-note"><strong>Local development</strong><br>Rooms are shared by this server. Join from another browser, or use your computer’s network address from a phone on the same Wi-Fi. Rooms reset when the server restarts.</aside>' : !cloudConfigured ? '<aside class="demo-note"><strong>Browser-only demo</strong><br>Open a second tab in this browser to try following. Set up Firebase to connect separate browsers or phones.</aside>' : '<p class="privacy">No account needed. Just bring your instrument.</p>'}</main>`;
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
  app.innerHTML = `<main class="session"><header class="room-header"><button id="leave" class="icon-button" aria-label="Leave room">←</button><div class="room-identity"><span class="small-label">ROOM ${safe(code)}</span><strong id="role">Joining your group…</strong></div><span id="connection" class="connection" role="status">Reconnecting…</span><button id="share" class="secondary compact">Share</button></header>${!cloudConfigured ? localServerConfigured ? '<div class="demo-bar">LOCAL DEVELOPMENT · Shared across browsers</div>' : '<div class="demo-bar">BROWSER-ONLY DEMO · Same-browser tabs only</div>' : ''}<div id="notice" class="notice room-notice" role="alert" hidden></div><div id="pdf" class="pdf-host" tabindex="0" aria-label="Songbook"></div><nav class="toolbar" aria-label="Songbook controls"><button id="previous" class="icon-button" aria-label="Previous page">‹</button><form id="page-form"><label class="sr-only" for="page">Page number</label><input id="page" type="number" min="1" value="1" aria-label="Page number"/><span id="count"> / —</span></form><button id="next" class="icon-button" aria-label="Next page">›</button><div class="toolbar-divider"></div><button id="zoom-out" class="icon-button" aria-label="Zoom out">−</button><span id="zoom">100%</span><button id="zoom-in" class="icon-button" aria-label="Zoom in">+</button></nav><div id="follow-controls" class="follow-controls" hidden><button id="follow" class="secondary" aria-pressed="true">Following Master</button><button id="return" class="primary">Return to Master</button></div></main><dialog id="share-dialog"><form method="dialog"><button class="dialog-close icon-button" aria-label="Close">×</button></form><p class="eyebrow">INVITE YOUR GROUP</p><h2>Room ${safe(code)}</h2><canvas id="qr"></canvas><p id="share-url"></p><button id="copy" class="primary">Copy room link</button><p id="copy-status" role="status"></p></dialog>`;
  $('#leave').onclick = () => { history.pushState({}, '', '/'); home(); };
  $('#share').onclick = async () => {
    const url = new URL(location.href); url.search = `?room=${code}`;
    const dialog = $<HTMLDialogElement>('#share-dialog'); $('#share-url').textContent = url.href; dialog.showModal();
    try { await QRCode.toCanvas($<HTMLCanvasElement>('#qr'), url.href, { width: 220, margin: 2 }); } catch { $('#copy-status').textContent = 'QR unavailable. Use the room link.'; }
    $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(url.href); $('#copy-status').textContent = 'Link copied.'; } catch { $('#copy-status').textContent = 'Copy the link above to share.'; } };
  };
  viewer = new SongbookViewer($('#pdf'));
  viewer.onLinkError = message;
  const orientation = document.createElement('label');
  orientation.className = 'orientation-control'; orientation.hidden = true;
  const rtl = document.createElement('input'); rtl.type = 'checkbox'; rtl.checked = true;
  rtl.setAttribute('aria-label', 'RTL orientation');
  orientation.append(rtl, document.createTextNode('RTL'));
  $('.toolbar').append(orientation);
  rtl.onchange = () => { if (master && ready) viewer?.setRtl(rtl.checked); };
  publisher = new PositionPublisher(position => service.publish(position), error => message(errorText(error)));
  viewer.onPage = page => { $<HTMLInputElement>('#page').value = String(page); };
  viewer.onPosition = position => {
    $('#zoom').textContent = `${Math.round(position.zoom * 100)}%`;
    if (!master || !ready || connection !== 'Connected') return;
    const key = `${position.page}:${position.offset.toFixed(4)}:${(position.horizontal || 0).toFixed(4)}:${position.zoom}`;
    if (key !== lastPublished) { lastPublished = key; publisher?.push(position); }
  };
  const independent = () => master || !following;
  const jump = (page: number) => { if (independent() && ready && Number.isFinite(page)) { viewer?.jump(page); const p = viewer?.position(); if (master && p) publisher?.push(p, true); } };
  $('#previous').onclick = () => jump(Number($<HTMLInputElement>('#page').value) - 1);
  $('#next').onclick = () => jump(Number($<HTMLInputElement>('#page').value) + 1);
  $<HTMLFormElement>('#page-form').onsubmit = event => { event.preventDefault(); jump(Number($<HTMLInputElement>('#page').value)); $<HTMLInputElement>('#page').blur(); };
  $('#zoom-out').onclick = () => { if (independent()) viewer?.setZoom((viewer.position()?.zoom || 1) - .1); };
  $('#zoom-in').onclick = () => { if (independent()) viewer?.setZoom((viewer.position()?.zoom || 1) + .1); };
  function updateFollow() {
    orientation.hidden = !master;
    rtl.disabled = !ready;
    $('#follow').textContent = following ? 'Following Master' : 'Browse independently'; $('#follow').setAttribute('aria-pressed', String(following));
    $('#pdf').classList.toggle('locked', !master && following);
    $<HTMLButtonElement>('#follow').disabled = !ready;
    $<HTMLButtonElement>('#return').disabled = !ready || !room;
    for (const selector of ['#previous', '#next', '#page', '#zoom-out', '#zoom-in']) ($<HTMLButtonElement | HTMLInputElement>(selector)).disabled = !ready || !independent();
  }
  $('#follow').onclick = () => { following = !following; if (following && room) viewer?.follow(room.position, true); else viewer?.cancelFollow(); updateFollow(); };
  $('#return').onclick = () => { following = true; if (room) viewer?.follow(room.position, true); updateFollow(); };
  updateFollow();
  const recovery = document.createElement('section');
  recovery.className = 'room-recovery'; recovery.hidden = true;
  $('#pdf').before(recovery);
  function unavailable(title: string, explanation: string) {
    if (token !== generation) return;
    ready = false; master = false; viewer?.cancelFollow();
    orientation.hidden = true;
    $('#role').textContent = 'Room unavailable';
    $('#follow-controls').hidden = true;
    $('#pdf').hidden = true;
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
    $('#role').textContent = master ? 'You are the Master' : 'Follower'; $('#follow-controls').hidden = master;
    if (first) {
      recovery.hidden = true; $('#pdf').hidden = false; $('.toolbar').hidden = false;
      $<HTMLButtonElement>('#share').disabled = false;
      try {
        await viewer!.load(next.pdfUrl);
        if (token !== generation) return;
        ready = true; $('#count').textContent = ` / ${viewer!.count}`; $<HTMLInputElement>('#page').max = String(viewer!.count);
        viewer!.follow(room!.position, true); updateFollow();
      } catch (error) { unavailable('Could not open the songbook', `${errorText(error)} Try again, or return home to join another room.`); }
    } else if (ready && !master && following && (next.position.sequence || 0) >= lastSequence) {
      viewer!.follow(next.position, Boolean(previous && Math.abs(previous.page - next.position.page) > 1));
    }
    lastSequence = Math.max(lastSequence, next.position.sequence || 0);
  }
  function status(value: Connection) {
    if (token !== generation) return;
    const reconnected = connection !== 'Connected' && value === 'Connected'; connection = value;
    $('#connection').textContent = value; $('#connection').classList.toggle('online', value === 'Connected');
    if (reconnected && ready) {
      if (master) { const p = viewer?.position(); if (p) publisher?.push(p, true); }
      else if (following && room) viewer?.follow(room.position, true);
    }
  }
  try { await service.init(); if (token !== generation) return; service.watch(code, next => void receive(next), status, error => unavailable('Could not join the room', error)); }
  catch (error) { unavailable('Could not join the room', errorText(error)); }
}

window.addEventListener('popstate', route);
function route() { const code = new URLSearchParams(location.search).get('room'); if (code && validCode(code)) void openRoom(code); else home(); }
route();
