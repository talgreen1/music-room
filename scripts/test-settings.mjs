import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.MUSIC_ROOM_TEST_URL || 'http://localhost:5173';
const env = await readFile('.env.local', 'utf8');
const password = process.env.MUSIC_ADMIN_PASSWORD || /^MUSIC_ADMIN_PASSWORD=(.+)$/m.exec(env)?.[1].trim();
assert.ok(password, 'Set MUSIC_ADMIN_PASSWORD before testing Settings.');
const original = await (await fetch(`${base}/api/songbook`)).json();
const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const request = (path, method = 'GET', body, headers = {}) => fetch(`${base}${path}`, { method, headers: { Cookie: cookie, ...headers }, body });
const codes = [];
async function room(masterId = 'settings-test') {
  const response = await fetch(`${base}/api/local-rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId, ...original }) });
  assert.equal(response.status, 201); const value = await response.json(); codes.push(value.code); return value;
}
try {
  assert.equal((await fetch(`${base}/api/admin/rooms`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/upload`, { method: 'POST', body: '%PDF-1.7' })).status, 401);
  // Settings imports must not disturb rooms already in progress.
  const old = await room(), songRoom = await room('another-master');
  const activeBeforeImport = await Promise.all([old, songRoom].map(async created => (await (await fetch(`${base}/api/local-rooms/${created.code}`)).json()).room));
  const roomsBeforeImport = Object.keys(await (await request('/api/admin/rooms')).json()).sort();
  assert.equal((await fetch(`${base}/api/admin/images`, { method: 'POST', body: new Uint8Array([255, 216, 255, 217]) })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await request('/api/admin/images', 'POST', 'invalid image')).status, 400);
  const settingsImage = await request('/api/admin/images', 'POST', new Uint8Array([255, 216, 255, 217]), { 'Content-Type': 'image/jpeg' });
  assert.equal(settingsImage.status, 201); const settingsImageUrl = (await settingsImage.json()).url;
  const settingsSongId = (await import('node:crypto')).randomBytes(16).toString('hex');
  const settingsSong = { id: settingsSongId, title: 'Settings-imported song', segments: [{ url: settingsImageUrl, width: 480, height: 800 }] };
  assert.equal((await request('/api/admin/songs', 'POST', JSON.stringify(settingsSong), { 'Content-Type': 'application/json' })).status, 201);
  assert.equal((await request('/api/admin/songs', 'POST', JSON.stringify(settingsSong), { 'Content-Type': 'application/json' })).status, 400);
  const savedBySettings = (await (await fetch(`${base}/api/songs`)).json()).find(song => song.id === settingsSongId);
  assert.equal(savedBySettings.ownerId, 'settings-admin'); assert.equal(savedBySettings.roomCode, undefined);
  assert.deepEqual(Object.keys(await (await request('/api/admin/rooms')).json()).sort(), roomsBeforeImport);
  assert.deepEqual(await Promise.all([old, songRoom].map(async created => (await (await fetch(`${base}/api/local-rooms/${created.code}`)).json()).room)), activeBeforeImport);
  for (const created of [old, songRoom]) {
    const openSettingsSong = await fetch(`${base}/api/local-rooms/${created.code}/sheet`, { method: 'PUT', headers: { Authorization: `Bearer ${created.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: settingsSong }) });
    assert.equal(openSettingsSong.status, 200);
    assert.equal((await (await fetch(`${base}/api/local-rooms/${created.code}`)).json()).room.sheet.id, settingsSongId);
    assert.equal((await fetch(`${base}/api/local-rooms/${created.code}/sheet`, { method: 'PUT', headers: { Authorization: `Bearer ${created.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: null }) })).status, 200);
  }
  assert.equal((await request(`/api/admin/songs/${settingsSongId}`, 'DELETE')).status, 200);
  assert.equal((await fetch(`${base}${settingsImageUrl}`)).status, 404);

  const masterRequest = (created, route, method, data) => fetch(`${base}/api/local-rooms/${created.code}/${route}`, { method, headers: { Authorization: `Bearer ${created.token}`, 'Content-Type': route === 'images' ? 'image/jpeg' : 'application/json' }, body: route === 'images' ? data : JSON.stringify(data) });
  const jpeg = new Uint8Array([255, 216, 255, 217]);
  const image = await masterRequest(old, 'images', 'POST', jpeg); assert.equal(image.status, 201); const imageUrl = (await image.json()).url;
  const songId = (await import('node:crypto')).randomBytes(16).toString('hex');
  const sheet = { id: songId, title: 'Saved integration song', segments: [{ url: imageUrl, width: 480, height: 800 }] };
  assert.equal((await masterRequest(old, 'songs', 'POST', sheet)).status, 201);
  assert.equal((await masterRequest(old, 'songs', 'POST', sheet)).status, 400);
  for (const created of [old, songRoom]) assert.equal((await masterRequest(created, 'sheet', 'PUT', { sheet })).status, 200);
  assert.equal((await (await fetch(`${base}/api/local-rooms/${songRoom.code}`)).json()).room.sheet.title, sheet.title);
  assert.ok((await (await request('/api/admin/songs')).json()).some(song => song.id === songId));
  assert.equal((await fetch(`${base}/api/admin/songs/${songId}`, { method: 'DELETE' })).status, 401);
  assert.equal((await request(`/api/admin/songs/${songId}`, 'DELETE')).status, 200);
  assert.ok(!(await (await fetch(`${base}/api/songs`)).json()).some(song => song.id === songId));
  assert.equal((await masterRequest(songRoom, 'sheet', 'PUT', { sheet })).status, 400);
  assert.equal((await fetch(`${base}${imageUrl}`)).status, 200); // Active copies survive deletion.
  assert.equal((await masterRequest(old, 'sheet', 'PUT', { sheet: null })).status, 200);
  assert.equal((await request(`/api/admin/rooms/${songRoom.code}`, 'DELETE')).status, 200);
  assert.equal((await fetch(`${base}${imageUrl}`)).status, 404); // Last reference released; tiles cleaned up.

  assert.equal((await request('/api/admin/upload', 'POST', '<html>not a pdf</html>')).status, 400);
  const pdf = await readFile('public/songbooks/songbook-2026-10.pdf');
  const upload = await request('/api/admin/upload', 'POST', pdf, { 'Content-Type': 'application/pdf' });
  assert.equal(upload.status, 201); const { pdfUrl } = await upload.json();
  const downloaded = await fetch(`${base}${pdfUrl}`);
  assert.equal(downloaded.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
  const replacement = { ...original, pdfUrl, pdfVersion: 'settings-upload-test' };
  assert.equal((await request('/api/admin/songbook', 'PUT', JSON.stringify(replacement), { 'Content-Type': 'application/json' })).status, 200);
  const next = await room(); assert.equal(next.room.pdfUrl, pdfUrl);
  assert.equal((await (await fetch(`${base}/api/local-rooms/${old.code}`)).json()).room.pdfUrl, original.pdfUrl);
  const list = await (await request('/api/admin/rooms')).json();
  assert.equal(list[next.code].pdfUrl, pdfUrl); assert.ok(!JSON.stringify(list).includes(next.token));
  assert.equal((await fetch(`${base}/api/admin/rooms/${next.code}`, { method: 'DELETE' })).status, 401);
  assert.equal((await request(`/api/admin/rooms/${next.code}`, 'DELETE')).status, 200);
  assert.equal((await fetch(`${base}/api/local-rooms/${next.code}`)).status, 404);
  console.log('Settings integration passed: authorization, validated upload, exact PDF download, new-room default, existing-room pinning, room listing, room-free Settings imports, saved-song reuse, protected deletion, active-copy retention, tile cleanup and targeted deletion.');
} finally {
  assert.equal((await request('/api/admin/songbook', 'PUT', JSON.stringify(original), { 'Content-Type': 'application/json' })).status, 200);
  for (const code of codes) await request(`/api/admin/rooms/${code}`, 'DELETE');
  await request('/api/admin/logout', 'POST');
  assert.equal((await request('/api/admin/rooms')).status, 401);
}
