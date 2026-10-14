import JSZip from 'jszip';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { contentTypes } from '../../test-support/ooxml.js';
import { rawZip, type RawZipEntry } from '../../test-support/raw-zip.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import { MAX_ZIP_ENTRIES } from '../limits.js';
import type { InspectionResult } from '../types.js';

// Every archive here is built in memory from a few hundred bytes up to a few hundred
// KiB. The hostile ones only carry lying headers; none holds a payload to inflate.

const workbookEntries = (): RawZipEntry[] => [
  {
    name: '[Content_Types].xml',
    data: contentTypes({ defaults: { xml: 'application/xml' } }),
  },
  { name: 'xl/workbook.xml', data: '<workbook/>' },
];

const fillerEntries = (count: number): RawZipEntry[] =>
  Array.from({ length: count }, (_, i) => ({ name: `f${i}.xml` }));

const codes = (result: InspectionResult) => result.reasons.map((r) => r.code);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a clean workbook with ZIP64 end records', () => {
  it('is accepted', async () => {
    const result = await inspectSpreadsheet(
      rawZip(workbookEntries(), { zip64: true }),
    );
    expect(result.verdict).toBe('accepted');
  });
});

describe('a ZIP64 archive with more entries than the limit', () => {
  const bytes = () =>
    rawZip([...workbookEntries(), ...fillerEntries(MAX_ZIP_ENTRIES + 1 - 2)], {
      zip64: true,
    });

  it('is rejected as LIMIT_EXCEEDED', async () => {
    expect(codes(await inspectSpreadsheet(bytes()))).toEqual([
      'LIMIT_EXCEEDED',
    ]);
  });

  it('is rejected before JSZip parses the archive', async () => {
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');
    await inspectSpreadsheet(bytes());
    expect(loadAsync).not.toHaveBeenCalled();
  });
});

describe.each([
  [
    'a central directory far larger than the file',
    { zip64Record: { size: 0x7fffffff } },
  ],
  [
    'a central directory offset beyond the end of the file',
    { zip64Record: { offset: 0x7fffffff, size: 100 } },
  ],
  ['a saturated end record with no ZIP64 locator', { omitZip64Locator: true }],
] as const)('a hostile ZIP64 header: %s', (_label, options) => {
  let result: InspectionResult;

  beforeAll(async () => {
    result = await inspectSpreadsheet(
      rawZip(workbookEntries(), { zip64: true, ...options }),
    );
  });

  it('is rejected', () => {
    expect(result.verdict).toBe('rejected');
  });

  it('is reported as UNPARSEABLE', () => {
    expect(codes(result)).toEqual(['UNPARSEABLE']);
  });
});

describe('a ZIP64 field above 2^32', () => {
  // The input limit is 25 MiB, so a real offset or size can never need the high word.
  let result: InspectionResult;

  beforeAll(async () => {
    const bytes = rawZip(workbookEntries(), { zip64: true });
    const record = bytes.length - 22 - 20 - 56; // end record, locator, ZIP64 record
    new DataView(bytes.buffer).setUint32(record + 48 + 4, 1, true); // offset, high half
    result = await inspectSpreadsheet(bytes);
  });

  it('is rejected as UNPARSEABLE', () => {
    expect(codes(result)).toEqual(['UNPARSEABLE']);
  });
});
