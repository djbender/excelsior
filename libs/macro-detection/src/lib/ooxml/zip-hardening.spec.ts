import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rawZip, type RawZipEntry } from '../../test-support/raw-zip.js';
import { contentTypes, VBA_PROJECT } from '../../test-support/ooxml.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import { MAX_ZIP_ENTRIES } from '../limits.js';
import type { InspectionResult } from '../types.js';

// A minimal, valid workbook package: a manifest and a workbook main part.
const workbookEntries = (): RawZipEntry[] => [
  {
    name: '[Content_Types].xml',
    data: contentTypes({ defaults: { xml: 'application/xml' } }),
  },
  { name: 'xl/workbook.xml', data: '<workbook/>' },
];

const fillerEntries = (count: number): RawZipEntry[] =>
  Array.from({ length: count }, (_, i) => ({ name: `f${i}.xml` }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hand-built ZIPs (the builder itself)', () => {
  let result: InspectionResult;

  beforeAll(async () => {
    result = await inspectSpreadsheet(rawZip(workbookEntries()));
  });

  it('a clean workbook is accepted', () => {
    expect(result.verdict).toBe('accepted');
  });
});

describe('a central directory larger than the entry limit, declared as tiny', () => {
  // The end record says 2 entries; the central directory really holds MAX + 1.
  const bytes = () =>
    rawZip([...workbookEntries(), ...fillerEntries(MAX_ZIP_ENTRIES + 1 - 2)], {
      declaredCount: 2,
    });

  it('is rejected as LIMIT_EXCEEDED', async () => {
    const result = await inspectSpreadsheet(bytes());
    expect(result.reasons.map((r) => r.code)).toEqual(['LIMIT_EXCEEDED']);
  });

  it('is rejected before JSZip parses the archive', async () => {
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    await inspectSpreadsheet(bytes());
    expect(loadAsync).not.toHaveBeenCalled();
  });
});

describe('many central entries that share one local header', () => {
  // JSZip names entries from the local header, so these collapse to a single entry
  // there, yet the central directory lists MAX + 1 distinct names. The end record
  // declares only 2 entries, so the declared-count shortcut cannot catch it.
  const bytes = () =>
    rawZip(
      [
        ...workbookEntries(),
        ...Array.from({ length: MAX_ZIP_ENTRIES }, (_, i) => ({
          name: 'unused',
          centralName: `c${i}.xml`,
          reuseLocalOf: 0,
        })),
      ],
      { declaredCount: 2 },
    );

  it('is rejected as LIMIT_EXCEEDED', async () => {
    const result = await inspectSpreadsheet(bytes());
    expect(result.reasons.map((r) => r.code)).toEqual(['LIMIT_EXCEEDED']);
  });
});

// Excel reads entry names from the central directory; JSZip reads the local headers.
// A file whose two names disagree must not be judged from only one of them.
describe.each([
  [
    'the local header hides it',
    { name: 'xl/vbaProject.dat', centralName: 'xl/vbaProject.bin' },
  ],
  [
    'the central directory hides it',
    { name: 'xl/vbaProject.bin', centralName: 'xl/vbaProject.dat' },
  ],
] as const)(
  'a VBA project whose name differs between headers: %s',
  (_label, entry) => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(
        rawZip([
          {
            name: '[Content_Types].xml',
            data: contentTypes({
              defaults: { xml: 'application/xml', bin: VBA_PROJECT },
            }),
          },
          { name: 'xl/workbook.xml', data: '<workbook/>' },
          { ...entry, data: 'binary' },
        ]),
      );
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('still reports the VBA project, then that the names disagree', () => {
      expect(result.reasons.map((r) => r.code)).toEqual([
        'VBA_PROJECT',
        'UNPARSEABLE',
      ]);
    });
  },
);

describe('a clean workbook whose names agree in both headers', () => {
  it('is accepted', async () => {
    const result = await inspectSpreadsheet(
      rawZip([...workbookEntries(), { name: 'xl/worksheets/sheet1.xml' }]),
    );
    expect(result.verdict).toBe('accepted');
  });
});

// The same evasion on a real Excel file: rename only the local header's copy of the
// name (same length, so no offsets move). Before the names were compared, this file
// was accepted. Excel itself refuses to open it, but another reader might not.
describe('the real vba.xlsm with its local header name changed', () => {
  let result: InspectionResult;

  beforeAll(async () => {
    const original = new Uint8Array(
      readFileSync(join(__dirname, '../../test-support/fixtures/vba.xlsm')),
    );
    const patched = Buffer.from(original);
    // The first occurrence is the local file header; the central directory comes later.
    patched.write('xl/vbaProject.dat', patched.indexOf('xl/vbaProject.bin'));
    result = await inspectSpreadsheet(new Uint8Array(patched));
  });

  it('is rejected', () => {
    expect(result.verdict).toBe('rejected');
  });

  it('still reports the VBA project and the disagreement', () => {
    expect(result.reasons.map((r) => r.code)).toEqual([
      'VBA_PROJECT',
      'UNPARSEABLE',
    ]);
  });
});
