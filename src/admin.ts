import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { getDatabase, get, ref, remove, set } from 'firebase/database';
import { cloudConfigured, localServerConfigured, songbook } from './rooms';
import { validateSongbook, validatePdfUpload, type Songbook } from './songbook';
import type { Room } from './model';
import { settingsCredential } from './settings-password.mjs';

export class SettingsService {
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
  async rooms(): Promise<Record<string, Room>> { return localServerConfigured ? this.request('rooms') : (await get(ref(this.cloud().db, 'rooms'))).val() || {}; }
  async deleteRooms(code?: string) {
    if (localServerConfigured) await this.request(`rooms${code ? `/${code}` : ''}`, 'DELETE');
    else await remove(ref(this.cloud().db, `rooms${code ? `/${code}` : ''}`));
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
  async uploadPdf(file: File): Promise<string> {
    validatePdfUpload(file.size, new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
    if (localServerConfigured) {
      const response = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'PDF upload failed.'); return result.pdfUrl;
    }
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('PDF uploads require Supabase configuration.');
    const user = this.cloud().auth.currentUser;
    if (!user) throw new Error('Sign in to Settings.');
    const filename = `${Date.now()}-${crypto.randomUUID()}.pdf`;
    const response = await fetch(`${url}/storage/v1/object/songbooks/${filename}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/pdf', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' }, body: file
    });
    if (!response.ok) throw new Error('PDF upload failed. Check Supabase availability and administrator permissions.');
    return `${url}/storage/v1/object/public/songbooks/${filename}`;
  }
}
