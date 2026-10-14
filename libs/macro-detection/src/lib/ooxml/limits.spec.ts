import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildOoxml,
  contentTypes,
  MAIN_XLSX,
} from '../../test-support/ooxml.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import { MAX_CONTENT_TYPES_BYTES, MAX_ZIP_ENTRIES } from '../limits.js';
import type { InspectionResult } from '../types.js';

const manyEntries = (count: number) => {
  // Manifest + workbook part + filler parts add up to exactly `count` entries.
  // The workbook sits at the root: a folder would add an implicit directory entry.
  const parts: Record<string, string> = {
    '[Content_Types].xml': contentTypes({
      defaults: { xml: 'application/xml' },
      overrides: { '/workbook.xml': MAIN_XLSX },
      workbookMain: null,
    }),
    'workbook.xml': '<workbook/>',
  };
  for (let i = 0; i < count - 2; i++) parts[`p${i}.xml`] = '';
  return buildOoxml(parts, { compression: 'STORE' });
};

describe('inspectSpreadsheet: OOXML limits', () => {
  describe(`a ZIP with ${MAX_ZIP_ENTRIES + 1} entries`, () => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(await manyEntries(MAX_ZIP_ENTRIES + 1));
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only LIMIT_EXCEEDED', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['LIMIT_EXCEEDED']);
    });
  });

  describe(`a ZIP with exactly ${MAX_ZIP_ENTRIES} entries`, () => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(await manyEntries(MAX_ZIP_ENTRIES));
    });

    it('is accepted', () => {
      expect(result.verdict).toBe('accepted');
    });
  });

  describe('a [Content_Types].xml that inflates past the cap', () => {
    let result: InspectionResult;

    beforeAll(async () => {
      const padding = ' '.repeat(MAX_CONTENT_TYPES_BYTES + 1);
      result = await inspectSpreadsheet(
        await buildOoxml({ '[Content_Types].xml': contentTypes() + padding }),
      );
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only LIMIT_EXCEEDED', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['LIMIT_EXCEEDED']);
    });
  });
});
