import type JSZip from 'jszip';
import { LimitExceededError } from '../errors.js';
import { MAX_CONTENT_TYPES_BYTES, MAX_ZIP_ENTRIES } from '../limits.js';

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_BYTES = 0xffff;
const ZIP64_SENTINEL = 0xffff;
const SATURATED_32 = 0xffffffff;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const CENTRAL_HEADER_SIZE = 46;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_RECORD_SIGNATURE = 0x06064b50;
const ZIP64_RECORD_SIZE = 56;

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

/**
 * Counts the central directory's real entries before JSZip parses the archive.
 *
 * JSZip walks the central directory by signature and ignores the count in the
 * end record, so a file can declare 2 entries and hold hundreds of thousands, each
 * costing JSZip memory. This walk is bounded: it stops one entry past the limit.
 * It leaves a missing end record to JSZip, which reports it as a corrupt archive.
 */
export function assertCentralDirectoryEntryCount(buf: Uint8Array): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const endRecord = findEndRecord(view);
  if (endRecord === undefined) return;

  const bounds = readCentralDirectoryBounds(view, endRecord);
  const end = bounds.offset + bounds.size;
  if (end > endRecord) {
    throw new Error('Corrupted zip: central directory overruns the archive');
  }

  let offset = bounds.offset;
  let entries = 0;
  while (offset < end) {
    if (
      offset + CENTRAL_HEADER_SIZE > end ||
      view.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE
    ) {
      throw new Error('Corrupted zip: bad central directory entry');
    }
    entries++;
    assertEntryCount(entries);
    offset +=
      CENTRAL_HEADER_SIZE +
      view.getUint16(offset + 28, true) + // file name length
      view.getUint16(offset + 30, true) + // extra field length
      view.getUint16(offset + 32, true); // comment length
  }
}

function findEndRecord(view: DataView): number | undefined {
  const lowest = Math.max(
    0,
    view.byteLength - EOCD_MIN_SIZE - MAX_COMMENT_BYTES,
  );
  for (let at = view.byteLength - EOCD_MIN_SIZE; at >= lowest; at--) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  return undefined;
}

/** Offset and size of the central directory, from the ZIP64 records when the plain ones are saturated. */
function readCentralDirectoryBounds(
  view: DataView,
  endRecord: number,
): { offset: number; size: number } {
  const size = view.getUint32(endRecord + 12, true);
  const offset = view.getUint32(endRecord + 16, true);
  const entries = view.getUint16(endRecord + 10, true);
  if (
    size !== SATURATED_32 &&
    offset !== SATURATED_32 &&
    entries !== ZIP64_SENTINEL
  ) {
    return { offset, size };
  }

  const locator = endRecord - ZIP64_LOCATOR_SIZE;
  if (
    locator < 0 ||
    view.getUint32(locator, true) !== ZIP64_LOCATOR_SIGNATURE
  ) {
    throw new Error('Corrupted zip: ZIP64 locator not found');
  }
  const record = readUint64(view, locator + 8);
  if (
    record + ZIP64_RECORD_SIZE > locator ||
    view.getUint32(record, true) !== ZIP64_RECORD_SIGNATURE
  ) {
    throw new Error('Corrupted zip: ZIP64 end record not found');
  }
  return {
    size: readUint64(view, record + 40),
    offset: readUint64(view, record + 48),
  };
}

/** Reads a 64-bit field. Anything past 2^32 is impossible inside the input size limit. */
function readUint64(view: DataView, at: number): number {
  if (view.getUint32(at + 4, true) !== 0) {
    throw new Error(
      'Corrupted zip: ZIP64 field larger than the input size limit',
    );
  }
  return view.getUint32(at, true);
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
