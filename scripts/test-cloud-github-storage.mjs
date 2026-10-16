// Actual services; creates disposable files/room, never changes the global default.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cloudRead, storageSession } from './github-storage-session.mjs';
const files = [], accounts = []; let session, code;
const journal = `.local-data/github-storage-check-${Date.now()}.json`;
let stage = 'Settings sign-in';
async function saveJournal() {
  await mkdir('.local-data', { recursive: true });
  await writeFile(journal, JSON.stringify({ code, files, accountIds: accounts.map(account => account.uid) }, null, 2));
}
try {
  session = await storageSession();
  const { env, origin, token, uid, db } = session;
  assert.equal(await db('storageConfig/githubOrigin'), origin, 'Deploy rules and configure the Worker origin first.');
  async function anonymous() {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    assert.ok(response.ok, 'Anonymous sign-in failed.');
    const { idToken: token, localId: uid } = await response.json(); const account = { token, uid }; accounts.push(account); return account;
  }
  async function musicianDb(account, path, method, body, reserve = false) {
    return fetch(`${env.VITE_FIREBASE_DATABASE_URL}/${path}.json?auth=${encodeURIComponent(account.token)}`, { method, headers: { 'Content-Type': 'application/json', ...(reserve ? { 'if-match': 'null_etag' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const owner = await anonymous(), follower = await anonymous();
  stage = 'reserve disposable room';
  const now = Date.now(), original = await db('songbook') || { pdfUrl: '/songbooks/songbook-2026-10.pdf', pdfVersion: '2026-10', pdfTitle: 'Songbook' };
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = String(100000 + Math.floor(Math.random() * 900000));
    const response = await musicianDb(owner, `rooms/${candidate}`, 'PUT', { ...original, masterId: owner.uid, createdAt: now, expiresAt: now + 86400000, position: { page: 1, offset: 0, zoom: 1, sequence: 0, updatedAt: now } }, true);
    if (response.ok) { code = candidate; break; }
    assert.equal(response.status, 412, 'Test room creation failed.');
  }
  assert.ok(code, 'Could not reserve a test room.');
  await saveJournal();
  for (const [index, account] of [owner, follower, { token, uid }].entries()) {
    stage = `${['Master', 'Follower', 'Settings'][index]} upload`;
    const id = randomBytes(16).toString('hex'), pdf = index !== 1;
    const filename = pdf ? 'document.pdf' : '0.jpg';
    const bytes = pdf ? (index === 0 && process.argv.includes('--large-pdf') ? await readFile('public/songbooks/songbook-2026-10.pdf') : Buffer.from('%PDF-1.4\n%Storage permission fixture\n%%EOF')) : Buffer.from([255, 216, 255, 224, 1, 2, 255, 217]);
    const endpoint = `${origin}/files/${account.uid}/${id}/${filename}`;
    const headers = { Authorization: `Bearer ${account.token}`, 'Content-Type': pdf ? 'application/pdf' : 'image/jpeg', 'X-File-Size': String(bytes.length), ...(index === 2 ? {} : { 'X-Room-Code': code }) };
    const response = await fetch(endpoint, { method: 'POST', headers, body: bytes });
    assert.equal(response.status, 201, `Storage upload failed (${response.status}).`);
    const { url } = await response.json();
    const entry = { id, ownerId: account.uid, title: 'Disposable GitHub storage check', createdAt: Date.now(), ...(index === 2 ? {} : { roomCode: code }), ...(pdf ? { pdfUrl: url } : { segments: [{ url, width: 1, height: 1 }] }) };
    files.push({ entry, url, saved: false });
    await saveJournal();
    const saved = await musicianDb(account, `songs/${id}`, 'PUT', entry); assert.ok(saved.ok, 'Catalog rejected GitHub URL.'); files.at(-1).saved = true;
    await saveJournal();
    stage = `${['Master', 'Follower', 'Settings'][index]} download`;
    const loaded = await cloudRead(url); assert.ok(loaded.ok); assert.deepEqual(Buffer.from(await loaded.arrayBuffer()), bytes);
    stage = `${['Master', 'Follower', 'Settings'][index]} permissions`;
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: bytes })).status, 409, 'Overwrite must be denied.');
    assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${follower.token}` } })).status, 403, 'Follower deletion must be denied.');
    assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })).status, 409, 'Live catalog files must be retained.');
    if (index === 1) {
      assert.equal((await musicianDb(follower, `rooms/${code}/position/page`, 'PUT', 2)).status, 401, 'Uploading does not grant room control.');
      assert.equal((await musicianDb(follower, 'storageConfig/githubOrigin', 'PUT', 'https://other.example')).status, 401, 'Only Settings may configure storage.');
    }
  }
  console.log(`PASS: GitHub PDF/JPEG uploads${process.argv.includes('--large-pdf') ? ' (including the full songbook)' : ''}, exact downloads, immutable writes, Settings-only deletion and uploader permissions.`);
} catch (error) {
  console.error(error instanceof TypeError ? `Cloud network check failed during ${stage} (${error.cause?.code || error.name}).` : error.message); process.exitCode = 1;
} finally {
  if (session) {
    try {
      if (code) await session.db(`rooms/${code}`, 'DELETE');
      for (const { entry, url, saved } of files) {
        if (saved) await session.db(`songs/${entry.id}/deletedAt`, 'PUT', Date.now());
        const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
        assert.equal(response.status, 204, 'Disposable asset cleanup failed.');
        if (saved) await session.db(`songs/${entry.id}`, 'DELETE');
      }
      console.log('Disposable cloud files and room cleaned up.');
      for (const account of accounts) {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${session.env.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: account.token }) });
        if (!response.ok) {
          const result = await response.json();
          const code = result.error?.message?.split(':')[0];
          throw new Error(`Temporary anonymous account cleanup failed (${response.status}, ${/^[A-Z_]+$/.test(code) ? code : 'unknown'}).`);
        }
      }
      console.log('Disposable cloud files, room and identities cleaned up.');
    } catch (error) { console.error(error instanceof TypeError ? 'Cleanup network request failed.' : error.message); console.error(`Cleanup incomplete; review ${journal} before release.`); process.exitCode = 1; }
  }
}
