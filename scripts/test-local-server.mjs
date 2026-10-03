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
const reconnectController = new AbortController();
const reconnected = await fetch(`${roomUrl}/events`, { signal: reconnectController.signal });
const reconnectReader = reconnected.body.getReader();
const reconnectChunk = await reconnectReader.read();
assert.match(decoder.decode(reconnectChunk.value), /"page":37/);
const snapshot = await (await fetch(roomUrl)).json();
assert.equal(snapshot.room.position.horizontal, .7); assert.equal(snapshot.room.position.zoom, 3);
reconnectController.abort(); await reconnectReader.cancel().catch(() => {});
console.log('Local server integration passed: independent join, private Master token, denied follower write, live position stream, reconnect snapshot.');
