import { signInAnonymously, type Auth, type User } from 'firebase/auth';
import { operationError, withDeadline } from './operation-timeout';

export type RoomInitPhase = 'authentication' | 'token' | 'clock';
function checkIdentity(auth: Auth, user: User | null, expected: string): asserts user is User {
  if (!user || (expected && user.uid !== expected) || auth.currentUser?.uid !== user.uid) {
    throw operationError('room/identity-changed', 'Your room session changed or is no longer signed in. Reload the app to reconnect.');
  }
}
/** Validate the current musician on every join; never replace an existing room identity. */
export async function ensureRoomIdentity(auth: Auth, expected: string, phase?: (value: RoomInitPhase) => void, signal?: AbortSignal) {
  phase?.('authentication'); let alive = true;
  let user: User;
  try {
    user = await withDeadline((async () => {
      await auth.authStateReady();
      if (!alive || signal?.aborted) throw new DOMException('Operation cancelled.', 'AbortError');
      if (expected) { checkIdentity(auth, auth.currentUser, expected); return auth.currentUser; }
      return auth.currentUser || (await signInAnonymously(auth)).user;
    })(), 30000, 'room/authentication-timeout', signal);
  } finally { alive = false; }
  checkIdentity(auth, user, expected);
  phase?.('token');
  // Firebase refreshes expired tokens here; a valid cached token need not make a network request.
  await withDeadline(user.getIdToken(), 15000, 'room/token-timeout', signal);
  checkIdentity(auth, auth.currentUser, user.uid);
  return user.uid;
}
export async function refreshRoomIdentity(auth: Auth, expected: string, signal: AbortSignal) {
  let alive = true;
  try {
    await withDeadline((async () => {
      await auth.authStateReady();
      if (!alive || signal.aborted) throw new DOMException('Operation cancelled.', 'AbortError');
      const user = auth.currentUser; checkIdentity(auth, user, expected);
      if (!expected) throw operationError('room/identity-changed', 'No existing room identity is available to refresh. Reload the app to reconnect.');
      await user.getIdToken(true);
      if (!alive || signal.aborted) throw new DOMException('Operation cancelled.', 'AbortError');
      checkIdentity(auth, auth.currentUser, expected);
    })(), 15000, 'room/auth-recovery-timeout', signal);
  } finally { alive = false; }
}
