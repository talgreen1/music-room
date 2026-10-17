import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserConfigFnObject } from 'vite';
vi.mock('vite', async original => ({ ...await original<typeof import('vite')>(), loadEnv: () => ({}) }));
vi.mock('../server/local-rooms', () => ({ localRoomsPlugin: () => ({ name: 'isolated-test-backend' }) }));
import config from '../vite.config';
const configure = config as UserConfigFnObject;
afterEach(() => vi.unstubAllEnvs());
describe('GitHub-only deployment configuration', () => {
  it('rejects missing and invalid Worker origins and accepts a configured cloud deployment', () => {
    for (const name of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID']) vi.stubEnv(name, 'configured');
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', '');
    expect(() => configure({ mode: 'deployment', command: 'build' })).toThrow('VITE_GITHUB_STORAGE_URL');
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', 'https://files.example/path');
    expect(() => configure({ mode: 'deployment', command: 'build' })).toThrow('without a path');
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', 'https://files.example');
    expect(configure({ mode: 'deployment', command: 'build' })).toHaveProperty('plugins');
  });
  it('keeps normal local development usable without a Worker origin', () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', '');
    expect(configure({ mode: 'development', command: 'serve' })).toHaveProperty('plugins');
  });
});
