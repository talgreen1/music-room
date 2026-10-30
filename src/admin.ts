import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { getDatabase, get, ref, remove, set, update, serverTimestamp, runTransaction } from 'firebase/database';
import { cloudConfigured, localServerConfigured, songbook } from './rooms';
import { validateSongbook, type Songbook } from './songbook';
import { validateFile, fileUrls, MAX_IMAGE_BYTES, type SharedFile } from './sheets';
import { availableSongs, unusedDeletedSongs, roomUploads, type SavedSong } from './song-library';
import { uploadLibraryPdf } from './file-upload';
import { uploadGitHubFile, deleteGitHubFiles } from './github-storage';
import type { Room } from './model';
import { settingsCredential } from './settings-password.mjs';
import { validateDiagnosticReport, type DiagnosticReport } from './diagnostic-report';

export class SettingsService {
  async diagnosticReports(code: string): Promise<Record<string, Record<string, DiagnosticReport>>> {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter a six-digit room code.');
    if (localServerConfigured) return this.request(`diagnostics/${code}`);
    const { db } = this.cloud();
    const records: Record<string, Record<string, DiagnosticReport>> = (await get(ref(db, `syncDiagnostics/${code}`))).val() || {};
    for (const [uid, sessions] of Object.entries(records)) {
      for (const [id, report] of Object.entries(sessions)) {
        if (report.expiresAt <= Date.now()) { await remove(ref(db, `syncDiagnostics/${code}/${uid}/${id}`)); delete sessions[id]; }
        else sessions[id] = validateDiagnosticReport({ ...report, events: Object.values(report.events) });
      }
      if (!Object.keys(sessions).length) delete records[uid];
    }
    return records;
  }
  async deleteDiagnosticReports(code: string) {
    if (!/^\d{6}$/.test(code)) throw new Error('Enter a six-digit room code.');
    if (localServerConfigured) await this.request(`diagnostics/${code}`, 'DELETE');
    else await remove(ref(this.cloud().db, `syncDiagnostics/${code}`));
  }
  private cloud() {
    const env = import.meta.env;
    const app = getApps().find(app => app.name === 'settings') || initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, databaseURL: env.VITE_FIREBASE_DATABASE_URL, projectId: env.VITE_FIREBASE_PROJECT_ID }, 'settings');
    return { auth: getAuth(app), db: getDatabase(app) };
  }
  private async request(path: string, method = 'GET', data?: unknown) {
    const response = await fetch(`/api/admin/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Settings request failed.'); return result;
  }
  async login(password: string) {
    if (localServerConfigured) { await this.request('login', 'POST', { password }); return; }
    if (!cloudConfigured) throw new Error('Settings requires the local server or Firebase.');
    const { auth, db } = this.cloud(); await setPersistence(auth, inMemoryPersistence);
    try {
      await signInWithEmailAndPassword(auth, import.meta.env.VITE_ADMIN_EMAIL || 'settings@music-room.app', settingsCredential(password));
      await get(ref(db, 'rooms')); // Rules authorize only a provisioned administrator.
    } catch { await signOut(auth); throw new Error('Incorrect password or Settings has not been configured.'); }
  }
  async logout() { if (localServerConfigured) await this.request('logout', 'POST'); else if (cloudConfigured) await signOut(this.cloud().auth); }
  async grantRoomControl(code: string, memberId: string) {
    if (!/^\d{6}$/.test(code) || !/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) throw new Error('Invalid room participant.');
    if (localServerConfigured) await this.request(`rooms/${code}/control`, 'POST', { memberId });
    else await update(ref(this.cloud().db, `rooms/${code}`), { [`controllers/${memberId}`]: true, [`controlRequests/${memberId}`]: null });
  }
  async rooms(): Promise<Record<string, Room>> { return localServerConfigured ? this.request('rooms') : (await get(ref(this.cloud().db, 'rooms'))).val() || {}; }
  async deleteRooms(code?: string, deleteFiles = false) {
    if (code !== undefined && !/^\d{6}$/.test(code)) throw new Error('Invalid room code.');
    if (localServerConfigured) await this.request(`rooms${code ? `/${code}` : ''}`, 'DELETE', { deleteFiles });
    else {
      const { db } = this.cloud();
      const [rooms, songs, defaultId] = await Promise.all([this.rooms(), this.songs(), this.defaultFile()]);
      const selected = code ? (rooms[code] ? { [code]: rooms[code] } : {}) : rooms;
      const changes: Record<string, unknown> = {};
      for (const roomCode of Object.keys(selected)) changes[`rooms/${roomCode}`] = null;
      if (deleteFiles) for (const song of roomUploads(songs, selected)) if (song.id !== defaultId) changes[`songs/${song.id}/deletedAt`] = serverTimestamp();
      if (Object.keys(changes).length) await update(ref(db), changes);
      await this.cleanupSongs();
    }
  }
  async uploadSegment(blob: Blob, sheetId: string, index: number): Promise<string> {
    if (blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_IMAGE_BYTES || !/^[a-f0-9]{32}$/.test(sheetId) || !Number.isInteger(index) || index < 0 || index >= 40) throw new Error('Invalid screenshot segment.');
    if (localServerConfigured) {
      const response = await fetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Screenshot upload failed.'); return result.url;
    }
    const user = this.cloud().auth.currentUser;
    if (!user) throw new Error('Sign in to Settings.');
    return uploadGitHubFile(blob, sheetId, `${index}.jpg`, user);
  }
  async saveSong(sheet: SharedFile): Promise<void> {
    const song = validateFile(sheet);
    if (localServerConfigured) { await this.request('songs', 'POST', song); return; }
    const { auth, db } = this.cloud(); const user = auth.currentUser; if (!user) throw new Error('Sign in to Settings.');
    const result = await runTransaction(ref(db, `songs/${song.id}`), current => current === null ? { ...song, ownerId: user.uid, createdAt: serverTimestamp() } : undefined, { applyLocally: false });
    if (!result.committed) throw new Error('This song has already been saved.');
  }
  async songs(): Promise<SavedSong[]> {
    if (localServerConfigured) return this.request('songs');
    await this.cleanupSongs();
    return availableSongs((await get(ref(this.cloud().db, 'songs'))).val() || {});
  }
  async deleteSong(id: string) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid song ID.');
    if (localServerConfigured) { await this.request(`songs/${id}`, 'DELETE'); return; }
    const { db } = this.cloud();
    if (!(await get(ref(db, `songs/${id}`))).exists()) return;
    // Hide first: room rules reject selecting tombstones before cleanup reads rooms.
    await update(ref(db, `songs/${id}`), { deletedAt: serverTimestamp() });
    await this.cleanupSongs();
  }
  private async cleanupSongs() {
    const { auth, db } = this.cloud();
    const records: Record<string, SavedSong> = (await get(ref(db, 'songs'))).val() || {};
    if (!Object.values(records).some(song => song.deletedAt !== undefined)) return;
    const rooms = await this.rooms();
    const activeIds = new Set(Object.values(rooms).filter(room => room.expiresAt > Date.now()).flatMap(room => room.sheet ? [room.sheet.id] : []));
    for (const song of unusedDeletedSongs(records, activeIds)) {
      if (!auth.currentUser) throw new Error('Sign in to Settings to clean up files.');
      if (!await deleteGitHubFiles(fileUrls(song), song.ownerId, song.id, auth.currentUser)) throw new Error('File hidden. Cleanup supports only the configured GitHub storage; original bytes and catalog metadata were retained.');
      await remove(ref(db, `songs/${song.id}`));
    }
  }
  async defaultPdf(): Promise<Songbook> {
    if (localServerConfigured) return validateSongbook(await (await fetch('/api/songbook')).json());
    return validateSongbook((await get(ref(this.cloud().db, 'songbook'))).val() || songbook);
  }
  async updatePdf(value: Songbook) {
    const descriptor = validateSongbook(value);
    if (localServerConfigured) await this.request('songbook', 'PUT', descriptor);
    else await set(ref(this.cloud().db, 'songbook'), descriptor);
  }
  async defaultFile(): Promise<string> {
    if (localServerConfigured) return (await (await fetch('/api/default-file')).json()).id;
    return (await get(ref(this.cloud().db, 'defaultFile'))).val() || 'pdf';
  }
  async setDefault(id: string) {
    if (id !== 'pdf' && !/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid file ID.');
    if (localServerConfigured) await this.request('default-file', 'PUT', { id });
    else await set(ref(this.cloud().db, 'defaultFile'), id);
  }
  async uploadPdf(file: File, id: string): Promise<string> {
    return uploadLibraryPdf(file, id, localServerConfigured ? null : this.cloud().auth.currentUser, localServerConfigured ? '/api/admin/upload' : undefined);
  }
}
