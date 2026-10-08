// Local integration: deletes only this run's disposable files and rooms.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
const base = process.env.MUSIC_ROOM_TEST_URL || 'http://localhost:5173';
const password = process.env.MUSIC_ADMIN_PASSWORD || loadEnv('development', process.cwd(), '').MUSIC_ADMIN_PASSWORD;
assert.ok(password, 'Configure the local Settings password.');
const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const ids = [], rooms = [];
const admin = (path, method = 'GET', body) => fetch(`${base}/api/admin/${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body });
const request = (code, token, route, method, body, type = 'application/json') => fetch(`${base}/api/local-rooms/${code}${route ? `/${route}` : ''}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body });
const readRoom = async code => (await (await fetch(`${base}/api/local-rooms/${code}`)).json()).room;
const catalog = async () => (await (await fetch(`${base}/api/songs`)).json());
async function create() {
  const book = await (await fetch(`${base}/api/songbook`)).json();
  const result = await fetch(`${base}/api/local-rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...book, masterId: 'follower-upload-test' }) });
  assert.equal(result.status, 201); const room = await result.json(); rooms.push(room.code); return room;
}
try {
  const room = await create(), other = await create(), before = await readRoom(room.code);
  const join = await fetch(`${base}/api/local-rooms/${room.code}/members`, { method: 'POST' });
  assert.equal(join.status, 201); const member = await join.json();
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  assert.equal((await request(room.code, '', 'pdfs', 'POST', pdfBytes, 'application/pdf')).status, 403);
  assert.equal((await request(other.code, member.token, 'pdfs', 'POST', pdfBytes, 'application/pdf')).status, 403);
  const pdfUpload = await request(room.code, member.token, 'pdfs', 'POST', pdfBytes, 'application/pdf');
  assert.equal(pdfUpload.status, 201); const { pdfUrl } = await pdfUpload.json();
  assert.deepEqual(Buffer.from(await (await fetch(`${base}${pdfUrl}`)).arrayBuffer()), pdfBytes);
  const pdf = { id: randomBytes(16).toString('hex'), title: 'Follower PDF fixture', fileNames: ['follower.pdf'], pdfUrl };
  ids.push(pdf.id);
  const saved = await request(room.code, member.token, 'songs', 'POST', JSON.stringify(pdf));
  assert.equal(saved.status, 201); const record = await saved.json();
  assert.equal(record.roomCode, room.code); assert.notEqual(record.ownerId, room.room.masterId);
  const jpeg = new Uint8Array([255, 216, 255, 217]);
  const imageUpload = await request(room.code, member.token, 'images', 'POST', jpeg, 'image/jpeg');
  assert.equal(imageUpload.status, 201); const { url } = await imageUpload.json();
  const image = { id: randomBytes(16).toString('hex'), title: 'Follower image fixture', segments: [{ url, width: 480, height: 800 }] };
  ids.push(image.id);
  assert.equal((await request(room.code, member.token, 'songs', 'POST', JSON.stringify(image))).status, 201);
  assert.equal((await request(room.code, member.token, 'songs', 'POST', JSON.stringify(pdf))).status, 400, 'Existing entries cannot be overwritten.');
  for (const id of ids) assert.ok((await catalog()).some(file => file.id === id));
  assert.deepEqual(await readRoom(room.code), before, 'Follower uploads leave the shared source/position unchanged.');
  assert.equal((await request(room.code, member.token, 'sheet', 'PUT', JSON.stringify({ sheet: pdf }))).status, 403);
  assert.equal((await request(room.code, member.token, '', 'PATCH', JSON.stringify({ page: 2, offset: .5, zoom: 2 }))).status, 403);
  assert.equal((await fetch(`${base}/api/admin/default-file`, { method: 'PUT', headers: { Authorization: `Bearer ${member.token}` }, body: JSON.stringify({ id: pdf.id }) })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/songs/${pdf.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${member.token}` } })).status, 401);
  assert.equal((await request(room.code, room.token, 'sheet', 'PUT', JSON.stringify({ sheet: pdf }))).status, 200);
  assert.equal((await readRoom(room.code)).sheet.id, pdf.id);
  const listed = await (await admin('rooms')).json();
  assert.ok(JSON.stringify(listed).includes(room.code));
  await admin(`rooms/${room.code}`, 'DELETE');
  assert.equal((await request(room.code, member.token, 'images', 'POST', jpeg, 'image/jpeg')).status, 404);
  for (const id of ids) assert.ok((await catalog()).some(file => file.id === id), 'Uploads are retained for future rooms.');
  const doomed = await create();
  const doomedMember = await (await fetch(`${base}/api/local-rooms/${doomed.code}/members`, { method: 'POST' })).json();
  const doomedUpload = await (await request(doomed.code, doomedMember.token, 'images', 'POST', jpeg, 'image/jpeg')).json();
  const doomedFile = { ...image, id: randomBytes(16).toString('hex'), segments: [{ ...image.segments[0], url: doomedUpload.url }] }; ids.push(doomedFile.id);
  assert.equal((await request(doomed.code, doomedMember.token, 'songs', 'POST', JSON.stringify(doomedFile))).status, 201);
  assert.equal((await admin(`rooms/${doomed.code}`, 'DELETE', JSON.stringify({ deleteFiles: true }))).status, 200);
  assert.ok(!(await catalog()).some(file => file.id === doomedFile.id), 'Delete-room-files includes Follower contributions.');
  assert.equal((await fetch(`${base}${doomedUpload.url}`)).status, 404);
  console.log('PASS: Follower PDF/image uploads, shared catalog, Master selection, retained files, room-scoped sessions and privileged-operation denial.');
} finally {
  for (const code of rooms) await admin(`rooms/${code}`, 'DELETE');
  for (const id of ids) await admin(`songs/${id}`, 'DELETE');
  await admin('songs');
}
