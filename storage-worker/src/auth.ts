export interface AuthEnv { FIREBASE_PROJECT_ID: string; FIREBASE_DATABASE_URL: string }
export type Fetcher = typeof fetch;
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function decode(part: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
let keys: { expires: number; value: (JsonWebKey & { kid: string })[] } | undefined;

/** Verify identity locally; authorization still comes from current Database rules. */
export async function identity(token: string, env: AuthEnv, send: Fetcher): Promise<string> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 8192) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        claims.aud !== env.FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` ||
        typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub) ||
        typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 30 ||
        typeof claims.auth_time !== 'number' || claims.auth_time > now + 30) throw new Error();
    if (!keys || keys.expires <= Date.now() || !keys.value.some(key => key.kid === header.kid)) {
      const response = await send('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!response.ok) throw new HttpError(503, 'Identity service unavailable.');
      const result = await response.json() as { keys: (JsonWebKey & { kid: string })[] };
      keys = { value: result.keys, expires: Date.now() + 3600_000 };
    }
    const jwk = keys.value.find(key => key.kid === header.kid);
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error();
    return claims.sub;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Sign in again before uploading.');
  }
}

export async function database(path: string, token: string, env: AuthEnv, send: Fetcher, shallow = false): Promise<Response> {
  const url = new URL(`${env.FIREBASE_DATABASE_URL.replace(/\/$/, '')}/${path}.json`);
  url.searchParams.set('auth', token);
  if (shallow) url.searchParams.set('shallow', 'true');
  return send(url.toString());
}
export async function requireAdmin(token: string, env: AuthEnv, send: Fetcher) {
  // Only Settings can list rooms, even when there are no rooms. Never trust JWT email.
  const response = await database('rooms', token, env, send, true);
  if (response.status === 401 || response.status === 403) throw new HttpError(403, 'Settings permission required.');
  if (!response.ok) throw new HttpError(503, 'Room service unavailable.');
}
export async function requireUpload(room: string | null, token: string, env: AuthEnv, send: Fetcher) {
  if (room === null) return requireAdmin(token, env, send);
  if (!/^\d{6}$/.test(room)) throw new HttpError(400, 'Invalid room code.');
  const response = await database(`rooms/${room}`, token, env, send);
  if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 403 : 503, 'Join an active room before uploading.');
  const data = await response.json() as { expiresAt?: number } | null;
  if (!data || typeof data.expiresAt !== 'number' || data.expiresAt <= Date.now()) throw new HttpError(403, 'Join an active room before uploading.');
}
