// Creates/signs into the requested Settings account using server-side environment
// configuration. Never prints passwords or ID/refresh tokens.
import { loadEnv } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { settingsCredential } from '../src/settings-password.mjs';
const env = { ...loadEnv('deployment', process.cwd(), ''), ...process.env };
const password = env.MUSIC_ADMIN_PASSWORD;
if (!password || !env.VITE_FIREBASE_API_KEY) throw new Error('Set MUSIC_ADMIN_PASSWORD and Firebase configuration first.');
const payload = { email: env.VITE_ADMIN_EMAIL || 'settings@music-room.app', password: settingsCredential(password), returnSecureToken: true };
async function call(action) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${env.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { ok: response.ok, value: await response.json() };
}
let result = await call('signInWithPassword');
if (!result.ok && ['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND'].includes(result.value.error?.message)) result = await call('signUp');
if (!result.ok) throw new Error(result.value.error?.message || 'Settings account setup failed.');
await mkdir('.local-data', { recursive: true });
await writeFile('.local-data/admin-uid.txt', result.value.localId);
console.log(`Settings administrator UID: ${result.value.localId}`);
console.log('Allowlist this UID in /admins, and use it in the Supabase upload policy.');
