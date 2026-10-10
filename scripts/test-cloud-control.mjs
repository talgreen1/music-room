// Actual Firebase rules check. Run after deploying rules, before Hosting.
// Creates/deletes only its own rooms; never changes default/catalog/Storage.
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getDatabase, ref, get, set, update, remove, runTransaction, serverTimestamp, goOffline } from 'firebase/database';
import { settingsCredential } from '../src/settings-password.mjs';
const env = { ...loadEnv('deployment', process.cwd(), ''), ...process.env };
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, databaseURL: env.VITE_FIREBASE_DATABASE_URL, projectId: env.VITE_FIREBASE_PROJECT_ID };
assert.ok(Object.values(config).every(Boolean) && env.MUSIC_ADMIN_PASSWORD);
assert.notEqual(env.VITE_USE_FIREBASE_EMULATORS, 'true');
const apps = ['owner', 'controller', 'other', 'admin'].map(name => initializeApp(config, `control-test-${name}-${Date.now()}`));
const dbs = apps.map(app => getDatabase(app)), auths = apps.map(app => getAuth(app)), codes = [];
const deadline = setTimeout(() => { console.error('Cloud control test timed out.'); process.exit(1); }, 60000);
const denied = async write => assert.rejects(write, error => /permission.denied/i.test(String(error)));
async function loginAdmin() {
  await signInWithEmailAndPassword(auths[3], env.VITE_ADMIN_EMAIL || 'settings@music-room.app', settingsCredential(env.MUSIC_ADMIN_PASSWORD));
}
try {
  await Promise.all(auths.map(auth => setPersistence(auth, inMemoryPersistence)));
  const users = await Promise.all(auths.slice(0, 3).map(async auth => (await signInAnonymously(auth)).user));
  await loginAdmin();
  for (let n = 0; n < 2; n++) {
    for (;;) {
      const code = String(100000 + Math.floor(Math.random() * 900000)), now = Date.now();
      const room = { masterId: users[0].uid, createdAt: now, expiresAt: now + 86400000, pdfUrl: '/songbooks/songbook-2026-10.pdf', pdfVersion: '2026-10', pdfTitle: 'Control verification', position: { page: 1, offset: 0, zoom: 1, sequence: 0, sourceId: 'pdf', updatedAt: serverTimestamp() } };
      const result = await runTransaction(ref(dbs[0], `rooms/${code}`), value => value === null ? room : undefined, { applyLocally: false });
      if (result.committed) { codes.push(code); break; }
    }
  }
  const path = `rooms/${codes[0]}`, id = users[1].uid, other = users[2].uid;
  const pos = { page: 5, offset: .5, horizontal: .8, zoom: 2, sourceId: 'pdf', sequence: 1, updatedAt: serverTimestamp() };
  await set(ref(dbs[1], `${path}/controlRequests/${id}`), true);
  await denied(() => set(ref(dbs[1], `${path}/position`), pos));
  await denied(() => set(ref(dbs[1], `${path}/controllers/${id}`), true));
  await denied(() => set(ref(dbs[1], `${path}/controlRequests/${other}`), true));
  await remove(ref(dbs[0], `${path}/controlRequests/${id}`));
  await denied(() => set(ref(dbs[0], `${path}/controllers/${id}`), true));
  await set(ref(dbs[1], `${path}/controlRequests/${id}`), true);
  await update(ref(dbs[0], path), { [`controllers/${id}`]: true, [`controlRequests/${id}`]: null });
  await set(ref(dbs[1], `${path}/position`), pos);
  await denied(() => set(ref(dbs[1], `rooms/${codes[1]}/position`), pos));
  await set(ref(dbs[2], `${path}/controlRequests/${other}`), true);
  await denied(() => update(ref(dbs[1], path), { [`controllers/${other}`]: true, [`controlRequests/${other}`]: null }));
  await denied(() => remove(ref(dbs[1], path)));
  await denied(() => set(ref(dbs[1], `${path}/masterId`), id));
  await denied(() => set(ref(dbs[1], 'defaultFile'), 'pdf'));
  await denied(() => get(ref(dbs[1], 'rooms')));
  const publish = db => runTransaction(ref(db, `${path}/position`), current => ({ ...(current || pos), sequence: (current || pos).sequence + 1, updatedAt: serverTimestamp() }), { applyLocally: false });
  await Promise.all([publish(dbs[0]), publish(dbs[1])]);
  assert.equal((await get(ref(dbs[0], `${path}/position`))).val().sequence, 3);
  let nextSequence = 4;
  const catalog = (await get(ref(dbs[0], 'songs'))).val() || {};
  const saved = Object.values(catalog).find(song => !song.deletedAt);
  if (saved) {
    const sheet = Object.fromEntries(['id', 'title', 'pdfUrl', 'segments', 'fileNames'].filter(key => saved[key] !== undefined).map(key => [key, saved[key]]));
    await update(ref(dbs[1], path), { sheet, position: { ...pos, sourceId: sheet.id, sequence: nextSequence++ } });
    assert.equal((await get(ref(dbs[0], `${path}/sheet`))).val().id, sheet.id);
    await denied(() => set(ref(dbs[0], `${path}/position`), { ...pos, sequence: nextSequence }));
  }
  await update(ref(dbs[1], path), { sheet: null, position: { ...pos, page: 8, sequence: nextSequence++ } });
  assert.equal((await get(ref(dbs[0], `${path}/position`))).val().page, 8);
  await update(ref(dbs[1], path), { [`controllers/${id}`]: null, [`controlRequests/${id}`]: null });
  await denied(() => set(ref(dbs[1], `${path}/position`), { ...pos, sequence: nextSequence }));
  await update(ref(dbs[3], path), { [`controllers/${id}`]: true, [`controlRequests/${id}`]: null });
  await signOut(auths[3]);
  await set(ref(dbs[1], `${path}/position`), { ...pos, sequence: nextSequence });
  await denied(() => set(ref(dbs[1], `${path}/position`), { ...pos, sequence: nextSequence }));
  assert.equal(getAuth(apps[1]).currentUser.uid, id, 'Settings authorization never replaces the musician identity.');
  console.log('PASS: actual Firebase request/approval/password grants, concurrent sequences, source reset, revocation and restricted Settings/owner permissions.');
} finally {
  try { await loginAdmin(); for (const code of codes) await remove(ref(dbs[3], `rooms/${code}`)); }
  finally { clearTimeout(deadline); dbs.forEach(goOffline); await Promise.all(apps.map(deleteApp)); }
}
process.exit(0);
