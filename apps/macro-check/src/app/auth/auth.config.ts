import { randomBytes } from 'node:crypto';

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
 * is random per process, so sessions end whenever the app restarts.
 */
export function authConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  return {
    password: env.APP_PASSWORD || undefined,
    secret: env.SESSION_SECRET || randomBytes(32).toString('hex'),
    secureCookie: env.NODE_ENV === 'production',
  };
}
