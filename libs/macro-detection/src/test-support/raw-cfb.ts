/**
 * Builds Compound File Binary (OLE2) bytes by hand, so tests can write structures that
 * no Office program would: sector chains that loop, directory trees with cycles, streams
 * that claim to be bigger than the file. It writes version 3 files (512-byte sectors,
 * 64-byte mini sectors, 4096-byte mini stream cutoff) with a single FAT sector, which
 * caps a file at 128 sectors (64 KiB). Everything stays in memory.
 */
export interface RawCfbEntry {
  /** Slash-separated path below the root, e.g. "_VBA_PROJECT_CUR/VBA/dir". */
  path: string;
  /** Defaults to a stream. Parent storages of a path are created automatically. */
  kind?: 'storage' | 'stream';
  data?: string | Uint8Array;
}

export interface RawCfb {
  bytes: Uint8Array;
  /** Byte offset of the first directory sector, where entry 0 is the root. */
  directoryOffset: number;
  /** Byte offset of the (only) FAT sector. */
  fatOffset: number;
}

export const SECTOR_SIZE = 512;
export const DIRECTORY_ENTRY_SIZE = 128;
const MINI_SECTOR_SIZE = 64;
const MINI_STREAM_CUTOFF = 4096;
const FAT_ENTRIES = SECTOR_SIZE / 4;
const END_OF_CHAIN = 0xfffffffe;
const FAT_SECTOR = 0xfffffffd;
const FREE_SECTOR = 0xffffffff;
const NO_STREAM = 0xffffffff;
const encoder = new TextEncoder();

interface Node {
  name: string;
  kind: 'root' | 'storage' | 'stream';
  data: Uint8Array;
  children: Node[];
  start: number;
  left: number;
  right: number;
  child: number;
}

const toBytes = (data: string | Uint8Array | undefined): Uint8Array =>
  typeof data === 'string' ? encoder.encode(data) : (data ?? new Uint8Array());

const sectorsFor = (length: number, size: number): number =>
  Math.ceil(length / size);

/** Builds the directory tree: root, then every storage and stream, in entry order. */
function buildTree(entries: RawCfbEntry[]): Node[] {
  const root: Node = node('Root Entry', 'root');
  const all: Node[] = [root];
  const byPath = new Map<string, Node>([['', root]]);

  const ensure = (
    path: string,
    kind: 'storage' | 'stream',
    data?: Uint8Array,
  ) => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    const parent = ensure(path.slice(0, slash === -1 ? 0 : slash), 'storage');
    const created = node(path.slice(slash + 1), kind, data);
    parent.children.push(created);
    byPath.set(path, created);
    all.push(created);
    return created;
  };

  for (const entry of entries) {
    ensure(entry.path, entry.kind ?? 'stream', toBytes(entry.data));
  }
  return all;
}

function node(
  name: string,
  kind: Node['kind'],
  data: Uint8Array = new Uint8Array(),
): Node {
  return {
    name,
    kind,
    data,
    children: [],
    start: END_OF_CHAIN,
    left: NO_STREAM,
    right: NO_STREAM,
    child: NO_STREAM,
  };
}

