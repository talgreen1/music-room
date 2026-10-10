import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = process.env.MUSIC_ROOM_TEST_URL;
const password = process.env.MUSIC_ADMIN_PASSWORD;
assert.ok(base && password, 'Run using the isolated integration runner.');
let cookie = '';
const call = (path, method = 'GET', body, token = '', admin = false) => fetch(`${base}${path}`, {
  method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(admin && cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const rooms = [];
const files = [];
const api = code => `/api/local-rooms/${code}`;
const position = { page: 3, offset: .4, zoom: 2, horizontal: .7, sourceId: 'pdf' };
const read = async code => (await (await call(api(code))).json()).room;
try {
  const book = await (await call('/api/songbook')).json();
  for (let n = 0; n < 2; n++) {
    const res = await call('/api/local-rooms', 'POST', { ...book, masterId: `shared-control-${n}` });
    assert.equal(res.status, 201); rooms.push(await res.json());
  }
  const [owner, other] = rooms;
  const member = await (await call(`${api(owner.code)}/members`, 'POST')).json();
  const control = (action, token = member.token, memberId = member.memberId) => call(`${api(owner.code)}/control`, 'POST', { action, memberId }, token);
  assert.equal((await control('request')).status, 200);
  assert.equal((await read(owner.code)).controlRequests[member.memberId], true);
  assert.equal((await call(api(owner.code), 'PATCH', position, member.token)).status, 403);
  assert.equal((await control('approve')).status, 403);
  assert.equal((await call(`${api(other.code)}/control`, 'POST', { action: 'request' }, member.token)).status, 403);
  assert.equal((await control('deny', owner.token)).status, 200);
  assert.equal((await read(owner.code)).controlRequests?.[member.memberId], undefined);
  assert.equal((await control('request')).status, 200);
  assert.equal((await control('approve', owner.token)).status, 200);
  assert.equal((await call(api(owner.code), 'PATCH', position, member.token)).status, 200);
  assert.equal((await call(api(owner.code), 'PATCH', { ...position, page: 4 }, owner.token)).status, 200);
  assert.equal((await read(owner.code)).position.sequence, 2);
  const uploaded = await fetch(`${base}${api(owner.code)}/pdfs`, { method: 'POST', headers: { Authorization: `Bearer ${member.token}`, 'Content-Type': 'application/pdf' }, body: Buffer.from('%PDF-1.4\n%%EOF') });
  assert.equal(uploaded.status, 201);
  const { pdfUrl } = await uploaded.json();
  const file = { id: randomBytes(16).toString('hex'), title: 'Shared controller test', pdfUrl }; files.push(file.id);
  assert.equal((await call(`${api(owner.code)}/songs`, 'POST', file, member.token)).status, 201);
  assert.equal((await call(`${api(owner.code)}/sheet`, 'PUT', { sheet: file }, member.token)).status, 200);
  assert.equal((await read(owner.code)).sheet.id, file.id);
  assert.equal((await call(api(owner.code), 'PATCH', position, owner.token)).status, 400, 'Old-source updates cannot move the newly selected file.');
  assert.equal((await call(api(owner.code), 'PATCH', { ...position, sourceId: file.id }, member.token)).status, 200);
  assert.equal((await call(`${api(owner.code)}/sheet`, 'PUT', { sheet: null, location: { page: 8, offset: .3 } }, member.token)).status, 200);
  assert.equal((await read(owner.code)).position.page, 8);
  assert.equal((await call('/api/admin/rooms', 'GET', undefined, member.token)).status, 401);
  assert.equal((await call(`/api/admin/rooms/${owner.code}`, 'DELETE', undefined, member.token)).status, 401);
  assert.equal((await call('/api/admin/default-file', 'PUT', { id: 'pdf' }, member.token)).status, 401);
  assert.equal((await control('release')).status, 200);
  assert.equal((await call(api(owner.code), 'PATCH', position, member.token)).status, 403);
  assert.equal((await call(`/api/admin/rooms/${owner.code}/control`, 'POST', { memberId: member.memberId })).status, 401);
  assert.equal((await call('/api/admin/login', 'POST', { password: `${password}-wrong` })).status, 401);
  const login = await call('/api/admin/login', 'POST', { password }); assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(`/api/admin/rooms/${other.code}/control`, 'POST', { memberId: member.memberId }, '', true)).status, 400);
  assert.equal((await call(`/api/admin/rooms/${owner.code}/control`, 'POST', { memberId: member.memberId }, '', true)).status, 200);
  assert.equal((await call('/api/admin/logout', 'POST', undefined, '', true)).status, 200);
  assert.equal((await call('/api/admin/rooms', 'GET', undefined, '', true)).status, 401);
  assert.equal((await call(api(owner.code), 'PATCH', position, member.token)).status, 200, 'Controller retains musician permission after Settings logs out.');
  const second = await (await call(`${api(owner.code)}/members`, 'POST')).json();
  assert.equal((await call(`${api(owner.code)}/control`, 'POST', { action: 'request' }, second.token)).status, 200);
  assert.equal((await control('approve', member.token, second.memberId)).status, 403);
  console.log('PASS: control requests, owner approval/denial, password grants, shared coordinates, release, room isolation and Settings separation.');
} finally {
  const login = await call('/api/admin/login', 'POST', { password });
  if (login.ok) {
    cookie = login.headers.get('set-cookie').split(';')[0];
    for (const room of rooms) await call(`/api/admin/rooms/${room.code}`, 'DELETE', undefined, '', true);
    for (const id of files) await call(`/api/admin/songs/${id}`, 'DELETE', undefined, '', true);
    await call('/api/admin/logout', 'POST', undefined, '', true);
  }
}
