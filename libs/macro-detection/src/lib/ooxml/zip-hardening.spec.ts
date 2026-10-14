import JSZip from 'jszip';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rawZip, type RawZipEntry } from '../../test-support/raw-zip.js';
import { contentTypes } from '../../test-support/ooxml.js';
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
