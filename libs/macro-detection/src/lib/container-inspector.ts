import type { Reason } from './types.js';

/** Strategy: finds macro evidence in one container format. Throws if the input cannot be verified. */
export interface ContainerInspector {
  matches(buf: Uint8Array): boolean;
  inspect(buf: Uint8Array): Promise<Reason[]>;
}

export const startsWith = (
  buf: Uint8Array,
  magic: readonly number[],
): boolean =>
  buf.length >= magic.length && magic.every((byte, i) => buf[i] === byte);
