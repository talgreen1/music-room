import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { deleteGitHubFiles, storageOrigin, uploadGitHubFile } from './github-storage';
const id = 'b'.repeat(32), origin = 'https://files.example';
const user = { uid: 'uploader', getIdToken: async () => 'firebase-token' } as unknown as User;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('GitHub file storage client', () => {
  it('requires GitHub configuration and rejects origins with paths', () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', ''); expect(() => storageOrigin()).toThrow('VITE_GITHUB_STORAGE_URL');
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin + '/unexpected'); expect(() => storageOrigin()).toThrow();
  });
  it('sends only Firebase authorization and an active-room hint for room uploads', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin);
    const url = `${origin}/files/uploader/${id}/12-document.pdf`;
    const send = vi.fn(async () => Response.json({ url }, { status: 201 })); vi.stubGlobal('fetch', send);
    // Some phone file pickers omit MIME even for valid PDFs; the endpoint selects it.
    expect(await uploadGitHubFile(new Blob(['%PDF-']), id, 'document.pdf', user, '123456')).toBe(url);
    expect(send.mock.calls[0]).toEqual([`${origin}/files/uploader/${id}/document.pdf`, expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer firebase-token', 'Content-Type': 'application/pdf', 'X-File-Size': '5', 'X-Room-Code': '123456' } })]);
  });
  it('does not send a room hint with Settings uploads and rejects untrusted returned URLs', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin);
    const send = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ url: 'https://wrong.example/file' })); vi.stubGlobal('fetch', send);
    await expect(uploadGitHubFile(new Blob(['image']), id, '0.jpg', user)).rejects.toThrow('invalid file URL');
    expect(send.mock.calls[0][1].headers).not.toHaveProperty('X-Room-Code');
  });
  it('never deletes mixed, legacy or unrelated storage paths', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin);
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    expect(await deleteGitHubFiles([`${origin}/files/uploader/${id}/12-document.pdf`, 'https://legacy.example/file.pdf'], 'uploader', id, user)).toBe(false);
    expect(await deleteGitHubFiles([`${origin}/files/other/${id}/12-document.pdf`], 'uploader', id, user)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('surfaces cleanup failures so catalog metadata can be kept for retry', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 409 })));
    await expect(deleteGitHubFiles([`${origin}/files/uploader/${id}/12-document.pdf`], 'uploader', id, user)).rejects.toThrow('refresh Settings');
  });
});
