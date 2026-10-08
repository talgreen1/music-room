// Disposable real-cloud checks. Removes only this run's rooms, songs and tiles.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
import { createCanvas } from '@napi-rs/canvas';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getDatabase, ref, get, set, update, remove, runTransaction, onValue, serverTimestamp, goOffline, goOnline } from 'firebase/database';
import { settingsCredential } from '../src/settings-password.mjs';

const env = { ...loadEnv('deployment', process.cwd(), ''), ...process.env };
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, databaseURL: env.VITE_FIREBASE_DATABASE_URL, projectId: env.VITE_FIREBASE_PROJECT_ID };
assert.ok(Object.values(config).every(Boolean) && env.MUSIC_ADMIN_PASSWORD && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Configure cloud Settings and Storage first.');
const apps = ['master', 'follower', 'admin'].map(name => initializeApp(config, `sheet-test-${name}-${Date.now()}`));
const auths = apps.map(app => getAuth(app)), dbs = apps.map(app => getDatabase(app));
const ids = Array.from({ length: 3 }, () => randomBytes(16).toString('hex'));
const codes = [], paths = [];
const deadline = setTimeout(() => { console.error('Cloud sheet test timed out.'); process.exit(1); }, 90000);
let admin, master, follower, failed = false;
const storage = async (user, path, method, body, contentType = 'image/jpeg') => fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/${path}`, { method, headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': contentType, 'x-upsert': 'false' }, body });
const download = path => fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/room-sheets/${path}`);
const denied = async (label, operation) => assert.rejects(operation, error => /permission.denied/i.test(String(error)), label);
try {
  await Promise.all(auths.map(auth => setPersistence(auth, inMemoryPersistence)));
  [master, follower, admin] = await Promise.all([
    signInAnonymously(auths[0]).then(result => result.user),
    signInAnonymously(auths[1]).then(result => result.user),
    signInWithEmailAndPassword(auths[2], env.VITE_ADMIN_EMAIL || 'settings@music-room.app', settingsCredential(env.MUSIC_ADMIN_PASSWORD)).then(result => result.user)
  ]);
  await get(ref(dbs[2], 'rooms'));
  const descriptor = (await get(ref(dbs[2], 'songbook'))).val() || { pdfUrl: '/songbooks/songbook-2026-10.pdf', pdfVersion: '2026-10', pdfTitle: 'Cloud test PDF' };
  const offset = await new Promise((resolve, reject) => onValue(ref(dbs[0], '.info/serverTimeOffset'), snapshot => resolve(snapshot.val() || 0), reject, { onlyOnce: true }));
  const now = Date.now() + offset;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const result = await runTransaction(ref(dbs[0], `rooms/${code}`), value => value === null ? { ...descriptor, masterId: master.uid, createdAt: now, expiresAt: now + 86400000, position: { page: 1, offset: 0, zoom: 1, sequence: 0, updatedAt: now } } : undefined, { applyLocally: false });
    if (result.committed) { codes.push(code); break; }
  }
  assert.equal(codes.length, 1); const roomPath = `rooms/${codes[0]}`;
  const canvas = createCanvas(480, 800), context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 480, 800); context.fillStyle = '#15365b'; context.font = '28px sans-serif'; context.fillText('Cloud song check', 30, 60); context.fillText('C  Am  F  G', 30, 120);
  const jpeg = canvas.toBuffer('image/jpeg');
  const songs = [];
  ids.push(randomBytes(16).toString('hex'));
  for (const [index, user] of [master, admin, follower].entries()) {
    const path = `${user.uid}/${ids[index]}/0.jpg`; paths.push(path);
    const uploaded = await storage(user, `room-sheets/${path}`, 'POST', jpeg);
    assert.ok(uploaded.ok, `Screenshot upload failed (${uploaded.status}): ${await uploaded.text()}`);
    assert.deepEqual(Buffer.from(await (await download(path)).arrayBuffer()), jpeg);
    const overwritten = await storage(user, `room-sheets/${path}`, 'POST', jpeg); assert.ok(!overwritten.ok, 'Images are immutable.'); await overwritten.arrayBuffer();
    const sheet = { id: ids[index], title: `${['Master', 'Settings', 'Follower'][index]} cloud check`, segments: [{ url: `${env.VITE_SUPABASE_URL}/storage/v1/object/public/room-sheets/${path}`, width: 480, height: 800 }] };
    const record = { ...sheet, ownerId: user.uid, createdAt: serverTimestamp(), ...(index === 1 ? {} : { roomCode: codes[0] }) };
    await set(ref(dbs[[0, 2, 1][index]], `songs/${sheet.id}`), record); songs.push(sheet);
  }
  const unauthorizedPath = `room-sheets/${paths[0]}`;
  const crossOwner = await storage(follower, unauthorizedPath.replace('/0.jpg', '/1.jpg'), 'POST', jpeg); assert.ok(!crossOwner.ok, 'Cannot write into another uploader namespace.'); await crossOwner.arrayBuffer();
  const testRecord = (user, extra = {}) => {
    const id = randomBytes(16).toString('hex'); ids.push(id);
    return { id, title: 'Denied test record', ownerId: user.uid, createdAt: serverTimestamp(), segments: [{ width: 480, height: 800, url: `${env.VITE_SUPABASE_URL}/storage/v1/object/public/room-sheets/${user.uid}/${id}/0.jpg` }], ...extra };
  };
  const roomless = testRecord(follower), foreignRoom = testRecord(follower, { roomCode: codes[0], ownerId: master.uid });
  await denied('Follower room-less catalog creation', () => set(ref(dbs[1], `songs/${roomless.id}`), roomless));
  await denied('Follower cannot forge another uploader', () => set(ref(dbs[1], `songs/${foreignRoom.id}`), foreignRoom));
  await denied('Musician song deletion', () => remove(ref(dbs[0], `songs/${songs[0].id}`)));
  const position = (sourceId, sequence) => ({ page: 1, offset: .3, horizontal: .7, zoom: 2, sourceId, sequence, updatedAt: serverTimestamp() });
  await update(ref(dbs[0], roomPath), { sheet: songs[2], position: position(songs[2].id, 1) });
  assert.equal((await get(ref(dbs[1], roomPath))).val().sheet.id, songs[2].id);
  await denied('Follower cannot overwrite its own catalog entry', () => update(ref(dbs[1], `songs/${songs[2].id}`), { title: 'Overwrite' }));
  await denied('Follower source change', () => update(ref(dbs[1], roomPath), { sheet: songs[1], position: position(songs[1].id, 2) }));
  await update(ref(dbs[0], roomPath), { sheet: songs[1], position: position(songs[1].id, 2) });
  const joined = (await get(ref(dbs[1], roomPath))).val(); assert.equal(joined.sheet.title, songs[1].title); assert.equal(joined.position.zoom, 2); assert.equal(joined.position.horizontal, .7);
  await denied('Old PDF position cannot move a sheet', () => set(ref(dbs[0], `${roomPath}/position`), position('pdf', 2)));
  goOffline(dbs[1]);
  await set(ref(dbs[0], `${roomPath}/position`), position(songs[1].id, 3));
  goOnline(dbs[1]);
  const resumed = await new Promise((resolve, reject) => {
    const stop = onValue(ref(dbs[1], roomPath), snapshot => {
      if (snapshot.val()?.position.sequence === 3) { stop(); resolve(snapshot.val()); }
    }, reject);
  });
  assert.equal(resumed.sheet.id, songs[1].id); assert.equal(resumed.position.horizontal, .7);
  const wrongIndex = testRecord(master, { roomCode: codes[0] });
  wrongIndex.segments = { 0: wrongIndex.segments[0], 40: wrongIndex.segments[0] };
  await denied('Bounded tile indices', () => set(ref(dbs[0], `songs/${wrongIndex.id}`), wrongIndex));
  await update(ref(dbs[2], `songs/${songs[1].id}`), { deletedAt: serverTimestamp() });
  await denied('Deleted song cannot be selected again', () => update(ref(dbs[0], roomPath), { sheet: songs[1], position: position(songs[1].id, 4) }));
  await set(ref(dbs[0], `${roomPath}/position`), position(songs[1].id, 4)); // Active copy still follows.
  assert.equal((await download(paths[1])).status, 200);
  const memberDelete = await storage(follower, 'room-sheets', 'DELETE', JSON.stringify({ prefixes: [paths[1]] }), 'application/json'); await memberDelete.arrayBuffer();
  assert.deepEqual(Buffer.from(await (await download(paths[1])).arrayBuffer()), jpeg, 'Only Settings may clean up images.');
  await update(ref(dbs[0], roomPath), { sheet: null, position: position('pdf', 5) });
  assert.equal((await get(ref(dbs[1], roomPath))).val().sheet, undefined);
  console.log('PASS: Master/Follower and room-free Settings uploads, exact image download, Master selection of Follower images, denied overwrite/foreign uploads/Follower privileged writes, bounded tiles, stale-source rejection, reconnect, tombstoning, active-copy updates and PDF return.');
} catch (error) { failed = true; console.error(error); }
finally {
  clearTimeout(deadline);
  if (admin) {
    for (const code of codes) await remove(ref(dbs[2], `rooms/${code}`)).catch(error => { failed = true; console.error('Test room cleanup failed:', error.message); });
    if (paths.length) {
      try {
        const response = await storage(admin, 'room-sheets', 'DELETE', JSON.stringify({ prefixes: paths }), 'application/json');
        assert.ok(response.ok, `Test tile cleanup failed: ${response.status}`);
        const deleted = await response.json();
        assert.ok(Array.isArray(deleted));
        assert.equal(deleted.length, paths.length, 'Administrator removed each test tile.');
      } catch (error) { failed = true; console.error('Test tile cleanup failed:', error.message); }
    }
    for (const id of ids) await remove(ref(dbs[2], `songs/${id}`)).catch(error => { failed = true; console.error('Test song cleanup failed:', error.message); });
    if (!failed) console.log('PASS: administrator cleanup removed all disposable rooms, catalog records and uploaded tiles.');
  }
  dbs.forEach(db => goOffline(db)); await Promise.all(apps.map(app => deleteApp(app)));
}
process.exit(failed ? 1 : 0);
