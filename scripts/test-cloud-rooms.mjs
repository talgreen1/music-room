// Uses two anonymous identities; leaves one 24-hour test room, like a normal session.
// Run: node --use-system-ca scripts/test-cloud-rooms.mjs
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { getDatabase, ref, get, set, runTransaction, onValue, serverTimestamp, goOffline } from 'firebase/database';

const env = { ...loadEnv('deployment', process.cwd(), 'VITE_'), ...process.env };
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID
};
assert(Object.values(config).every(Boolean), 'Set .env.deployment.local first');
assert.notEqual(env.VITE_USE_FIREBASE_EMULATORS, 'true');
const apps = ['master', 'follower'].map(name => initializeApp(config, `test-${name}-${Date.now()}`));
const deadline = setTimeout(() => { console.error('Cloud room test timed out'); process.exit(1); }, 45000);
let stop = () => {};
try {
  const users = await Promise.all(apps.map(async app => {
    const auth = getAuth(app);
    await setPersistence(auth, inMemoryPersistence);
    return (await signInAnonymously(auth)).user;
  }));
  assert.notEqual(users[0].uid, users[1].uid);
  const [master, follower] = apps.map(app => getDatabase(app));
  const offset = await new Promise((resolve, reject) => {
    onValue(ref(master, '.info/serverTimeOffset'), snapshot => resolve(snapshot.val() || 0), reject, { onlyOnce: true });
  });
  const now = Date.now() + offset;
  const room = {
    masterId: users[0].uid, createdAt: now, expiresAt: now + 86400000,
    pdfUrl: '/songbooks/songbook-2026-10.pdf', pdfVersion: '2026-10', pdfTitle: 'Cloud verification',
    position: { page: 1, offset: 0, zoom: 1, sequence: 0, updatedAt: now }
  };
  let code;
  for (let attempt = 0; attempt < 10; attempt++) {
    code = String(100000 + Math.floor(Math.random() * 900000));
    const result = await runTransaction(ref(master, `rooms/${code}`), value => value === null ? room : undefined, { applyLocally: false });
    if (result.committed) break;
    code = undefined;
  }
  assert(code, 'Could not reserve a test room');
  const path = `rooms/${code}`;
  assert.equal((await get(ref(follower, path))).val().masterId, users[0].uid);
  const collision = await runTransaction(ref(follower, path), value => value === null ? { ...room, masterId: users[1].uid } : undefined, { applyLocally: false });
  assert.equal(collision.committed, false);
  const denied = async (label, write) => {
    await assert.rejects(write, error => /permission.denied/i.test(String(error)), label);
  };
  const position = { page: 37, offset: 0.62, zoom: 3, horizontal: 0.7, sequence: 1, updatedAt: serverTimestamp() };
  await denied('Follower position writes', () => set(ref(follower, `${path}/position`), position));
  await denied('Follower ownership changes', () => set(ref(follower, `${path}/masterId`), users[1].uid));
  await denied('Follower deletion', () => set(ref(follower, path), null));
  await denied('Room enumeration', () => get(ref(follower, 'rooms')));
  await denied('Root reads', () => get(ref(follower)));
  await denied('Master PDF changes', () => set(ref(master, `${path}/pdfUrl`), '/other.pdf'));
  await denied('Invalid ranges', () => set(ref(master, `${path}/position`), { ...position, offset: 2 }));
  await denied('Invalid horizontal pan', () => set(ref(master, `${path}/position`), { ...position, horizontal: 2 }));
  await denied('Invalid zoom', () => set(ref(master, `${path}/position`), { ...position, zoom: 4.1 }));
  await denied('Extra fields', () => set(ref(master, `${path}/position`), { ...position, surprise: true }));
  await denied('Invalid timestamps', () => set(ref(master, `${path}/position`), { ...position, updatedAt: 0 }));
  const received = new Promise((resolve, reject) => {
    stop = onValue(ref(follower, `${path}/position`), snapshot => {
      if (snapshot.val()?.sequence === 1) resolve(snapshot.val());
    }, reject);
  });
  await set(ref(master, `${path}/position`), position);
  const latest = await received;
  assert.equal(latest.page, 37);
  assert.equal(latest.offset, 0.62);
  assert.equal(latest.horizontal, 0.7);
  assert.equal(latest.zoom, 3);
  assert.equal((await get(ref(follower, `${path}/position`))).val().sequence, 1);
  await denied('Stale sequences', () => set(ref(master, `${path}/position`), position));
  console.log(`PASS: distinct anonymous identities, atomic creation/collision, follower reads, live updates, late snapshot, ownership and schema restrictions. Test room: ${code}`);
} finally {
  stop();
  clearTimeout(deadline);
  apps.forEach(app => goOffline(getDatabase(app)));
  await Promise.all(apps.map(deleteApp));
}
// Firebase SDK retry timers can otherwise keep a successful Node smoke test alive.
process.exit(0);
