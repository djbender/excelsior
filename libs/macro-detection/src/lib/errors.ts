import type { Reason } from './types.js';

export class LimitExceededError extends Error {}
export class EncryptedError extends Error {}

export function reasonFromError(error: unknown): Reason {
  const detail = error instanceof Error ? error.message : 'Unknown error';
  if (error instanceof LimitExceededError) return { code: 'LIMIT_EXCEEDED', detail };
  if (error instanceof EncryptedError) return { code: 'ENCRYPTED', detail };
  return { code: 'UNPARSEABLE', detail };
}
