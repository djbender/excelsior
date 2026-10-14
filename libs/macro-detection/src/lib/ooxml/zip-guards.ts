import type JSZip from 'jszip';
import { LimitExceededError } from '../errors.js';
import { MAX_CONTENT_TYPES_BYTES, MAX_ZIP_ENTRIES } from '../limits.js';

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_BYTES = 0xffff;
const ZIP64_SENTINEL = 0xffff;

interface StreamHelper {
  on(event: 'data', fn: (chunk: Uint8Array) => void): StreamHelper;
  on(event: 'error', fn: (error: Error) => void): StreamHelper;
  on(event: 'end', fn: () => void): StreamHelper;
  pause(): StreamHelper;
  resume(): StreamHelper;
}

// internalStream exists at runtime but is missing from the bundled typings.
const streamOf = (entry: JSZip.JSZipObject): StreamHelper =>
  (
    entry as unknown as { internalStream(type: 'uint8array'): StreamHelper }
  ).internalStream('uint8array');

export function assertEntryCount(count: number): void {
  if (count > MAX_ZIP_ENTRIES) {
    throw new LimitExceededError(
      `ZIP has more than ${MAX_ZIP_ENTRIES} entries`,
    );
  }
}

/** Cheap pre-check from the end-of-central-directory record, before JSZip parses every entry. */
export function assertDeclaredEntryCount(buf: Uint8Array): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const lowest = Math.max(0, buf.length - EOCD_MIN_SIZE - MAX_COMMENT_BYTES);
  for (let at = buf.length - EOCD_MIN_SIZE; at >= lowest; at--) {
    if (view.getUint32(at, true) !== EOCD_SIGNATURE) continue;
    const total = view.getUint16(at + 10, true);
    // 0xFFFF means ZIP64 or a saturated count; the post-load check covers it.
    if (total !== ZIP64_SENTINEL) assertEntryCount(total);
    return;
  }
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Reads a text entry, aborting as soon as its inflated size passes the cap. */
export function readCappedText(
  zip: JSZip,
  name: string,
): Promise<string | undefined> {
  const entry = zip.file(name);
  if (!entry) return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const stream = streamOf(entry);
    stream
      .on('data', (chunk: Uint8Array) => {
        size += chunk.length;
        if (size > MAX_CONTENT_TYPES_BYTES) {
          stream.pause();
          reject(
            new LimitExceededError(
              `${name} is larger than ${MAX_CONTENT_TYPES_BYTES} bytes`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      })
      .on('error', reject)
      .on('end', () => resolve(new TextDecoder().decode(concat(chunks, size))))
      .resume();
  });
}
