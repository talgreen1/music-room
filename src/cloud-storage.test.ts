import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: { uid: 'uploader', getIdToken: async () => 'firebase-token' },
  records: {} as Record<string, unknown>, rooms: {} as Record<string, unknown>, remove: vi.fn()
}));
vi.mock('firebase/app', () => ({ getApps: () => [{ name: '[DEFAULT]' }, { name: 'settings' }], initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: state.user }) }));
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}), ref: (_db: unknown, path: string) => path,
  get: async (path: string) => ({ val: () => path === 'songs' ? state.records : path === 'rooms' ? state.rooms : null }),
  remove: state.remove, set: vi.fn(), update: vi.fn(), runTransaction: vi.fn()
}));
const origin = 'https://files.example', id = 'a'.repeat(32);
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); state.records = {}; state.rooms = {};
  for (const name of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID']) vi.stubEnv(name, 'configured');
  vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin);
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('GitHub-only cloud imports and cleanup', () => {
  it('sends both Settings and active-room screenshot uploads only to the Worker', async () => {
    const send = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ url: `${origin}/files/uploader/${id}/12-0.jpg` })); vi.stubGlobal('fetch', send);
    const { SettingsService } = await import('./admin'); const { RoomService } = await import('./rooms');
    const settings = new SettingsService(), room = new RoomService(); Object.assign(room, { db: {}, activeRoom: true, code: '123456' });
    const image = new Blob(['jpeg'], { type: 'image/jpeg' });
    await settings.uploadSegment(image, id, 0); await room.uploadSegment(image, id, 0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.every(call => String(call[0]) === `${origin}/files/uploader/${id}/0.jpg`)).toBe(true);
    expect((send.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('X-Room-Code');
    expect((send.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toHaveProperty('X-Room-Code', '123456');
  });
  it('fails cloud imports without GitHub configuration before any network request', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', '');
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    const { SettingsService } = await import('./admin'); const { RoomService } = await import('./rooms');
    const room = new RoomService(); Object.assign(room, { db: {}, activeRoom: true, code: '123456' });
    const image = new Blob(['jpeg'], { type: 'image/jpeg' });
    await expect(new SettingsService().uploadSegment(image, id, 0)).rejects.toThrow('VITE_GITHUB_STORAGE_URL');
    await expect(room.uploadSegment(image, id, 0)).rejects.toThrow('VITE_GITHUB_STORAGE_URL');
    expect(send).not.toHaveBeenCalled();
  });
  it('removes tombstone metadata only after successful GitHub deletion', async () => {
    state.records = { [id]: { id, title: 'Deleted', pdfUrl: `${origin}/files/uploader/${id}/12-document.pdf`, ownerId: 'uploader', createdAt: 1, deletedAt: 2 } };
    const send = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', send);
    const { SettingsService } = await import('./admin');
    await new SettingsService().songs(); expect(send).toHaveBeenCalledOnce(); expect(state.remove).toHaveBeenCalledWith(`songs/${id}`);
    send.mockResolvedValue(new Response(null, { status: 409 })); state.remove.mockClear();
    await expect(new SettingsService().songs()).rejects.toThrow('GitHub cleanup failed'); expect(state.remove).not.toHaveBeenCalled();
  });
  it('retains non-GitHub tombstones and original bytes without making a provider request', async () => {
    state.records = { [id]: { id, title: 'Old deleted file', pdfUrl: 'https://old.example/file.pdf', ownerId: 'uploader', createdAt: 1, deletedAt: 2 } };
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    const { SettingsService } = await import('./admin');
    await expect(new SettingsService().songs()).rejects.toThrow('original bytes and catalog metadata were retained');
    expect(send).not.toHaveBeenCalled(); expect(state.remove).not.toHaveBeenCalled();
  });
  it('keeps bytes and metadata for a deleted file still in an active room', async () => {
    const file = { id, title: 'In use', pdfUrl: `${origin}/files/uploader/${id}/12-document.pdf`, ownerId: 'uploader', createdAt: 1, deletedAt: 2 };
    state.records = { [id]: file }; state.rooms = { '123456': { sheet: file, expiresAt: Date.now() + 60000 } };
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    const { SettingsService } = await import('./admin'); await new SettingsService().songs();
    expect(send).not.toHaveBeenCalled(); expect(state.remove).not.toHaveBeenCalled();
  });
});
