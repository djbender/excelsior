import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(secret: string, expiresAt: string): string {
  return createHmac('sha256', secret).update(expiresAt).digest('hex');
}

/** A stateless session token: the expiry time plus an HMAC of it. */
export function createSession(secret: string, now = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS);
  return `${expiresAt}.${sign(secret, expiresAt)}`;
}

export function isValidSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  const [expiresAt, signature, ...rest] = (token ?? '').split('.');
  if (!expiresAt || !signature || rest.length > 0) return false;
  const expected = Buffer.from(sign(secret, expiresAt));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual) && Number(expiresAt) > now;
}

/** Pulls one cookie out of a raw Cookie header. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}
