// Disposable local uploads/rooms only; restore the global default in finally.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
const base = process.env.MUSIC_ROOM_TEST_URL || 'http://localhost:5173';
const password = loadEnv('development', process.cwd(), '').MUSIC_ADMIN_PASSWORD;
const descriptor = await (await fetch(`${base}/api/songbook`)).json();
const originalDefault = (await (await fetch(`${base}/api/default-file`)).json()).id;
const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0], rooms = [], ids = [];
const admin = (path, method = 'GET', data) => fetch(`${base}/api/admin/${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
const catalog = async () => (await fetch(`${base}/api/songs`)).json();
const master = (room, path, data) => fetch(`${base}/api/local-rooms/${room.code}/${path}`, { method: path === 'sheet' ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${room.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
async function create() {
  const response = await fetch(`${base}/api/local-rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...descriptor, masterId: 'room-file-test' }) });
  assert.equal(response.status, 201); const room = await response.json(); rooms.push(room); return room;
}
async function upload(room, title) {
  const response = await fetch(`${base}/api/local-rooms/${room.code}/images`, { method: 'POST', headers: { Authorization: `Bearer ${room.token}`, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 217]) });
  assert.equal(response.status, 201); const { url } = await response.json();
  const file = { id: randomBytes(16).toString('hex'), title, segments: [{ url, width: 480, height: 800 }] };
  ids.push(file.id); assert.equal((await master(room, 'songs', file)).status, 201); return file;
}
try {
  const first = await create(), kept = await upload(first, 'Retention check kept');
  assert.equal((await admin(`rooms/${first.code}`, 'DELETE', { deleteFiles: false })).status, 200);
  assert.ok((await catalog()).some(file => file.id === kept.id));
  assert.equal((await fetch(`${base}${kept.segments[0].url}`)).status, 200);
  const origin = await create(), retainedDefault = await upload(origin, 'Retention check default'), deleted = await upload(origin, 'Retention check deleted');
  assert.equal((await admin('default-file', 'PUT', { id: retainedDefault.id })).status, 200);
  const consumer = await create();
  assert.equal((await master(consumer, 'sheet', { sheet: kept })).status, 200, 'Future rooms can select kept uploads.');
  assert.equal((await master(consumer, 'sheet', { sheet: deleted })).status, 200);
  assert.equal((await fetch(`${base}/api/admin/rooms/${origin.code}`, { method: 'DELETE', body: JSON.stringify({ deleteFiles: true }) })).status, 401);
  assert.equal((await admin(`rooms/${origin.code}`, 'DELETE', { deleteFiles: 'yes' })).status, 400);
  assert.equal((await admin(`rooms/${origin.code}`, 'DELETE', { deleteFiles: true })).status, 200);
  const remaining = await catalog();
  assert.ok(remaining.some(file => file.id === retainedDefault.id)); assert.ok(remaining.some(file => file.id === kept.id)); assert.ok(!remaining.some(file => file.id === deleted.id));
  assert.equal((await fetch(`${base}${deleted.segments[0].url}`)).status, 200, 'Another active room retains deleted bytes.');
  assert.equal((await master(consumer, 'sheet', { sheet: deleted })).status, 400);
  assert.equal((await master(consumer, 'sheet', { sheet: kept })).status, 200); await admin('songs');
  assert.equal((await fetch(`${base}${deleted.segments[0].url}`)).status, 404);
  const all = await create(), allFile = await upload(all, 'Retention check all');
  // Delete only this test's remaining rooms, exercising the same per-room policy.
  for (const room of [consumer, all]) assert.equal((await admin(`rooms/${room.code}`, 'DELETE', { deleteFiles: true })).status, 200);
  assert.ok(!(await catalog()).some(file => file.id === allFile.id));
  console.log('PASS: keep uploads for future rooms, room-origin deletion, protected default, unrelated retained files, active-room deferred cleanup, denied unauthenticated deletion and invalid policy.');
} finally {
  assert.equal((await admin('default-file', 'PUT', { id: originalDefault })).status, 200);
  for (const room of rooms) await admin(`rooms/${room.code}`, 'DELETE');
  for (const id of ids) await admin(`songs/${id}`, 'DELETE');
  await admin('songs'); await admin('logout', 'POST');
}
