// Isolated HTTP/PDF regressions: no cloud configuration or user local-data writes.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const originalCwd = process.cwd();
const folder = await mkdtemp(join(tmpdir(), 'music-room-integration-'));
const password = randomBytes(24).toString('hex');
let server;
function run(script, env) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(repo, 'scripts', script)], { cwd: folder, env, stdio: 'inherit' });
    const deadline = setTimeout(() => { child.kill(); reject(new Error(`${script} timed out.`)); }, 60000);
    child.on('error', error => { clearTimeout(deadline); reject(error); });
    child.on('exit', code => { clearTimeout(deadline); code === 0 ? done() : reject(new Error(`${script} failed (${code}).`)); });
  });
}
try {
  await mkdir(join(folder, 'public', 'songbooks'), { recursive: true });
  await copyFile(join(repo, 'public/songbooks/songbook-2026-10.pdf'), join(folder, 'public/songbooks/songbook-2026-10.pdf'));
  await writeFile(join(folder, '.env.local'), `MUSIC_ADMIN_PASSWORD=${password}\n`);
  process.chdir(folder);
  server = await createServer({ configFile: join(repo, 'vite.config.ts'), root: folder, server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No local test port.');
  const env = { ...process.env, MUSIC_ADMIN_PASSWORD: password, MUSIC_ROOM_TEST_URL: `http://127.0.0.1:${address.port}` };
  for (const script of ['test-local-server.mjs', 'test-settings.mjs', 'test-file-library.mjs', 'test-room-files.mjs', 'test-follower-uploads.mjs', 'test-shared-control.mjs', 'test-pdf-compat.mjs']) {
    console.log(`Checking ${script}`);
    await run(script, env);
  }
  console.log('PASS: all isolated local integration and PDF compatibility checks.');
} finally {
  await server?.close();
  process.chdir(originalCwd);
  const target = resolve(folder);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('music-room-integration-')) throw new Error('Unexpected test cleanup path.');
  await rm(target, { recursive: true, force: true });
}
