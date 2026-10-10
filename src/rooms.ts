import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, get, onValue, runTransaction, set, update, serverTimestamp, connectDatabaseEmulator, type Database } from 'firebase/database';
import { availableSongs, type SavedSong } from './song-library';
import { validateFile, type SharedFile } from './sheets';
import { roomCode, normalizePosition, type Room, type Position } from './model';
import { uploadLibraryPdf } from './file-upload';
import { validateSongbook } from './songbook';
const env = import.meta.env;
let emulatorsConnected = false;
export const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true';
export const cloudConfigured = useEmulators || Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_DATABASE_URL && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_AUTH_DOMAIN);
export const localServerConfigured = env.DEV && !cloudConfigured;
export const songbook = { pdfUrl: env.VITE_PDF_URL || '/songbooks/songbook-2026-10.pdf', pdfVersion: env.VITE_PDF_VERSION || '2026-10', pdfTitle: env.VITE_PDF_TITLE || 'חוברת שירים' };
export type Connection = 'Connected' | 'Reconnecting…' | 'Offline';
export class RoomService {
  private db?: Database;
  private uid = '';
  private channel?: BroadcastChannel;
  private cleanups: (() => void)[] = [];
  private code = '';
  private master = false;
  private connected = false;
  private sequence = 0;
  private sourceId = 'pdf';
  private serverOffset = 0;
  private initialized = false;
  private activeRoom = false;
  private uploadToken = '';
  private memberId = '';
  private controlling = false;
  private onRoom?: (room: Room | null) => void;
  async init() {
    if (this.initialized) return;
    if (!useEmulators && !cloudConfigured && [env.VITE_FIREBASE_API_KEY, env.VITE_FIREBASE_AUTH_DOMAIN, env.VITE_FIREBASE_DATABASE_URL, env.VITE_FIREBASE_PROJECT_ID].some(Boolean)) {
      throw new Error('Firebase settings are incomplete. Fill all four Firebase values in .env.local, or clear them to use the local demo.');
    }
    if (cloudConfigured) {
      const app = getApps().find(app => app.name === '[DEFAULT]') || initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key', authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-music-room.firebaseapp.com', databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'https://demo-music-room-default-rtdb.firebaseio.com', projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-music-room' });
      this.db = getDatabase(app);
      const auth = getAuth(app);
      if (useEmulators && !emulatorsConnected) {
        const host = env.VITE_FIREBASE_EMULATOR_HOST || location.hostname;
        connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
        connectDatabaseEmulator(this.db, host, 9000);
        emulatorsConnected = true;
      }
      const credential = await signInAnonymously(auth);
      this.uid = credential.user.uid;
      this.serverOffset = await new Promise<number>((resolve, reject) => {
        onValue(ref(this.db!, '.info/serverTimeOffset'), snapshot => resolve(snapshot.val() || 0), reject, { onlyOnce: true });
      });
    } else {
      this.uid = sessionStorage.getItem('music-device') || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('music-device', this.uid);
    }
    this.initialized = true;
  }
  private localRead(code: string): Room | null {
    const raw = localStorage.getItem(`music-room:${code}`);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  async create(): Promise<string> {
    if (localServerConfigured) {
      const response = await fetch('/api/local-rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId: this.uid, ...songbook }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create a local room.');
      sessionStorage.setItem(`music-master:${result.code}`, '1');
      sessionStorage.setItem(`music-master-token:${result.code}`, result.token);
      return result.code;
    }
    if (this.db) {
      const descriptor = await get(ref(this.db, 'songbook'));
      if (descriptor.exists()) Object.assign(songbook, validateSongbook(descriptor.val()));
    }
    let selected: SharedFile | undefined;
    if (this.db) {
      const id = (await get(ref(this.db, 'defaultFile'))).val() || 'pdf';
      if (id !== 'pdf') {
        const saved = (await get(ref(this.db, `songs/${id}`))).val() as SavedSong | null;
        if (!saved || saved.deletedAt !== undefined) throw new Error('Default file is unavailable. Please try again.');
        selected = validateFile(saved);
      }
    }
    const now = Date.now() + this.serverOffset;
    const room: Room = { masterId: this.uid, ...songbook, ...(selected ? { sheet: selected } : {}), createdAt: now, expiresAt: now + 86400000, position: { page: 1, offset: 0, zoom: 1, sourceId: selected?.id || 'pdf', sequence: 0, updatedAt: now } };
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = roomCode();
      if (this.db) {
        const result = await runTransaction(ref(this.db, `rooms/${code}`), current => current === null ? room : undefined, { applyLocally: false });
        if (result.committed) { sessionStorage.setItem(`music-master:${code}`, '1'); return code; }
      } else if (!this.localRead(code)) {
        localStorage.setItem(`music-room:${code}`, JSON.stringify(room));
        sessionStorage.setItem(`music-master:${code}`, '1');
        return code;
      }
    }
    throw new Error('Could not reserve a room. Please try again.');
  }
  watch(code: string, onRoom: (room: Room | null) => void, onConnection: (status: Connection) => void, onError: (message: string) => void) {
    this.leave(); this.code = code; this.onRoom = onRoom;
    this.master = sessionStorage.getItem(`music-master:${code}`) === '1';
    this.uploadToken = sessionStorage.getItem(`music-master-token:${code}`) || '';
    let expiresAt = Infinity;
    const accept = (room: Room | null) => {
      this.sourceId = room?.sheet?.id || 'pdf';
      expiresAt = room?.expiresAt || Infinity;
      this.sequence = Math.max(this.sequence, room?.position.sequence || 0);
      if (room?.masterId !== this.uid) this.master = false;
      this.activeRoom = Boolean(room && room.expiresAt > Date.now() + this.serverOffset);
      this.controlling = Boolean(this.activeRoom && room?.controllers?.[this.memberId || this.uid]);
      onRoom(this.activeRoom ? room : null);
    };
    const offline = () => onConnection('Offline');
    const online = () => onConnection(this.connected ? 'Connected' : 'Reconnecting…');
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    this.cleanups.push(() => { window.removeEventListener('offline', offline); window.removeEventListener('online', online); });
    const expiry = window.setInterval(() => {
      if (expiresAt <= Date.now() + this.serverOffset) { this.master = false; this.activeRoom = false; onRoom(null); }
    }, 10000);
    this.cleanups.push(() => clearInterval(expiry));
    if (this.db) {
      this.cleanups.push(onValue(ref(this.db, `rooms/${code}`), snapshot => accept(snapshot.val()), error => onError(error.message)));
      this.cleanups.push(onValue(ref(this.db, '.info/connected'), snapshot => { this.connected = Boolean(snapshot.val()); onConnection(this.connected ? 'Connected' : navigator.onLine ? 'Reconnecting…' : 'Offline'); }));
    } else if (localServerConfigured) {
      const controller = new AbortController();
      let events: EventSource | undefined;
      let live = true;
      this.cleanups.push(() => { live = false; controller.abort(); events?.close(); });
      const handle = (payload: { room: Room | null; serverTime: number }) => {
        this.serverOffset = payload.serverTime - Date.now();
        accept(payload.room);
      };
      void (async () => {
        try {
          const response = await fetch(`/api/local-rooms/${code}`, { signal: controller.signal });
          if (!live) return;
          if (response.status === 404) { onRoom(null); return; }
          if (!response.ok) throw new Error('Could not connect to the local room server.');
          const payload = await response.json();
          if (payload.room?.masterId !== this.uid || !this.uploadToken) {
            const joined = await fetch(`/api/local-rooms/${code}/members`, { method: 'POST', signal: controller.signal });
            if (!joined.ok) throw new Error('Could not join the room.');
            const member = await joined.json(); if (!live) return;
            this.uploadToken = member.token;
            this.memberId = member.memberId;
          }
          handle(payload);
          if (!live) return;
          events = new EventSource(`/api/local-rooms/${code}/events`);
          events.onopen = () => { if (live) { this.connected = true; onConnection('Connected'); } };
          events.onmessage = event => { if (live) handle(JSON.parse(event.data)); };
          events.onerror = () => {
            if (!live) return;
            this.connected = false; onConnection(navigator.onLine ? 'Reconnecting…' : 'Offline');
            // EventSource hides HTTP status; detect a server restart/expired room explicitly.
            if (navigator.onLine) void fetch(`/api/local-rooms/${code}`, { signal: controller.signal }).then(response => {
              if (live && response.status === 404) { events?.close(); accept(null); }
            }).catch(() => {});
          };
        } catch (error) { if (live) onError(error instanceof Error ? error.message : 'Could not connect to the local room server.'); }
      })();
    } else {
      this.channel = new BroadcastChannel(`music-room:${code}`);
      this.channel.onmessage = () => accept(this.localRead(code));
      const changed = (event: StorageEvent) => { if (event.key === `music-room:${code}`) accept(this.localRead(code)); };
      window.addEventListener('storage', changed);
      this.cleanups.push(() => window.removeEventListener('storage', changed));
      this.connected = true; accept(this.localRead(code)); onConnection('Connected');
    }
  }
  isMaster(room: Room) { return this.master && room.masterId === this.uid; }
  canControl() { return this.activeRoom && (this.master || this.controlling); }
  participantId() { return this.memberId || this.uid; }
  roomCode() { return this.code; }
  async control(action: 'request' | 'release' | 'approve' | 'deny', memberId = this.participantId()) {
    const code = this.code; if (!code || !this.activeRoom || !navigator.onLine) throw new Error('Connect to an active room.');
    if (localServerConfigured) {
      const response = await fetch(`/api/local-rooms/${code}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.uploadToken}` }, body: JSON.stringify({ action, memberId }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not update control access.');
    } else if (this.db) {
      if (action === 'approve') await update(ref(this.db, `rooms/${code}`), { [`controllers/${memberId}`]: true, [`controlRequests/${memberId}`]: null });
      else if (action === 'deny') await set(ref(this.db, `rooms/${code}/controlRequests/${memberId}`), null);
      else if (action === 'request') await set(ref(this.db, `rooms/${code}/controlRequests/${this.uid}`), true);
      else await update(ref(this.db, `rooms/${code}`), { [`controllers/${this.uid}`]: null, [`controlRequests/${this.uid}`]: null });
    } else throw new Error('Shared control requires the local server or Firebase.');
  }
  async publish(position: Position) {
    if (!this.canControl() || !this.code || !this.connected || !navigator.onLine) return;
    if (position.sourceId && position.sourceId !== this.sourceId) return;
    const knownSequence = this.sequence;
    const value = { ...normalizePosition(position), sourceId: position.sourceId || this.sourceId, sequence: ++this.sequence, updatedAt: Date.now() + this.serverOffset };
    if (this.db) await runTransaction(ref(this.db, `rooms/${this.code}/position`), current => {
      // Firebase may first call a transaction with null when its local cache is empty.
      // Seed from the subscribed sequence; the server retries against its actual state.
      current ||= { sourceId: value.sourceId, sequence: knownSequence };
      if ((current.sourceId || 'pdf') !== value.sourceId) return;
      return { ...value, sequence: (current.sequence || 0) + 1, updatedAt: serverTimestamp() };
    }, { applyLocally: false });
    else if (localServerConfigured) {
      const token = this.uploadToken;
      if (!token) throw new Error('Master session is missing. Create a new room.');
      const response = await fetch(`/api/local-rooms/${this.code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not update the local room.');
    }
    else {
      const room = this.localRead(this.code);
      if (!room || room.masterId !== this.uid) return;
      room.position = value;
      localStorage.setItem(`music-room:${this.code}`, JSON.stringify(room));
      this.channel?.postMessage(value); this.onRoom?.(room);
    }
  }
  async originalPdf() {
    const descriptor = localServerConfigured ? validateSongbook(await (await fetch('/api/songbook')).json())
      : this.db ? validateSongbook((await get(ref(this.db, 'songbook'))).val() || songbook) : songbook;
    return { id: 'pdf', title: descriptor.pdfTitle, pdfUrl: descriptor.pdfUrl };
  }
  async songs(): Promise<SavedSong[]> {
    if (localServerConfigured) { const response = await fetch('/api/songs'); if (!response.ok) throw new Error('Could not load saved songs.'); return response.json(); }
    if (!this.db) throw new Error('The song library requires the local server or Firebase.');
    return availableSongs((await get(ref(this.db, 'songs'))).val() || {});
  }
  async saveSong(sheet: SharedFile) {
    this.requireUploadRoom();
    const value = validateFile(sheet);
    if (localServerConfigured) {
      const response = await fetch(`/api/local-rooms/${this.code}/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.uploadToken}` }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save the song.'); return;
    }
    if (!this.db) throw new Error('The song library requires the local server or Firebase.');
    await set(ref(this.db, `songs/${value.id}`), { ...value, ownerId: this.uid, roomCode: this.code, createdAt: serverTimestamp() });
  }
  async changeSheet(sheet?: SharedFile, location = { page: 1, offset: 0 }) {
    if (!Number.isInteger(location.page) || location.page < 1 || location.page > 10000 || !Number.isFinite(location.offset) || location.offset < 0 || location.offset > 1) throw new Error('Invalid search location.');
    if (!this.canControl() || !this.code || !this.connected || !navigator.onLine) throw new Error('Room control permission is required.');
    const targetCode = this.code;
    let value = sheet ? validateFile(sheet) : undefined;
    if (value && this.db) { const saved = (await get(ref(this.db, `songs/${value.id}`))).val() as SavedSong | null; if (!saved || saved.deletedAt !== undefined) throw new Error('This song is no longer in the library.'); value = validateFile(saved); }
    if (this.code !== targetCode || !this.canControl() || !this.connected) throw new Error('Room changed. Select the song in the current room.');
    const position: Position = { page: location.page, offset: location.offset, zoom: 1, horizontal: 0, sourceId: value?.id || 'pdf', sequence: ++this.sequence, updatedAt: Date.now() + this.serverOffset };
    if (this.db) {
      for (let attempt = 0; ; attempt++) {
        const latest = (await get(ref(this.db, `rooms/${targetCode}`))).val() as Room | null;
        if (!latest || latest.expiresAt <= Date.now() + this.serverOffset || this.code !== targetCode || !this.canControl()) throw new Error('Room control session ended.');
        try { await update(ref(this.db, `rooms/${targetCode}`), { sheet: value || null, position: { ...position, sequence: (latest.position.sequence || 0) + 1, updatedAt: serverTimestamp() } }); break; }
        catch (error) { if (attempt >= 2 || !/permission.denied/i.test(String(error))) throw error; }
      }
    }
    else if (localServerConfigured) {
      const response = await fetch(`/api/local-rooms/${this.code}/sheet`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.uploadToken}` }, body: JSON.stringify({ sheet: value || null, location }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not share the sheet.');
    } else {
      const room = this.localRead(this.code); if (!room || room.masterId !== this.uid) throw new Error('Room unavailable.');
      if (value) room.sheet = value; else delete room.sheet;
      room.position = position; localStorage.setItem(`music-room:${this.code}`, JSON.stringify(room)); this.sourceId = position.sourceId!;
      this.channel?.postMessage(position); this.onRoom?.(room);
    }
  }
  async uploadPdf(file: File, id: string): Promise<string> {
    this.requireUploadRoom();
    const user = this.db ? getAuth(getApps().find(app => app.name === '[DEFAULT]')!).currentUser : null;
    return uploadLibraryPdf(file, id, user, localServerConfigured ? `/api/local-rooms/${this.code}/pdfs` : undefined, this.uploadToken || undefined);
  }
  async uploadSegment(blob: Blob, sheetId: string, index: number) {
    this.requireUploadRoom();
    if (blob.type !== 'image/jpeg' || !blob.size || blob.size > 3 * 1024 * 1024 || !/^[a-f0-9]{32}$/.test(sheetId) || !Number.isInteger(index) || index < 0 || index >= 40) throw new Error('Invalid screenshot segment.');
    if (localServerConfigured) {
      const response = await fetch(`/api/local-rooms/${this.code}/images`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${this.uploadToken}` }, body: blob });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Screenshot upload failed.'); return result.url as string;
    }
    if (!this.db) throw new Error('Screenshot sharing requires the local server or Firebase.');
    const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Screenshot storage has not been configured.');
    const user = getAuth(getApps().find(app => app.name === '[DEFAULT]')!).currentUser;
    if (!user) throw new Error('Reconnect to the room.');
    const filename = `${this.uid}/${sheetId}/${index}.jpg`;
    const response = await fetch(`${url}/storage/v1/object/room-sheets/${filename}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob });
    if (!response.ok) throw new Error('Screenshot upload failed. Check the room-sheets bucket and upload policy.');
    return `${url}/storage/v1/object/public/room-sheets/${filename}`;
  }
  private requireUploadRoom() {
    if (!this.code || !this.activeRoom || !navigator.onLine) throw new Error('Join an active room before uploading files.');
  }
  leave() { this.cleanups.forEach(fn => fn()); this.cleanups = []; this.channel?.close(); this.channel = undefined; this.onRoom = undefined; this.master = false; this.activeRoom = false; this.controlling = false; this.memberId = ''; this.uploadToken = ''; this.connected = false; this.sequence = 0; this.code = ''; }
}
