import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { cloudRead, storageSession } from './github-storage-session.mjs';
import { migrationChanges } from './github-migration-plan.mjs';

// Default: durable backup/inventory only. --apply explicitly uploads and changes metadata.
// Run during a quiet maintenance session; do not edit defaults/library concurrently.
const apply = process.argv.includes('--apply');
const originalIndex = process.argv.indexOf('--original-file');
const originalFile = originalIndex === -1 ? undefined : process.argv[originalIndex + 1];
if (originalIndex !== -1 && (!originalFile || originalFile.startsWith('--'))) throw new Error('Pass the local original PDF path after --original-file.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const { token, uid, origin, db } = await storageSession();
  const initial = { songs: await db('songs') || {}, songbook: await db('songbook'), defaultFile: await db('defaultFile') || 'pdf' };
  const dir = `.local-data/github-migration/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/metadata.json`, JSON.stringify(initial, null, 2));
  const copies = [], uploaded = []; let originalUrl;
  async function copy(url, id, filename, localFile) {
    if (!localFile && url.startsWith(origin + '/files/')) return url;
    const resolved = new URL(url, 'https://talgreen-music-room.web.app');
    if (resolved.protocol !== 'https:') throw new Error('Migration requires HTTPS sources.');
    let bytes;
    if (localFile) bytes = new Uint8Array(await readFile(localFile));
    else {
      const response = await cloudRead(resolved);
      if (!response.ok) throw new Error(`Source download failed (${response.status}); no metadata changed.`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    await writeFile(`${dir}/${digest(bytes)}-${filename}`, bytes);
    if (!apply) return url;
    const result = await fetch(`${origin}/files/${uid}/${id}/${filename}`, { method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', 'X-File-Size': String(bytes.length)
    }, body: bytes });
    if (!result.ok) throw new Error(`GitHub copy failed (${result.status}); no metadata changed.`);
    const { url: destination } = await result.json();
    if (!destination?.startsWith(`${origin}/files/${uid}/${id}/`)) throw new Error('Unexpected migration destination.');
    const verify = await cloudRead(destination);
    if (!verify.ok || digest(new Uint8Array(await verify.arrayBuffer())) !== digest(bytes)) throw new Error('Copied bytes did not verify; no metadata changed.');
    uploaded.push(destination);
    await writeFile(`${dir}/uploaded.json`, JSON.stringify(uploaded, null, 2));
    return destination;
  }
  if (initial.songbook && (originalFile || !initial.songbook.pdfUrl.startsWith(origin + '/files/'))) {
    originalUrl = await copy(initial.songbook.pdfUrl, randomBytes(16).toString('hex'), 'document.pdf', originalFile);
  }
  for (const song of Object.values(initial.songs)) {
    if (song.deletedAt) continue;
    const urls = song.pdfUrl ? [song.pdfUrl] : song.segments.map(segment => segment.url);
    if (urls.every(url => url.startsWith(origin + '/files/'))) continue;
    const id = randomBytes(16).toString('hex');
    const copied = [];
    if (song.pdfUrl) copied.push(await copy(song.pdfUrl, id, 'document.pdf'));
    else {
      for (const [index, segment] of song.segments.entries()) copied.push(await copy(segment.url, id, `${index}.jpg`));
    }
    copies.push({ previousId: song.id, id, urls: copied });
  }
  if (apply) {
    const latest = { songs: await db('songs') || {}, songbook: await db('songbook'), defaultFile: await db('defaultFile') || 'pdf' };
    if (JSON.stringify(latest) !== JSON.stringify(initial)) throw new Error('Library changed during migration; no metadata changed. Retry in a quiet session.');
    const changes = migrationChanges(initial, copies, originalUrl, Date.now(), origin, uid);
    await writeFile(`${dir}/changes.json`, JSON.stringify(changes, null, 2));
    await db('', 'PATCH', changes);
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'backup-only', libraryFiles: Object.keys(initial.songs).length, copiedObjects: uploaded.length, backupDirectory: dir, activeRoomsUnchanged: true }));
} catch (error) {
  console.error(error instanceof TypeError ? `Network failure (${error.cause?.code || error.name}); existing production files were retained.` : error.message);
  process.exitCode = 1;
}
