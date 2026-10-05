import type { User } from 'firebase/auth';
import { validatePdfUpload } from './songbook';

/** Both upload entry points use immutable files in the same public library bucket. */
export async function uploadLibraryPdf(file: File, id: string, user: User | null, localPath?: string, token?: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid file ID.');
  validatePdfUpload(file.size, new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
  if (localPath) {
    const response = await fetch(localPath, { method: 'POST', headers: { 'Content-Type': 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'PDF upload failed.');
    return result.pdfUrl;
  }
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !user) throw new Error('Sign in and configure PDF storage.');
  const filename = `${user.uid}/${id}/document.pdf`;
  const response = await fetch(`${url}/storage/v1/object/room-pdfs/${filename}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file });
  if (!response.ok) throw new Error('PDF upload failed. Check the room-pdfs bucket and upload policy.');
  return `${url}/storage/v1/object/public/room-pdfs/${filename}`;
}
