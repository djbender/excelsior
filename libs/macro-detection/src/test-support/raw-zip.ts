/**
 * Builds ZIP bytes by hand, so tests can write things JSZip never would: a central
 * directory that disagrees with the local headers, or an end record that lies about
 * how many entries follow. Entry bytes are written exactly as given (nothing is
 * compressed or inflated here) and CRCs are zero. Everything stays in memory and
 * every size is chosen by the caller, so no test needs a real zip bomb.
 */
export interface RawZipEntry {
  /** Name in the local file header. */
  name: string;
  /** Name in the central directory entry. Defaults to `name`. */
  centralName?: string;
  data?: string | Uint8Array;
  /** Compression method written to both headers: 0 = stored (default), 8 = deflate. */
  method?: number;
  /** Uncompressed size written to both headers. Defaults to the data length. */
  uncompressedSize?: number;
  /**
   * Point this central entry at the local header of an earlier entry (by index)
   * instead of writing a new one.
   */
  reuseLocalOf?: number;
}

export interface RawZipOptions {
  /** Entry count written to the end-of-central-directory record. Defaults to the real count. */
  declaredCount?: number;
  /**
   * Write ZIP64 end records and saturate the plain end record's fields, the way
   * archives with more than 65,535 entries do. The ZIP64 record carries the real
   * values unless overridden below.
   */
  zip64?: boolean;
  /** Overrides for the values in the ZIP64 end record, for hostile-header tests. */
  zip64Record?: { entries?: number; size?: number; offset?: number };
  /** Write the ZIP64 end record but leave out the locator that points to it. */
  omitZip64Locator?: boolean;
}

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const ZIP64_RECORD_SIZE = 56;
const ZIP64_LOCATOR_SIZE = 20;
const encoder = new TextEncoder();

export function rawZip(
  entries: RawZipEntry[],
  {
    declaredCount = entries.length,
    zip64 = false,
    zip64Record = {},
    omitZip64Locator = false,
  }: RawZipOptions = {},
): Uint8Array {
  const prepared = entries.map((entry) => {
    const data =
      typeof entry.data === 'string'
        ? encoder.encode(entry.data)
        : (entry.data ?? new Uint8Array());
    return {
      name: encoder.encode(entry.name),
      centralName: encoder.encode(entry.centralName ?? entry.name),
      data,
      method: entry.method ?? 0,
      uncompressedSize: entry.uncompressedSize ?? data.length,
      reuseLocalOf: entry.reuseLocalOf,
    };
  });

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

  const zip64Size = zip64
    ? ZIP64_RECORD_SIZE + (omitZip64Locator ? 0 : ZIP64_LOCATOR_SIZE)
    : 0;
  const out = new Uint8Array(
    localSize + centralSize + zip64Size + END_RECORD_SIZE,
  );
  const view = new DataView(out.buffer);

  let at = 0;
  for (const entry of prepared) {
    if (entry.reuseLocalOf !== undefined) continue;
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 10, true); // version needed
    view.setUint16(at + 8, entry.method, true);
    view.setUint32(at + 18, entry.data.length, true); // compressed size
    view.setUint32(at + 22, entry.uncompressedSize, true);
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
    view.setUint16(at + 10, entry.method, true);
    view.setUint32(at + 20, entry.data.length, true); // compressed size
    view.setUint32(at + 24, entry.uncompressedSize, true);
    view.setUint16(at + 28, entry.centralName.length, true);
    view.setUint32(at + 42, localOffsets[index], true);
    out.set(entry.centralName, at + CENTRAL_HEADER_SIZE);
    at += CENTRAL_HEADER_SIZE + entry.centralName.length;
  });

  if (zip64) {
    const recordAt = at;
    view.setUint32(at, 0x06064b50, true);
    view.setUint32(at + 4, ZIP64_RECORD_SIZE - 12, true); // record size, low half
    view.setUint16(at + 12, 45, true); // version made by
    view.setUint16(at + 14, 45, true); // version needed
    view.setUint32(at + 24, entries.length, true); // entries on this disk
    view.setUint32(at + 32, zip64Record.entries ?? entries.length, true);
    view.setUint32(at + 40, zip64Record.size ?? centralSize, true);
    view.setUint32(at + 48, zip64Record.offset ?? centralStart, true);
    at += ZIP64_RECORD_SIZE;
    if (!omitZip64Locator) {
      view.setUint32(at, 0x07064b50, true);
      view.setUint32(at + 8, recordAt, true); // offset of the ZIP64 end record
      view.setUint32(at + 16, 1, true); // total disks
      at += ZIP64_LOCATOR_SIZE;
    }
  }

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, zip64 ? 0xffff : declaredCount & 0xffff, true);
  view.setUint16(at + 10, zip64 ? 0xffff : declaredCount & 0xffff, true);
  view.setUint32(at + 12, zip64 ? 0xffffffff : centralSize, true);
  view.setUint32(at + 16, zip64 ? 0xffffffff : centralStart, true);
  return out;
}
