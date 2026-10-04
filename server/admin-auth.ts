import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export class AdminSessions {
  private salt = randomBytes(16);
  private hash: Buffer;
  private sessions = new Map<string, number>();
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(password: string, private now = Date.now) { this.hash = scryptSync(password, this.salt, 32); }
  login(password: unknown, address: string) {
    const now = this.now();
    for (const [token, expiry] of this.sessions) if (expiry <= now) this.sessions.delete(token);
    for (const [ip, attempt] of this.attempts) if (attempt.until <= now) this.attempts.delete(ip);
    const attempt = this.attempts.get(address) || { count: 0, until: now + 300000 };
    if (attempt.count >= 5) throw new Error('Too many attempts. Try again in five minutes.');
    attempt.count++; this.attempts.set(address, attempt);
    if (typeof password !== 'string' || password.length > 256 || !timingSafeEqual(scryptSync(password, this.salt, 32), this.hash)) throw new Error('Incorrect password.');
    this.attempts.delete(address);
    const token = randomBytes(32).toString('hex'); this.sessions.set(token, now + 3600000); return token;
  }
  authorized(cookie = '') {
    const token = /(?:^|;\s*)music_admin=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1];
    return Boolean(token && (this.sessions.get(token) || 0) > this.now());
  }
  logout(cookie = '') { const token = /music_admin=([a-f0-9]{64})/.exec(cookie)?.[1]; if (token) this.sessions.delete(token); }
}
