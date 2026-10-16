import { storageSession } from './github-storage-session.mjs';
try {
  const { db, origin } = await storageSession();
  await db('storageConfig/githubOrigin', 'PUT', origin);
  console.log('GitHub storage origin configured. Run the actual-service storage checks before publishing Hosting.');
} catch (error) {
  console.error(error instanceof TypeError ? 'Storage configuration network request failed.' : error.message); process.exitCode = 1;
}
