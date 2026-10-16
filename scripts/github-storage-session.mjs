import { loadEnv } from 'vite';
import { settingsCredential } from '../src/settings-password.mjs';

// Retry only read/sign-in operations, never uploads or catalog mutations.
export async function cloudRead(url, options = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(url, { ...options, signal: AbortSignal.timeout(20000) }); }
    catch (error) { if (attempt >= 2 || !(error instanceof TypeError || error.name === 'TimeoutError')) throw error; }
  }
}

/** CLI-only Settings session. Never log this object or any URLs containing auth. */
export async function storageSession() {
  const env = { ...loadEnv('deployment', process.cwd(), ''), ...process.env };
  if (!env.VITE_FIREBASE_API_KEY || !env.MUSIC_ADMIN_PASSWORD) throw new Error('Configure the ignored deployment environment and Settings password.');
  const response = await cloudRead(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.VITE_ADMIN_EMAIL || 'settings@music-room.app', password: settingsCredential(env.MUSIC_ADMIN_PASSWORD), returnSecureToken: true })
  });
  if (!response.ok) throw new Error('Settings sign-in failed.');
  const { idToken: token, localId: uid } = await response.json();
  const origin = (env.VITE_GITHUB_STORAGE_URL || 'https://music-room-files.talgreen1.workers.dev').replace(/\/$/, '');
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(origin)) throw new Error('Invalid Worker origin.');
  async function db(path, method = 'GET', body) {
    const send = method === 'GET' ? cloudRead : fetch;
    const response = await send(`${env.VITE_FIREBASE_DATABASE_URL.replace(/\/$/, '')}/${path}.json?auth=${encodeURIComponent(token)}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new Error(`Database ${method} failed (${response.status}).`);
    return response.json();
  }
  // Authenticate Settings authority independently from identity.
  await db('rooms');
  return { env, token, uid, origin, db };
}
