import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { uploadLibraryPdf } from './file-upload';
const id = 'b'.repeat(32), origin = 'https://files.example';
const user = { uid: 'uploader', getIdToken: async () => 'firebase-token' } as unknown as User;
const pdf = () => new File(['%PDF-1.4\nfixture'], 'book.pdf', { type: 'application/pdf' });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('PDF upload destinations', () => {
  it('requires GitHub for cloud PDFs and never falls back when configuration is absent', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', ''); const send = vi.fn(); vi.stubGlobal('fetch', send);
    await expect(uploadLibraryPdf(pdf(), id, user)).rejects.toThrow('VITE_GITHUB_STORAGE_URL'); expect(send).not.toHaveBeenCalled();
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', origin);
    const url = `${origin}/files/uploader/${id}/12-document.pdf`;
    send.mockResolvedValue(Response.json({ url })); expect(await uploadLibraryPdf(pdf(), id, user, undefined, undefined, '123456')).toBe(url);
    expect(send).toHaveBeenCalledWith(`${origin}/files/uploader/${id}/document.pdf`, expect.objectContaining({ headers: expect.objectContaining({ 'X-Room-Code': '123456' }) }));
  });
  it('preserves local uploads without any GitHub configuration and validates PDFs first', async () => {
    vi.stubEnv('VITE_GITHUB_STORAGE_URL', ''); const send = vi.fn(async () => Response.json({ pdfUrl: '/api/songbooks/book.pdf' })); vi.stubGlobal('fetch', send);
    expect(await uploadLibraryPdf(pdf(), id, null, '/api/admin/upload')).toBe('/api/songbooks/book.pdf');
    await expect(uploadLibraryPdf(new File(['not PDF'], 'book.pdf'), id, null, '/api/admin/upload')).rejects.toThrow('not a PDF');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
