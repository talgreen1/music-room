import assert from 'node:assert/strict';

const base = process.env.MUSIC_ROOM_TEST_URL || 'http://localhost:5173';
const createdResponse = await fetch(`${base}/api/local-rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ masterId: 'integration-test', pdfUrl: '/songbooks/songbook-2026-10.pdf', pdfVersion: '2026-10', pdfTitle: 'Test songbook' })
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
const roomUrl = `${base}/api/local-rooms/${created.code}`;
// Independent client: no cookies, browser storage, or Master credentials.
const joined = await (await fetch(roomUrl)).json();
assert.equal(joined.room.masterId, 'integration-test');
assert.equal('token' in joined, false); assert.equal('token' in joined.room, false);
const denied = await fetch(roomUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 9, offset: 0, zoom: 1 }) });
assert.equal(denied.status, 403);
assert.equal((await (await fetch(roomUrl)).json()).room.position.page, 1);

const controller = new AbortController();
const stream = await fetch(`${roomUrl}/events`, { signal: controller.signal });
assert.equal(stream.status, 200);
const reader = stream.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
async function event() {
  const deadline = setTimeout(() => controller.abort(), 5000);
  try {
    while (!buffer.includes('\n\n')) { const chunk = await reader.read(); assert.equal(chunk.done, false); buffer += decoder.decode(chunk.value, { stream: true }); }
    const end = buffer.indexOf('\n\n'); const raw = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    return JSON.parse(raw.replace(/^data: /, ''));
  } finally { clearTimeout(deadline); }
}
assert.equal((await event()).room.position.page, 1);
const update = await fetch(roomUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${created.token}` }, body: JSON.stringify({ page: 37, offset: .62, zoom: 3, horizontal: .7 }) });
assert.equal(update.status, 200);
const received = await event(); assert.equal(received.room.position.page, 37); assert.equal(received.room.position.offset, .62); assert.equal(received.room.position.sequence, 1);
assert.equal(received.room.position.horizontal, .7); assert.equal(received.room.position.zoom, 3);
controller.abort(); await reader.cancel().catch(() => {});
const masterHeaders = { Authorization: `Bearer ${created.token}`, 'Content-Type': 'application/json' };
const imageUpload = await fetch(`${roomUrl}/images`, { method: 'POST', headers: { Authorization: masterHeaders.Authorization, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 217]) });
assert.equal(imageUpload.status, 201); const imageUrl = (await imageUpload.json()).url;
const songId = (await import('node:crypto')).randomBytes(16).toString('hex');
const sheet = { id: songId, title: 'Test screenshot sheet', fileNames: ['Original screenshot.jpg'], segments: [{ url: imageUrl, width: 960, height: 1200 }] };
assert.equal((await fetch(`${roomUrl}/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheet) })).status, 403);
assert.equal((await fetch(`${roomUrl}/songs`, { method: 'POST', headers: masterHeaders, body: JSON.stringify(sheet) })).status, 201);
assert.equal((await (await fetch(`${base}/api/songs`)).json()).find(song => song.id === songId).title, sheet.title);
assert.equal((await fetch(`${roomUrl}/sheet`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet }) })).status, 403);
assert.equal((await fetch(`${roomUrl}/images`, { method: 'POST', body: new Uint8Array([255, 216, 255, 217]) })).status, 403);
assert.equal((await fetch(`${roomUrl}/sheet`, { method: 'PUT', headers: masterHeaders, body: JSON.stringify({ sheet: false }) })).status, 400);
assert.equal((await fetch(`${roomUrl}/sheet`, { method: 'PUT', headers: masterHeaders, body: JSON.stringify({ sheet }) })).status, 200);
const sheetSnapshot = (await (await fetch(roomUrl)).json()).room;
assert.equal(sheetSnapshot.sheet.id, sheet.id); assert.equal(sheetSnapshot.position.sourceId, sheet.id);
assert.deepEqual(sheetSnapshot.sheet.fileNames, sheet.fileNames);
assert.equal((await fetch(roomUrl, { method: 'PATCH', headers: masterHeaders, body: JSON.stringify({ page: 1, offset: 0, zoom: 1, sourceId: 'pdf' }) })).status, 400);
assert.equal((await fetch(`${roomUrl}/sheet`, { method: 'PUT', headers: masterHeaders, body: JSON.stringify({ sheet: null, location: { page: 37, offset: .25 } }) })).status, 200);
const searchSnapshot = (await (await fetch(roomUrl)).json()).room;
assert.equal(searchSnapshot.position.sourceId, 'pdf'); assert.equal(searchSnapshot.position.page, 37); assert.equal(searchSnapshot.position.offset, .25);
assert.equal((await fetch(`${roomUrl}/sheet`, { method: 'PUT', headers: masterHeaders, body: JSON.stringify({ sheet, location: { page: 0, offset: 0 } }) })).status, 400);
assert.equal((await (await fetch(roomUrl)).json()).room.position.sourceId, 'pdf');
assert.equal((await fetch(`${roomUrl}/images`, { method: 'POST', headers: { Authorization: masterHeaders.Authorization }, body: 'not an image' })).status, 400);
assert.equal((await fetch(`${roomUrl}/sheet`, { method: 'PUT', headers: masterHeaders, body: JSON.stringify({ sheet: null }) })).status, 200);
assert.equal((await fetch(roomUrl, { method: 'PATCH', headers: masterHeaders, body: JSON.stringify({ page: 37, offset: .62, zoom: 3, horizontal: .7, sourceId: 'pdf' }) })).status, 200);
const reconnectController = new AbortController();
const reconnected = await fetch(`${roomUrl}/events`, { signal: reconnectController.signal });
const reconnectReader = reconnected.body.getReader();
const reconnectChunk = await reconnectReader.read();
assert.match(decoder.decode(reconnectChunk.value), /"page":37/);
const snapshot = await (await fetch(roomUrl)).json();
assert.equal(snapshot.room.position.horizontal, .7); assert.equal(snapshot.room.position.zoom, 3);
reconnectController.abort(); await reconnectReader.cancel().catch(() => {});
// Remove this test's durable song when local Settings is configured.
const { loadEnv } = await import('vite');
const adminPassword = process.env.MUSIC_ADMIN_PASSWORD || loadEnv('development', process.cwd(), '').MUSIC_ADMIN_PASSWORD;
if (adminPassword) {
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: adminPassword }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${base}/api/admin/songs/${songId}`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 200);
  await fetch(`${base}/api/admin/logout`, { method: 'POST', headers: { Cookie: cookie } });
}
console.log('Local server integration passed: independent join, private Master token, denied follower writes/uploads, sheet switching, invalid image rejection, stale-source rejection, live stream and reconnect snapshot.');
