import { afterEach, describe, expect, it, vi } from 'vitest';
const transaction = vi.hoisted(() => vi.fn());
vi.mock('firebase/database', async original => ({ ...await original<typeof import('firebase/database')>(), ref: vi.fn(() => ({})), runTransaction: transaction }));
import { RoomService } from './rooms';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('cloud shared-control transactions', () => {
  it('seeds an empty cache and retries using the server sequence without changing source', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const service = new RoomService();
    Object.assign(service, { db: {}, master: true, activeRoom: true, connected: true, code: '123456', sourceId: 'pdf', sequence: 7 });
    transaction.mockImplementation(async (_ref, update) => {
      expect(update(null)).toMatchObject({ sequence: 8, page: 4, sourceId: 'pdf' });
      expect(update({ sequence: 10, sourceId: 'pdf' })).toMatchObject({ sequence: 11, page: 4 });
      expect(update({ sequence: 11, sourceId: 'other-file' })).toBeUndefined();
      return { committed: true };
    });
    await service.publish({ page: 4, offset: .5, zoom: 2, sourceId: 'pdf' });
    expect(transaction).toHaveBeenCalledOnce();
  });
  it('never starts publishing for pending/read-only followers', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const service = new RoomService();
    Object.assign(service, { db: {}, master: false, controlling: false, activeRoom: true, connected: true, code: '123456' });
    await service.publish({ page: 4, offset: .5, zoom: 2 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
