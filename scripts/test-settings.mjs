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
async function room() {
  const response = await fetch(`${base}/api/local-rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId: 'settings-test', ...original }) });
  assert.equal(response.status, 201); const value = await response.json(); codes.push(value.code); return value;
}
try {
  assert.equal((await fetch(`${base}/api/admin/rooms`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/upload`, { method: 'POST', body: '%PDF-1.7' })).status, 401);
  const old = await room();
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
  console.log('Settings integration passed: authorization, validated upload, exact PDF download, new-room default, existing-room pinning, room listing and targeted deletion.');
} finally {
  assert.equal((await request('/api/admin/songbook', 'PUT', JSON.stringify(original), { 'Content-Type': 'application/json' })).status, 200);
  for (const code of codes) await request(`/api/admin/rooms/${code}`, 'DELETE');
  await request('/api/admin/logout', 'POST');
  assert.equal((await request('/api/admin/rooms')).status, 401);
}
