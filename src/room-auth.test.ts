// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInAnonymously: h.signIn }));
import { ensureRoomIdentity, refreshRoomIdentity } from './room-auth';
import type { Auth } from 'firebase/auth';
beforeEach(() => { vi.useFakeTimers(); h.signIn.mockReset(); });
afterEach(() => vi.useRealTimers());
function fixture(uid = 'musician') {
  const token = vi.fn().mockResolvedValue('not-logged'), user = { uid, getIdToken: token };
  const auth = { currentUser: user as typeof user | null, authStateReady: vi.fn().mockResolvedValue(undefined) };
  return { auth: auth as unknown as Auth, state: auth, user, token };
}
it('reuses the existing UID and gets a valid token without creating or signing out a musician', async () => {
  const t = fixture(); const phase = vi.fn(); expect(await ensureRoomIdentity(t.auth, 'musician', phase)).toBe('musician');
  expect(h.signIn).not.toHaveBeenCalled(); expect(t.token).toHaveBeenCalledOnce(); expect(phase.mock.calls.flat()).toEqual(['authentication', 'token']);
  const controller = new AbortController(); await refreshRoomIdentity(t.auth, 'musician', controller.signal);
  expect(t.token).toHaveBeenLastCalledWith(true); expect(t.auth.currentUser?.uid).toBe('musician');
});
it('creates an anonymous identity only on first initialization with no restored identity', async () => {
  const t = fixture(); t.state.currentUser = null; h.signIn.mockImplementation(async () => { t.state.currentUser = t.user; return { user: t.user }; });
  expect(await ensureRoomIdentity(t.auth, '')).toBe('musician'); expect(h.signIn).toHaveBeenCalledWith(t.auth);
});
it('refuses a missing/changed identity rather than silently losing Master or controller ownership', async () => {
  const t = fixture('someone-else'); await expect(ensureRoomIdentity(t.auth, 'original-owner')).rejects.toMatchObject({ code: 'room/identity-changed' });
  await expect(refreshRoomIdentity(t.auth, 'original-owner', new AbortController().signal)).rejects.toMatchObject({ code: 'room/identity-changed' });
  t.state.currentUser = null; await expect(ensureRoomIdentity(t.auth, 'original-owner')).rejects.toMatchObject({ code: 'room/identity-changed' });
  expect(h.signIn).not.toHaveBeenCalled(); expect(t.token).not.toHaveBeenCalled();
});
it('rechecks identity if it changes while the token is being refreshed', async () => {
  const t = fixture(); t.token.mockImplementationOnce(async () => { t.state.currentUser = { ...t.user, uid: 'other' }; return 'not-logged'; });
  await expect(refreshRoomIdentity(t.auth, 'musician', new AbortController().signal)).rejects.toMatchObject({ code: 'room/identity-changed' });
});
it('bounds token recovery and cancels obsolete waits without creating another user', async () => {
  const t = fixture(); t.token.mockImplementation(() => new Promise(() => {}));
  const timeout = refreshRoomIdentity(t.auth, 'musician', new AbortController().signal).catch(error => error);
  await vi.advanceTimersByTimeAsync(15000); expect((await timeout).code).toBe('room/auth-recovery-timeout');
  const controller = new AbortController(), canceled = refreshRoomIdentity(t.auth, 'musician', controller.signal).catch(error => error); controller.abort();
  expect((await canceled).name).toBe('AbortError'); expect(h.signIn).not.toHaveBeenCalled();
});
