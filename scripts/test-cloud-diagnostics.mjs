// Run after deploying Database rules, before publishing the dependent frontend.
// Uses disposable rooms/reports/anonymous identities only. No catalog/default/files.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { storageSession } from './github-storage-session.mjs';
const session = await storageSession(), users = []; let code;
assert.notEqual(session.env.VITE_USE_FIREBASE_EMULATORS, 'true', 'This check targets actual cloud services, not emulators.');
const id = randomBytes(16).toString('hex');
const request = (token, path, method = 'GET', body) => fetch(`${session.env.VITE_FIREBASE_DATABASE_URL}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const denied = async response => { assert.ok([401, 403].includes(response.status), `Expected denial, got ${response.status}`); };
try {
  for (let n = 0; n < 2; n++) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${session.env.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    assert.ok(response.ok); const user = await response.json(); users.push({ uid: user.localId, token: user.idToken });
  }
  const now = Date.now(), original = await session.db('songbook');
  for (let n = 0; n < 10; n++) {
    const candidate = String(100000 + Math.floor(Math.random() * 900000));
    const response = await fetch(`${session.env.VITE_FIREBASE_DATABASE_URL}/rooms/${candidate}.json?auth=${encodeURIComponent(users[0].token)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': 'null_etag' }, body: JSON.stringify({ ...original, masterId: users[0].uid, createdAt: now, expiresAt: now + 86400000, position: { page: 1, offset: 0, zoom: 1, sequence: 0, updatedAt: now } }) });
    if (response.ok) { code = candidate; break; } assert.equal(response.status, 412);
  }
  assert.ok(code);
  const path = `syncDiagnostics/${code}/${users[1].uid}/${id}`;
  const geometry = { anchorPage: 113, anchorOffset: .5, anchorTop: 100000, anchorHeight: 1000, beforeTop: 50000, targetTop: 100500, actualTop: 100500, targetLeft: -20, actualLeft: 0, scrollHeight: 500000, viewportHeight: 800 };
  const report = { roomCreatedAt: now, createdAt: Date.now(), updatedAt: Date.now(), expiresAt: 0, batch: 1, platform: 'ios', browser: 'safari', events: [{ event: 'pinch-start', at: Date.now() }] }; report.expiresAt = report.createdAt + 86400000;
  report.events.push({ event: 'pinch-layout', at: Date.now(), geometry }, { event: 'pinch-frame', at: Date.now(), geometry: { ...geometry, actualTop: 200000 } });
  await denied(await request('', path, 'PUT', report));
  await denied(await request(users[0].token, path, 'PUT', report));
  await denied(await request(users[1].token, path, 'PUT', { ...report, roomCreatedAt: now - 1 }));
  await denied(await request(users[1].token, path, 'PUT', { ...report, password: 'must-be-rejected' }));
  await denied(await request(users[1].token, path, 'PUT', { ...report, events: Array(51).fill(report.events[0]) }));
  for (const change of [{ secret: 'reject' }, { anchorOffset: 2 }, { actualTop: 'text' }, { anchorHeight: null }]) {
    await denied(await request(users[1].token, path, 'PUT', { ...report, events: [{ event: 'pinch-layout', at: Date.now(), geometry: { ...geometry, ...change } }] }));
  }
  assert.ok((await request(users[1].token, path, 'PUT', report)).ok, 'A musician may write own reports without control.');
  await denied(await request(users[1].token, path)); await denied(await request(users[0].token, `syncDiagnostics/${code}`)); await denied(await request('', path));
  await denied(await request(users[1].token, path, 'DELETE'));
  await denied(await request(users[1].token, `${path}/events/0/page`, 'PUT', 2));
  await denied(await request(users[1].token, path, 'PUT', { ...report, batch: 2 }));
  await denied(await request(users[1].token, `rooms/${code}/position/page`, 'PUT', 2));
  assert.equal((await session.db(path)).events[0].event, 'pinch-start');
  assert.equal((await session.db(path)).events[2].geometry.actualTop, 200000);
  await new Promise(resolve => setTimeout(resolve, 4100));
  assert.ok((await request(users[1].token, path, 'PUT', { ...report, updatedAt: Date.now(), batch: 2 })).ok);
  await session.db(path, 'DELETE'); assert.equal(await session.db(path), null);
  await session.db(`rooms/${code}`, 'DELETE');
  await denied(await request(users[1].token, path, 'PUT', report));
  console.log('PASS: own-namespace diagnostic uploads, room lifetime/schema/batch limits, denied musician/anonymous reads and deletes, Settings-only reads/deletion, unchanged room control.');
} catch (error) {
  console.error(error instanceof TypeError ? 'Cloud diagnostics network request failed.' : error.message); process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  if (code) {
    try { await session.db(`syncDiagnostics/${code}`, 'DELETE'); } catch { cleanupFailed = true; }
    try { await session.db(`rooms/${code}`, 'DELETE'); } catch { cleanupFailed = true; }
  }
  for (const user of users) {
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${session.env.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: user.token }) });
      if (!response.ok) cleanupFailed = true;
    } catch { cleanupFailed = true; }
  }
  if (cleanupFailed) { console.error(`Disposable diagnostics cleanup incomplete; inspect only the test room/reports ${code || '(no room)'} and temporary test identities.`); process.exitCode = 1; }
  else console.log('Disposable diagnostic reports, room and identities cleaned up.');
}
