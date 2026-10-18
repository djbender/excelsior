import { createHmac, randomBytes } from 'node:crypto';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  /** Shared password. Unset means the gate is off (localhost development). */
  password?: string;
  /** Key that signs session cookies. */
  secret: string;
  /** Mark the cookie Secure; true in production, where TLS is in front. */
  secureCookie: boolean;
}

/**
 * Reads the gate settings from the environment. Without SESSION_SECRET the key
 * is random per process, so sessions end whenever the app restarts. The key is
 * also bound to the password, so changing APP_PASSWORD ends every session.
 */
export function authConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const password = env.APP_PASSWORD || undefined;
  const base = env.SESSION_SECRET || randomBytes(32).toString('hex');
  return {
    password,
    secret: createHmac('sha256', base)
      .update(password ?? '')
      .digest('hex'),
    secureCookie: env.NODE_ENV === 'production',
  };
}
