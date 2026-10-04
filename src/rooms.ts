import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, get, onValue, runTransaction, set, serverTimestamp, connectDatabaseEmulator, type Database } from 'firebase/database';
import { roomCode, normalizePosition, type Room, type Position } from './model';
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
  private serverOffset = 0;
  private initialized = false;
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
    const now = Date.now() + this.serverOffset;
    const room: Room = { masterId: this.uid, ...songbook, createdAt: now, expiresAt: now + 86400000, position: { page: 1, offset: 0, zoom: 1, sequence: 0, updatedAt: now } };
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
    let expiresAt = Infinity;
    const accept = (room: Room | null) => {
      expiresAt = room?.expiresAt || Infinity;
      this.sequence = Math.max(this.sequence, room?.position.sequence || 0);
      if (room?.masterId !== this.uid) this.master = false;
      onRoom(room && room.expiresAt > Date.now() + this.serverOffset ? room : null);
    };
    const offline = () => onConnection('Offline');
    const online = () => onConnection(this.connected ? 'Connected' : 'Reconnecting…');
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    this.cleanups.push(() => { window.removeEventListener('offline', offline); window.removeEventListener('online', online); });
    const expiry = window.setInterval(() => {
      if (expiresAt <= Date.now() + this.serverOffset) { this.master = false; onRoom(null); }
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
          handle(await response.json());
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
  async publish(position: Position) {
    if (!this.master || !this.code || !this.connected || !navigator.onLine) return;
    const value = { ...normalizePosition(position), sequence: ++this.sequence, updatedAt: Date.now() + this.serverOffset };
    if (this.db) await set(ref(this.db, `rooms/${this.code}/position`), { ...value, updatedAt: serverTimestamp() });
    else if (localServerConfigured) {
      const token = sessionStorage.getItem(`music-master-token:${this.code}`);
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
  leave() { this.cleanups.forEach(fn => fn()); this.cleanups = []; this.channel?.close(); this.channel = undefined; this.onRoom = undefined; this.master = false; this.connected = false; this.sequence = 0; this.code = ''; }
}
