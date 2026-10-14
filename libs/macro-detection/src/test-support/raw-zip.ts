/**
 * Builds ZIP bytes by hand, so tests can write things JSZip never would: a central
 * directory that disagrees with the local headers, or an end record that lies about
 * how many entries follow. Entries are stored (no compression) and CRCs are zero.
 * Everything stays in memory and every size is chosen by the caller.
 */
export interface RawZipEntry {
  /** Name in the local file header. */
  name: string;
  /** Name in the central directory entry. Defaults to `name`. */
  centralName?: string;
  data?: string | Uint8Array;
  /**
   * Point this central entry at the local header of an earlier entry (by index)
   * instead of writing a new one.
   */
  reuseLocalOf?: number;
}

export interface RawZipOptions {
  /** Entry count written to the end-of-central-directory record. Defaults to the real count. */
  declaredCount?: number;
}

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const encoder = new TextEncoder();

export function rawZip(
  entries: RawZipEntry[],
  { declaredCount = entries.length }: RawZipOptions = {},
): Uint8Array {
  const prepared = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    centralName: encoder.encode(entry.centralName ?? entry.name),
    data:
      typeof entry.data === 'string'
        ? encoder.encode(entry.data)
        : (entry.data ?? new Uint8Array()),
    reuseLocalOf: entry.reuseLocalOf,
  }));

  const localOffsets: number[] = [];
  let localSize = 0;
  for (const entry of prepared) {
    if (entry.reuseLocalOf === undefined) {
      localOffsets.push(localSize);
      localSize += LOCAL_HEADER_SIZE + entry.name.length + entry.data.length;
    } else {
      localOffsets.push(localOffsets[entry.reuseLocalOf]);
    }
  }
  const centralSize = prepared.reduce(
    (sum, entry) => sum + CENTRAL_HEADER_SIZE + entry.centralName.length,
    0,
  );

  const out = new Uint8Array(localSize + centralSize + END_RECORD_SIZE);
  const view = new DataView(out.buffer);

  let at = 0;
  for (const entry of prepared) {
    if (entry.reuseLocalOf !== undefined) continue;
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 10, true); // version needed
    view.setUint32(at + 18, entry.data.length, true); // compressed size
    view.setUint32(at + 22, entry.data.length, true); // uncompressed size
    view.setUint16(at + 26, entry.name.length, true);
    out.set(entry.name, at + LOCAL_HEADER_SIZE);
    out.set(entry.data, at + LOCAL_HEADER_SIZE + entry.name.length);
    at += LOCAL_HEADER_SIZE + entry.name.length + entry.data.length;
  }

  const centralStart = at;
  prepared.forEach((entry, index) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 10, true); // version needed
    view.setUint32(at + 20, entry.data.length, true); // compressed size
    view.setUint32(at + 24, entry.data.length, true); // uncompressed size
    view.setUint16(at + 28, entry.centralName.length, true);
    view.setUint32(at + 42, localOffsets[index], true);
    out.set(entry.centralName, at + CENTRAL_HEADER_SIZE);
    at += CENTRAL_HEADER_SIZE + entry.centralName.length;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, declaredCount & 0xffff, true);
  view.setUint16(at + 10, declaredCount & 0xffff, true);
  view.setUint32(at + 12, centralSize, true);
  view.setUint32(at + 16, centralStart, true);
  return out;
}
