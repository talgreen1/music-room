// Local integration: restores the default and removes only this run's records/rooms.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadEnv } from 'vite';

const base = process.env.MUSIC_ROOM_TEST_URL || 'http://localhost:5173';
const password = process.env.MUSIC_ADMIN_PASSWORD || loadEnv('development', process.cwd(), '').MUSIC_ADMIN_PASSWORD;
assert.ok(password, 'Configure the local Settings password.');
const original = await (await fetch(`${base}/api/songbook`)).json();
const originalDefault = (await (await fetch(`${base}/api/default-file`)).json()).id;
const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const records = [], codes = [];
const admin = (path, method = 'GET', body, type = 'application/json') => fetch(`${base}/api/admin/${path}`, { method, headers: { Cookie: cookie, 'Content-Type': type }, body });
const setDefault = id => admin('default-file', 'PUT', JSON.stringify({ id }));
async function create() {
  const response = await fetch(`${base}/api/local-rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId: 'file-library-test', ...original }) });
  assert.equal(response.status, 201); const value = await response.json(); codes.push(value.code); return value;
}
const master = (room, route, method, body, type = 'application/json') => fetch(`${base}/api/local-rooms/${room.code}${route ? `/${route}` : ''}`, { method, headers: { Authorization: `Bearer ${room.token}`, 'Content-Type': type }, body });
const readRoom = async room => (await (await fetch(`${base}/api/local-rooms/${room.code}`)).json()).room;
try {
  const room = await create(), before = await readRoom(room);
  assert.equal((await fetch(`${base}/api/admin/default-file`, { method: 'PUT', body: JSON.stringify({ id: 'pdf' }) })).status, 401);
  assert.equal((await fetch(`${base}/api/local-rooms/${room.code}/pdfs`, { method: 'POST', body: '%PDF-1.4' })).status, 403);
  assert.equal((await master(room, 'pdfs', 'POST', 'invalid')).status, 400);
  const bytes = await readFile('public/songbooks/songbook-2026-10.pdf');
  const pdfs = [];
  for (const isAdmin of [false, true]) {
    const upload = isAdmin ? await admin('upload', 'POST', bytes, 'application/pdf') : await master(room, 'pdfs', 'POST', bytes, 'application/pdf');
    assert.equal(upload.status, 201); const { pdfUrl } = await upload.json();
    assert.deepEqual(Buffer.from(await (await fetch(`${base}${pdfUrl}`)).arrayBuffer()), bytes);
    const file = { id: randomBytes(16).toString('hex'), title: `${isAdmin ? 'Settings' : 'Master'} PDF test`, pdfUrl };
    records.push(file.id); pdfs.push(file);
    const saved = isAdmin ? await admin('songs', 'POST', JSON.stringify(file)) : await master(room, 'songs', 'POST', JSON.stringify(file));
    assert.equal(saved.status, 201);
  }
  assert.deepEqual(await readRoom(room), before, 'Saving a file leaves active rooms unchanged.');
  const catalog = await (await fetch(`${base}/api/songs`)).json();
  for (const pdf of pdfs) assert.ok(catalog.some(file => file.id === pdf.id && file.pdfUrl === pdf.pdfUrl));
  assert.equal((await setDefault(pdfs[0].id)).status, 200);
  const next = await create();
  assert.equal(next.room.sheet.id, pdfs[0].id); assert.equal(next.room.position.sourceId, pdfs[0].id);
  assert.deepEqual(await readRoom(room), before, 'Changing the default leaves active rooms unchanged.');
  assert.equal((await admin(`songs/${pdfs[0].id}`, 'DELETE')).status, 400, 'Current default cannot be deleted.');
  assert.equal((await setDefault('f'.repeat(32))).status, 400);
  assert.equal((await master(room, 'sheet', 'PUT', JSON.stringify({ sheet: pdfs[1] }))).status, 200);
  assert.equal((await master(room, '', 'PATCH', JSON.stringify({ page: 37, offset: .6, horizontal: .7, zoom: 2, sourceId: pdfs[1].id }))).status, 200);
  assert.equal((await master(room, '', 'PATCH', JSON.stringify({ page: 1, offset: 0, zoom: 1, sourceId: pdfs[0].id }))).status, 400);
  assert.equal((await readRoom(room)).position.page, 37);
  assert.equal((await fetch(`${base}/api/admin/songs/${pdfs[1].id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${room.token}` } })).status, 401);
  assert.equal((await admin(`songs/${pdfs[1].id}`, 'DELETE')).status, 200);
  assert.equal((await fetch(`${base}${pdfs[1].pdfUrl}`)).status, 200, 'Active PDF copy remains downloadable.');
  assert.equal((await master(next, 'sheet', 'PUT', JSON.stringify({ sheet: pdfs[1] }))).status, 400);
  assert.equal((await master(room, 'sheet', 'PUT', JSON.stringify({ sheet: null }))).status, 200);
  await admin('songs');
  assert.equal((await fetch(`${base}${pdfs[1].pdfUrl}`)).status, 404);
  const image = await admin('images', 'POST', new Uint8Array([255, 216, 255, 217]), 'image/jpeg');
  assert.equal(image.status, 201); const { url } = await image.json();
  const sheet = { id: randomBytes(16).toString('hex'), title: 'Image default test', segments: [{ url, width: 480, height: 800 }] };
  records.push(sheet.id);
  assert.equal((await admin('songs', 'POST', JSON.stringify(sheet))).status, 201);
  assert.equal((await setDefault(sheet.id)).status, 200);
  const imageRoom = await create(); assert.equal(imageRoom.room.sheet.id, sheet.id); assert.equal(imageRoom.room.position.sourceId, sheet.id);
  assert.equal((await admin(`songs/${sheet.id}`, 'DELETE')).status, 400);
  console.log('PASS: Master and Settings PDF uploads, exact downloads, shared library, PDF/image defaults, unchanged active rooms, denied follower uploads/default/deletion, protected current default, synchronized source positions, stale-source rejection and deferred PDF cleanup.');
} finally {
  assert.equal((await setDefault(originalDefault)).status, 200);
  for (const code of codes) await admin(`rooms/${code}`, 'DELETE');
  for (const id of records) await admin(`songs/${id}`, 'DELETE');
  await admin('songs'); await admin('logout', 'POST');
}
