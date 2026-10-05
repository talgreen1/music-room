// Before Hosting: verify shared PDF storage and default permissions, then restore.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getDatabase, ref, get, set, update, remove, runTransaction, serverTimestamp, goOffline } from 'firebase/database';
import { settingsCredential } from '../src/settings-password.mjs';

const env = { ...loadEnv('deployment', process.cwd(), ''), ...process.env };
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, databaseURL: env.VITE_FIREBASE_DATABASE_URL, projectId: env.VITE_FIREBASE_PROJECT_ID };
assert.ok(Object.values(config).every(Boolean) && env.MUSIC_ADMIN_PASSWORD && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Configure cloud Settings/Storage.');
const apps = ['master', 'follower', 'admin'].map(name => initializeApp(config, `file-test-${name}-${Date.now()}`));
const auths = apps.map(app => getAuth(app)), dbs = apps.map(app => getDatabase(app));
const files = [], codes = [];
let admin, originalDefault, defaultChanged = false, failed = false;
const deadline = setTimeout(() => { console.error('Cloud files check timed out.'); process.exit(1); }, 90000);
const denied = operation => assert.rejects(operation, error => /permission.denied/i.test(String(error)));
const storage = async (user, path, method, body, type = 'application/pdf') => fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/${path}`, { method, headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': type, 'x-upsert': 'false' }, body });
try {
  await Promise.all(auths.map(auth => setPersistence(auth, inMemoryPersistence)));
  const [master, follower, administrator] = await Promise.all([signInAnonymously(auths[0]), signInAnonymously(auths[1]), signInWithEmailAndPassword(auths[2], env.VITE_ADMIN_EMAIL || 'settings@music-room.app', settingsCredential(env.MUSIC_ADMIN_PASSWORD))]);
  admin = administrator.user;
  originalDefault = (await get(ref(dbs[2], 'defaultFile'))).val() || 'pdf';
  const descriptor = (await get(ref(dbs[2], 'songbook'))).val() || { pdfUrl: '/songbooks/songbook-2026-10.pdf', pdfTitle: 'Book', pdfVersion: '2026-10' };
  async function room(sheet) {
    const now = Date.now();
    const value = { ...descriptor, masterId: master.user.uid, createdAt: now, expiresAt: now + 86400000, ...(sheet ? { sheet } : {}), position: { page: 1, offset: 0, zoom: 1, sourceId: sheet?.id || 'pdf', sequence: 0, updatedAt: now } };
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(100000 + Math.floor(Math.random() * 900000));
      const result = await runTransaction(ref(dbs[0], `rooms/${code}`), current => current === null ? value : undefined, { applyLocally: false });
      if (result.committed) { codes.push(code); return code; }
    }
    throw new Error('Could not reserve test room.');
  }
  const code = await room(), bytes = await readFile('public/songbooks/songbook-2026-10.pdf');
  for (const [index, user] of [master.user, admin].entries()) {
    const id = randomBytes(16).toString('hex'), path = `${user.uid}/${id}/document.pdf`;
    const file = { id, title: `${index ? 'Settings' : 'Master'} cloud PDF check`, pdfUrl: `${env.VITE_SUPABASE_URL}/storage/v1/object/public/room-pdfs/${path}` };
    files.push({ file, path });
    const uploaded = await storage(user, `room-pdfs/${path}`, 'POST', bytes);
    assert.ok(uploaded.ok, `PDF upload failed: ${uploaded.status} ${await uploaded.text()}`);
    assert.deepEqual(Buffer.from(await (await fetch(file.pdfUrl)).arrayBuffer()), bytes);
    const overwrite = await storage(user, `room-pdfs/${path}`, 'POST', bytes); assert.ok(!overwrite.ok); await overwrite.arrayBuffer();
    await set(ref(dbs[index ? 2 : 0], `songs/${id}`), { ...file, ownerId: user.uid, createdAt: serverTimestamp(), ...(index ? {} : { roomCode: code }) });
  }
  const first = files[0].file, second = files[1].file;
  const position = (sourceId, sequence) => ({ sourceId, sequence, page: 37, offset: .6, horizontal: .7, zoom: 2, updatedAt: serverTimestamp() });
  await denied(() => set(ref(dbs[0], 'defaultFile'), first.id));
  await denied(() => set(ref(dbs[1], 'defaultFile'), first.id));
  await denied(() => set(ref(dbs[2], 'defaultFile'), 'f'.repeat(32)));
  await set(ref(dbs[2], 'defaultFile'), first.id); defaultChanged = true;
  assert.equal((await get(ref(dbs[1], 'defaultFile'))).val(), first.id);
  await denied(() => remove(ref(dbs[2], `songs/${first.id}`)));
  await denied(() => update(ref(dbs[2], `songs/${first.id}`), { deletedAt: serverTimestamp() }));
  const defaultRoom = await room(first);
  assert.equal((await get(ref(dbs[1], `rooms/${defaultRoom}`))).val().sheet.pdfUrl, first.pdfUrl);
  await denied(() => update(ref(dbs[1], `rooms/${code}`), { sheet: second, position: position(second.id, 1) }));
  await update(ref(dbs[0], `rooms/${code}`), { sheet: second, position: position(second.id, 1) });
  const joined = (await get(ref(dbs[1], `rooms/${code}`))).val();
  assert.equal(joined.sheet.pdfUrl, second.pdfUrl); assert.equal(joined.position.page, 37); assert.equal(joined.position.horizontal, .7);
  await denied(() => set(ref(dbs[0], `rooms/${code}/position`), position(first.id, 2)));
  await denied(() => remove(ref(dbs[0], `songs/${second.id}`)));
  const unauthorized = { ...second, id: randomBytes(16).toString('hex'), ownerId: follower.user.uid, roomCode: code, createdAt: serverTimestamp() };
  await denied(() => set(ref(dbs[1], `songs/${unauthorized.id}`), unauthorized));
  await update(ref(dbs[2], `songs/${second.id}`), { deletedAt: serverTimestamp() });
  await denied(() => update(ref(dbs[0], `rooms/${defaultRoom}`), { sheet: second, position: position(second.id, 1) }));
  await set(ref(dbs[0], `rooms/${code}/position`), position(second.id, 2));
  const foreignUpload = await storage(follower.user, `room-pdfs/${files[0].path}`, 'POST', bytes); assert.ok(!foreignUpload.ok); await foreignUpload.arrayBuffer();
  const deletion = await storage(follower.user, 'room-pdfs', 'DELETE', JSON.stringify({ prefixes: [files[1].path] }), 'application/json'); await deletion.arrayBuffer();
  assert.deepEqual(Buffer.from(await (await fetch(second.pdfUrl)).arrayBuffer()), bytes, 'Followers cannot delete PDF bytes.');
  console.log('PASS: Master/Settings PDF uploads and exact downloads, immutability, owned paths, PDF room creation/switching and position sync, denied Followers/default/deletion, current-default protection and deleted-source rejection.');
} catch (error) { failed = true; console.error(error); }
finally {
  clearTimeout(deadline);
  if (admin) {
    try {
      if (defaultChanged) await set(ref(dbs[2], 'defaultFile'), originalDefault);
      for (const code of codes) await remove(ref(dbs[2], `rooms/${code}`));
      const rooms = (await get(ref(dbs[2], 'rooms'))).val() || {};
      const inUse = new Set(Object.values(rooms).filter(room => room.expiresAt > Date.now()).map(room => room.sheet?.id));
      for (const { file, path } of files) {
        if (inUse.has(file.id)) { console.log('Retained verification file selected by another active room.'); continue; }
        const deleted = await storage(admin, 'room-pdfs', 'DELETE', JSON.stringify({ prefixes: [path] }), 'application/json');
        assert.ok(deleted.ok, 'Administrator PDF cleanup failed.'); await deleted.arrayBuffer();
        await remove(ref(dbs[2], `songs/${file.id}`));
      }
      console.log('PASS: restored default and cleaned up disposable rooms/files.');
    } catch (error) { failed = true; console.error('Cloud test cleanup failed:', error); }
  }
  dbs.forEach(goOffline); await Promise.all(apps.map(deleteApp));
}
process.exit(failed ? 1 : 0);
