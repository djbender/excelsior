import { LimitExceededError } from '../errors.js';
import { MAX_OLE2_ENTRIES } from '../limits.js';

/**
 * A read-only reader for Compound File Binary (OLE2) files, per [MS-CFB].
 *
 * Written for untrusted input and for one job: listing the storages and streams of an
 * Office file and reading a stream's bytes. It never writes, never follows a chain
 * longer than the file has sectors, and fails with an Error on anything inconsistent.
 */
export interface CompoundFileEntry {
  /** Full path with a leading slash, e.g. "/_VBA_PROJECT_CUR/VBA/dir". */
  path: string;
  kind: 'storage' | 'stream';
  /** Declared size in bytes (0 for storages). */
  size: number;
}

export interface CompoundFile {
  /** Every storage and stream reachable from the root, excluding the root itself. */
  entries: CompoundFileEntry[];
  /** Case-insensitive, like the format's own name comparison. */
  has(path: string): boolean;
  /** The stream's bytes, or undefined when there is no such stream. */
  read(path: string): Uint8Array | undefined;
}

export interface ReadCompoundFileOptions {
  maxEntries?: number;
}

const HEADER_SIZE = 512;
const DIRECTORY_ENTRY_SIZE = 128;
const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const MAX_REGULAR_SECTOR = 0xfffffffa;
const FAT_SECTOR = 0xfffffffd;
const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
const NO_STREAM = 0xffffffff;

const TYPE_STORAGE = 1;
const TYPE_STREAM = 2;
const TYPE_ROOT = 5;

interface DirectoryEntry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

export function readCompoundFile(
  buf: Uint8Array,
  { maxEntries = MAX_OLE2_ENTRIES }: ReadCompoundFileOptions = {},
): CompoundFile {
  return new Reader(buf, maxEntries).open();
}

class Reader {
  private readonly view: DataView;
  private sectorSize = 0;
  private sectorCount = 0;
  private miniCutoff = 0;
  private fat: number[] = [];
  private miniFat: number[] = [];
  private directory: DirectoryEntry[] = [];
  private miniStream: Uint8Array | undefined;

  constructor(
    private readonly buf: Uint8Array,
    private readonly maxEntries: number,
  ) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  open(): CompoundFile {
    this.readHeader();
    const entries = this.listEntries();
    const byPath = new Map(
      entries.map((entry) => [entry.path.toLowerCase(), entry]),
    );
    const indexByPath = new Map(
      this.reachable.map((item) => [item.path.toLowerCase(), item.index]),
    );

    return {
      entries: entries.map((entry) => ({ ...entry })),
      has: (path) => byPath.has(path.toLowerCase()),
      read: (path) => {
        const key = path.toLowerCase();
        const index = indexByPath.get(key);
        if (index === undefined || byPath.get(key)?.kind !== 'stream') {
          return undefined;
        }
        return this.readStream(this.directory[index]);
      },
    };
  }

  // --- header, FAT, mini FAT ---------------------------------------------------

