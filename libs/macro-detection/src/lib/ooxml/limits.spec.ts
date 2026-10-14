import { beforeAll, describe, expect, it } from 'vitest';
import { buildOoxml, contentTypes } from '../../test-support/ooxml.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import { MAX_CONTENT_TYPES_BYTES, MAX_ZIP_ENTRIES } from '../limits.js';
import type { InspectionResult } from '../types.js';

const manyEntries = (count: number) => {
  const parts: Record<string, string> = {
    '[Content_Types].xml': contentTypes({
      defaults: { xml: 'application/xml' },
    }),
  };
  for (let i = 0; i < count - 1; i++) parts[`p${i}.xml`] = '';
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
