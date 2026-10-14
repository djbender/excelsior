import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_ENTRY_SIZE,
  rawCfb,
  type RawCfb,
} from '../../test-support/raw-cfb.js';
import { LimitExceededError } from '../errors.js';
import { readCompoundFile } from './compound-file.js';

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(join(__dirname, '../../test-support/fixtures', name)),
  );

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

const pattern = (length: number) =>
  Uint8Array.from({ length }, (_, i) => (i * 7) % 251);

const patch = (file: RawCfb, edit: (view: DataView) => void): Uint8Array => {
  const bytes = new Uint8Array(file.bytes);
  edit(new DataView(bytes.buffer));
  return bytes;
};

describe('readCompoundFile: real Excel files', () => {
  it('finds the Workbook stream in clean.xls', () => {
    expect(readCompoundFile(fixture('clean.xls')).has('/Workbook')).toBe(true);
  });

  it('matches stream names case-insensitively', () => {
    expect(readCompoundFile(fixture('clean.xls')).has('/workbook')).toBe(true);
  });

  it('reads the Workbook stream, which starts with a BIFF BOF record', () => {
    const workbook = readCompoundFile(fixture('clean.xls')).read('/Workbook');
    expect([...(workbook?.subarray(0, 2) ?? [])]).toEqual([0x09, 0x08]);
  });

  it('finds the VBA project storage in xls-vba.xls', () => {
    expect(
      readCompoundFile(fixture('xls-vba.xls')).has('/_VBA_PROJECT_CUR/VBA/dir'),
    ).toBe(true);
  });

  it('reports the VBA project as a storage', () => {
    const entries = readCompoundFile(fixture('xls-vba.xls')).entries;
    expect(
      entries.find((entry) => entry.path === '/_VBA_PROJECT_CUR')?.kind,
    ).toBe('storage');
  });

  it('does not find a VBA project in clean.xls', () => {
    expect(
      readCompoundFile(fixture('clean.xls')).has('/_VBA_PROJECT_CUR'),
    ).toBe(false);
  });

  it('finds EncryptionInfo in an encrypted .xlsx', () => {
    expect(
      readCompoundFile(fixture('encrypted.xlsx')).has('/EncryptionInfo'),
    ).toBe(true);
  });

  it('finds EncryptedPackage in an encrypted .xlsx', () => {
    expect(
      readCompoundFile(fixture('encrypted.xlsx')).has('/EncryptedPackage'),
    ).toBe(true);
  });

  it('returns undefined when reading a stream that does not exist', () => {
    expect(
      readCompoundFile(fixture('clean.xls')).read('/NoSuchStream'),
    ).toBeUndefined();
  });
});

describe('readCompoundFile: hand-built files', () => {
  it('reads a small stream from the mini stream', () => {
    const file = rawCfb([{ path: 'Hello', data: 'hi there' }]);
    expect(text(readCompoundFile(file.bytes).read('/Hello'))).toBe('hi there');
  });

  it('reads a stream larger than the mini stream cutoff from regular sectors', () => {
    const data = pattern(5000);
    const file = rawCfb([{ path: 'Big', data }]);
    expect(readCompoundFile(file.bytes).read('/Big')).toEqual(data);
  });

  it('reads a stream nested inside storages', () => {
    const file = rawCfb([{ path: 'A/B/C', data: 'deep' }]);
    expect(text(readCompoundFile(file.bytes).read('/A/B/C'))).toBe('deep');
  });

  it('creates the parent storages of a nested path', () => {
    const file = rawCfb([{ path: 'A/B/C', data: 'deep' }]);
    expect(
      readCompoundFile(file.bytes)
        .entries.filter((entry) => entry.kind === 'storage')
        .map((entry) => entry.path),
    ).toEqual(['/A', '/A/B']);
  });

  it('finds every sibling in a storage', () => {
    const file = rawCfb(
      ['one', 'two', 'three', 'four', 'five'].map((path) => ({ path })),
    );
    expect(
      readCompoundFile(file.bytes)
        .entries.map((entry) => entry.path)
        .sort(),
    ).toEqual(['/five', '/four', '/one', '/three', '/two']);
  });
});

describe('readCompoundFile: damaged and hostile files', () => {
  it('rejects bytes that are not a compound file', () => {
    expect(() => readCompoundFile(new Uint8Array(1024))).toThrow(/signature/i);
  });

  it('rejects a file shorter than the header', () => {
    const file = rawCfb([{ path: 'A', data: 'x' }]);
    expect(() => readCompoundFile(file.bytes.slice(0, 400))).toThrow(
      /too short/i,
    );
  });

  it('rejects a file with an unsupported sector size', () => {
    const file = rawCfb([{ path: 'A', data: 'x' }]);
    const bytes = patch(file, (view) => view.setUint16(30, 7, true));
    expect(() => readCompoundFile(bytes)).toThrow(/sector size/i);
  });

  it('rejects a file cut off before its directory', () => {
    const file = rawCfb([{ path: 'A', data: 'x' }]);
    expect(() => readCompoundFile(file.bytes.slice(0, 512 + 512))).toThrow(
      /sector/i,
    );
  });

  it('rejects a sector chain that loops back on itself', () => {
    const file = rawCfb([{ path: 'Big', data: pattern(5000) }]);
    // Sectors: 0 = FAT, 1 = directory, 2.. = Big. Point sector 3 back at sector 2.
    const bytes = patch(file, (view) =>
      view.setUint32(file.fatOffset + 3 * 4, 2, true),
    );
    expect(() => readCompoundFile(bytes).read('/Big')).toThrow(/loop/i);
  });

  it('rejects a mini stream chain that loops back on itself', () => {
    const file = rawCfb([{ path: 'Small', data: pattern(200) }]);
    // Sectors: 0 = FAT, 1 = directory, 2 = mini FAT. Point mini sector 1 at 0.
    const bytes = patch(file, (view) => view.setUint32(3 * 512 + 4, 0, true));
    expect(() => readCompoundFile(bytes).read('/Small')).toThrow(/loop/i);
  });

  it('rejects a directory tree that points back at an earlier entry', () => {
    const file = rawCfb([{ path: 'A' }, { path: 'B' }]);
    // Entries: 0 = root, 1 = A, 2 = B. Make B's right sibling point at A.
    const bytes = patch(file, (view) =>
      view.setUint32(
        file.directoryOffset + 2 * DIRECTORY_ENTRY_SIZE + 72,
        1,
        true,
      ),
    );
    expect(() => readCompoundFile(bytes)).toThrow(/cycle/i);
  });

  it('rejects a stream that claims to be larger than the file', () => {
    const file = rawCfb([{ path: 'A', data: 'x' }]);
    const bytes = patch(file, (view) =>
      view.setUint32(
        file.directoryOffset + DIRECTORY_ENTRY_SIZE + 120,
        0x7fffffff,
        true,
      ),
    );
    expect(() => readCompoundFile(bytes).read('/A')).toThrow(/size/i);
  });

  it('rejects a directory with more entries than the limit', () => {
    const file = rawCfb(['a', 'b', 'c', 'd'].map((path) => ({ path })));
    expect(() => readCompoundFile(file.bytes, { maxEntries: 3 })).toThrow(
      LimitExceededError,
    );
  });
});