  private header(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  private readHeader(): void {
    if (this.buf.length < HEADER_SIZE) {
      throw new Error('Corrupted compound file: too short for a header');
    }
    if (!SIGNATURE.every((byte, i) => this.buf[i] === byte)) {
      throw new Error('Not a compound file: bad signature');
    }
    const majorVersion = this.view.getUint16(26, true);
    const sectorShift = this.view.getUint16(30, true);
    const miniShift = this.view.getUint16(32, true);
    const validSectorSize =
      (majorVersion === 3 && sectorShift === 9) ||
      (majorVersion === 4 && sectorShift === 12);
    if (this.view.getUint16(28, true) !== 0xfffe) {
      throw new Error('Corrupted compound file: unsupported byte order');
    }
    if (!validSectorSize || miniShift !== 6) {
      throw new Error('Corrupted compound file: unsupported sector size');
    }

    this.sectorSize = 1 << sectorShift;
    // A last sector without its trailing padding still counts: real files lack it.
    // Reads check that the bytes they need are actually there.
    this.sectorCount = Math.ceil(this.buf.length / this.sectorSize) - 1;
    this.miniCutoff = this.header(56);

    this.fat = this.readFat();
    this.miniFat = this.readMiniFat();
    this.directory = this.readDirectory();
  }

  private sector(id: number): Uint8Array {
    if (id > MAX_REGULAR_SECTOR || id >= this.sectorCount) {
      throw new Error(`Corrupted compound file: sector ${id} is out of range`);
    }
    const start = (id + 1) * this.sectorSize;
    return this.buf.subarray(start, start + this.sectorSize);
  }

  private u32s(bytes: Uint8Array): number[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const values: number[] = [];
    for (let at = 0; at + 4 <= bytes.length; at += 4) {
      values.push(view.getUint32(at, true));
    }
    return values;
  }

  private readFat(): number[] {
    // The first 109 FAT sector numbers live in the header, the rest in DIFAT sectors.
    // The header's FAT sector count is only trusted as far as the entries go: some
    // writers over-declare it (pyExcelerator's test file claims 109 in a 9-sector
    // file), so every real entry is read and the first free entry ends the list.
    const fatSectors: number[] = [];
    for (let i = 0; i < 109; i++) {
      const id = this.header(76 + i * 4);
      if (id === FREE_SECTOR) break;
      fatSectors.push(id);
    }

    let difatSector = this.header(68);
    for (
      let left = this.header(72), steps = 0;
      left > 0 && difatSector <= MAX_REGULAR_SECTOR;
      left--
    ) {
      if (++steps > this.sectorCount) {
        throw new Error('Corrupted compound file: DIFAT chain loops');
      }
      const entries = this.u32s(this.sector(difatSector));
      for (const id of entries.slice(0, -1)) {
        if (id !== FREE_SECTOR) fatSectors.push(id);
      }
      difatSector = entries[entries.length - 1];
    }

    if (fatSectors.length === 0 || fatSectors.length > this.sectorCount) {
      throw new Error('Corrupted compound file: bad FAT sector list');
    }

    const fat: number[] = [];
    for (const id of fatSectors) fat.push(...this.u32s(this.sector(id)));
    return fat;
  }

  private chain(start: number, table: number[], limit: number): number[] {
    const ids: number[] = [];
    let id = start;
    while (id !== END_OF_CHAIN) {
      if (id > MAX_REGULAR_SECTOR || id >= table.length) {
        throw new Error('Corrupted compound file: broken sector chain');
      }
      if (ids.length >= limit) {
        throw new Error('Corrupted compound file: sector chain loops');
      }
      ids.push(id);
      id = table[id];
      if (id === FREE_SECTOR || id === FAT_SECTOR) {
        throw new Error('Corrupted compound file: broken sector chain');
      }
    }
    return ids;
  }

  private readMiniFat(): number[] {
    const start = this.header(60);
    if (start === END_OF_CHAIN || this.header(64) === 0) return [];
    const ids = this.chain(start, this.fat, this.sectorCount);
    return ids.flatMap((id) => this.u32s(this.sector(id)));
  }

  // --- directory ---------------------------------------------------------------

  private readDirectory(): DirectoryEntry[] {
    const ids = this.chain(this.header(48), this.fat, this.sectorCount);
    const perSector = this.sectorSize / DIRECTORY_ENTRY_SIZE;
    if (ids.length * perSector > this.maxEntries) {
      throw new LimitExceededError(
        `Compound file has more than ${this.maxEntries} directory entries`,
      );
    }

    const entries: DirectoryEntry[] = [];
    for (const id of ids) {
      const sector = this.sector(id);
      const view = new DataView(
        sector.buffer,
        sector.byteOffset,
        sector.length,
      );
      for (
        let at = 0;
        at + DIRECTORY_ENTRY_SIZE <= sector.length;
        at += DIRECTORY_ENTRY_SIZE
      ) {
        const nameBytes = Math.min(view.getUint16(at + 64, true), 64);
        const name = new TextDecoder('utf-16le').decode(
          sector.subarray(at, at + Math.max(nameBytes - 2, 0)),
        );
        entries.push({
          name,
          type: view.getUint8(at + 66),
          left: view.getUint32(at + 68, true),
          right: view.getUint32(at + 72, true),
          child: view.getUint32(at + 76, true),
          start: view.getUint32(at + 116, true),
          // Version 3 files may leave garbage in the high half; sizes there are 32-bit.
          size:
            view.getUint32(at + 120, true) +
            (this.sectorSize === 4096
              ? view.getUint32(at + 124, true) * 2 ** 32
              : 0),
        });
      }
    }
    if (entries.length === 0 || entries[0].type !== TYPE_ROOT) {
      throw new Error('Corrupted compound file: missing root entry');
    }
    return entries;
  }

  /** Entries reachable from the root, with their paths and directory indexes. */
  private reachable: { path: string; index: number }[] = [];

  private listEntries(): CompoundFileEntry[] {
    const visited = new Set<number>([0]);
    const stack: { index: number; parent: string }[] = [];
    const push = (index: number, parent: string) => {
      if (index !== NO_STREAM) stack.push({ index, parent });
    };
    push(this.directory[0].child, '');

    const entries: CompoundFileEntry[] = [];
    while (stack.length > 0) {
      const { index, parent } = stack.pop() as {
        index: number;
        parent: string;
      };
      if (index >= this.directory.length) {
        throw new Error(
          'Corrupted compound file: directory index out of range',
        );
      }
      if (visited.has(index)) {
        throw new Error('Corrupted compound file: directory tree has a cycle');
      }
      visited.add(index);

      const entry = this.directory[index];
      const path = `${parent}/${entry.name}`;
      if (entry.type === TYPE_STORAGE || entry.type === TYPE_STREAM) {
        entries.push({
          path,
          kind: entry.type === TYPE_STORAGE ? 'storage' : 'stream',
          size: entry.type === TYPE_STORAGE ? 0 : entry.size,
        });
        this.reachable.push({ path, index });
      }
      // Siblings share this entry's parent; a storage's children get its path.
      push(entry.right, parent);
      push(entry.left, parent);
      if (entry.type === TYPE_STORAGE) push(entry.child, path);
    }
    return entries;
  }

  // --- streams -----------------------------------------------------------------

  private readStream(entry: DirectoryEntry): Uint8Array {
    if (entry.size > this.buf.length) {
      throw new Error(
        'Corrupted compound file: stream size is larger than the file',
      );
    }
    if (entry.size === 0) return new Uint8Array();
    return entry.size < this.miniCutoff
      ? this.readMini(entry)
      : this.readRegular(entry);
  }

  private readRegular(entry: DirectoryEntry): Uint8Array {
    const ids = this.chain(entry.start, this.fat, this.sectorCount);
    if (ids.length * this.sectorSize < entry.size) {
      throw new Error('Corrupted compound file: stream chain is too short');
    }
    const out = new Uint8Array(entry.size);
    ids.forEach((id, i) => {
      const wanted = Math.min(
        this.sectorSize,
        entry.size - i * this.sectorSize,
      );
      if (wanted <= 0) return;
      // The file's last sector may lack its padding, but not bytes the stream needs.
      const sector = this.sector(id);
      if (sector.length < wanted) {
        throw new Error('Corrupted compound file: stream data is truncated');
      }
      out.set(sector.subarray(0, wanted), i * this.sectorSize);
    });
    return out;
  }

  private readMini(entry: DirectoryEntry): Uint8Array {
    const container = (this.miniStream ??= this.readRegular(this.directory[0]));
    const ids = this.chain(entry.start, this.miniFat, this.miniFat.length);
    if (ids.length * 64 < entry.size) {
      throw new Error(
        'Corrupted compound file: mini stream chain is too short',
      );
    }
    const out = new Uint8Array(entry.size);
    ids.forEach((id, i) => {
      const from = id * 64;
      if (from + 64 > container.length) {
        throw new Error('Corrupted compound file: mini sector is out of range');
      }
      const part = container
        .subarray(from, from + 64)
        .subarray(0, entry.size - i * 64);
      if (part.length > 0) out.set(part, i * 64);
    });
    return out;
  }
}