export function rawCfb(entries: RawCfbEntry[]): RawCfb {
  const nodes = buildTree(entries);
  for (const n of nodes) {
    // A storage's children hang off one chain of right siblings.
    n.children.forEach((child, i) => {
      if (i === 0) n.child = nodes.indexOf(child);
      if (i > 0) n.children[i - 1].right = nodes.indexOf(child);
    });
  }

  const streams = nodes.filter((n) => n.kind === 'stream' && n.data.length > 0);
  const mini = streams.filter((n) => n.data.length < MINI_STREAM_CUTOFF);
  const regular = streams.filter((n) => n.data.length >= MINI_STREAM_CUTOFF);

  // Pack small streams into one mini stream, 64 bytes at a time.
  const miniFat: number[] = [];
  const miniParts: Uint8Array[] = [];
  for (const n of mini) {
    const count = sectorsFor(n.data.length, MINI_SECTOR_SIZE);
    n.start = miniFat.length;
    for (let i = 0; i < count; i++) {
      miniFat.push(i === count - 1 ? END_OF_CHAIN : miniFat.length + 1);
    }
    const padded = new Uint8Array(count * MINI_SECTOR_SIZE);
    padded.set(n.data);
    miniParts.push(padded);
  }
  const miniStream = concat(miniParts);

  // Sector plan: FAT, directory, mini FAT, mini stream, then regular streams.
  const directorySectors = sectorsFor(
    nodes.length * DIRECTORY_ENTRY_SIZE,
    SECTOR_SIZE,
  );
  const miniFatSectors = sectorsFor(miniFat.length * 4, SECTOR_SIZE);
  const miniStreamSectors = sectorsFor(miniStream.length, SECTOR_SIZE);

  const fat: number[] = [FAT_SECTOR];
  const chain = (count: number): number => {
    if (count === 0) return END_OF_CHAIN;
    const first = fat.length;
    for (let i = 0; i < count; i++) {
      fat.push(i === count - 1 ? END_OF_CHAIN : fat.length + 1);
    }
    return first;
  };
  const directoryStart = chain(directorySectors);
  const miniFatStart = chain(miniFatSectors);
  const miniStreamStart = chain(miniStreamSectors);
  for (const n of regular)
    n.start = chain(sectorsFor(n.data.length, SECTOR_SIZE));
  if (fat.length > FAT_ENTRIES)
    throw new Error('rawCfb supports one FAT sector only');

  const root = nodes[0];
  root.start = miniStreamStart;
  root.data = new Uint8Array(miniStream.length);

  const out = new Uint8Array((1 + fat.length) * SECTOR_SIZE);
  const view = new DataView(out.buffer);
  const sectorAt = (id: number) => (id + 1) * SECTOR_SIZE;

  // Header.
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  view.setUint16(24, 0x003e, true); // minor version
  view.setUint16(26, 3, true); // major version
  view.setUint16(28, 0xfffe, true); // byte order
  view.setUint16(30, 9, true); // sector shift: 512
  view.setUint16(32, 6, true); // mini sector shift: 64
  view.setUint32(44, 1, true); // FAT sectors
  view.setUint32(48, directoryStart, true);
  view.setUint32(56, MINI_STREAM_CUTOFF, true);
  view.setUint32(60, miniFatSectors === 0 ? END_OF_CHAIN : miniFatStart, true);
  view.setUint32(64, miniFatSectors, true);
  view.setUint32(68, END_OF_CHAIN, true); // first DIFAT sector: none
  view.setUint32(72, 0, true);
  for (let i = 0; i < 109; i++)
    view.setUint32(76 + i * 4, i === 0 ? 0 : FREE_SECTOR, true);

  // FAT (sector 0), unused entries free.
  for (let i = 0; i < FAT_ENTRIES; i++) {
    view.setUint32(
      sectorAt(0) + i * 4,
      i < fat.length ? fat[i] : FREE_SECTOR,
      true,
    );
  }

  // Directory entries.
  nodes.forEach((n, index) => {
    const at = sectorAt(directoryStart) + index * DIRECTORY_ENTRY_SIZE;
    for (let i = 0; i < n.name.length; i++) {
      view.setUint16(at + i * 2, n.name.charCodeAt(i), true);
    }
    view.setUint16(at + 64, (n.name.length + 1) * 2, true);
    view.setUint8(
      at + 66,
      n.kind === 'root' ? 5 : n.kind === 'storage' ? 1 : 2,
    );
    view.setUint8(at + 67, 1); // colour: black
    view.setUint32(at + 68, n.left, true);
    view.setUint32(at + 72, n.right, true);
    view.setUint32(at + 76, n.child, true);
    view.setUint32(at + 116, n.start, true);
    view.setUint32(at + 120, n.kind === 'storage' ? 0 : n.data.length, true);
  });

  // Mini FAT, mini stream, regular streams.
  miniFat.forEach((value, i) =>
    view.setUint32(sectorAt(miniFatStart) + i * 4, value, true),
  );
  if (miniStream.length > 0) out.set(miniStream, sectorAt(miniStreamStart));
  for (const n of regular) out.set(n.data, sectorAt(n.start));

  return {
    bytes: out,
    directoryOffset: sectorAt(directoryStart),
    fatOffset: sectorAt(0),
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
