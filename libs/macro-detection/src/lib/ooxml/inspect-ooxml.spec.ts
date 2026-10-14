import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildOoxml,
  contentTypes,
  MACRO_SHEET,
  MAIN_XLSM,
  MAIN_XLSX,
  VBA_PROJECT,
  WORKSHEET,
} from '../../test-support/ooxml.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import type { InspectionResult } from '../types.js';

const xmlDefaults = { xml: 'application/xml', rels: 'application/vnd.openxmlformats-package.relationships+xml' };

const cleanParts = (main: string) => ({
  '[Content_Types].xml': contentTypes({
    defaults: xmlDefaults,
    overrides: { '/xl/workbook.xml': main, '/xl/worksheets/sheet1.xml': WORKSHEET },
  }),
  'xl/workbook.xml': '<workbook/>',
  'xl/worksheets/sheet1.xml': '<worksheet/>',
});

describe('inspectSpreadsheet: OOXML', () => {
  const scenarios: [string, () => Promise<Uint8Array>, string[], string[]][] = [
    ['a clean .xlsx', () => buildOoxml(cleanParts(MAIN_XLSX)), [], []],
    ['a clean .xlsm (macroEnabled main type, no VBA)', () => buildOoxml(cleanParts(MAIN_XLSM)), [], []],
    [
      'a vbaProject.bin declared through a Default extension',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({ defaults: { ...xmlDefaults, bin: VBA_PROJECT } }),
          'xl/vbaProject.bin': 'binary',
        }),
      ['VBA_PROJECT'],
      ['xl/vbaProject.bin'],
    ],
    [
      'a VBA project renamed and declared through an Override',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, dat: 'application/octet-stream' },
            overrides: { '/xl/innocent.dat': VBA_PROJECT },
          }),
          'xl/innocent.dat': 'binary',
        }),
      ['VBA_PROJECT'],
      ['xl/innocent.dat'],
    ],
    [
      'an undeclared vbaproject.bin (name match, mixed case)',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({ defaults: xmlDefaults }),
          'XL/VbaProject.BIN': 'binary',
        }),
      ['VBA_PROJECT'],
      ['XL/VbaProject.BIN'],
    ],
    [
      'an XLM macro sheet at an unusual path',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: xmlDefaults,
            overrides: { '/xl/worksheets/sheet1.xml': MACRO_SHEET },
          }),
          'xl/worksheets/sheet1.xml': '<macrosheet/>',
        }),
      ['XLM_MACRO_SHEET'],
      ['xl/worksheets/sheet1.xml'],
    ],
    [
      'both a VBA project and an XLM macro sheet',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, bin: VBA_PROJECT },
            overrides: { '/xl/macrosheets/sheet1.xml': MACRO_SHEET },
          }),
          'xl/vbaProject.bin': 'binary',
          'xl/macrosheets/sheet1.xml': '<macrosheet/>',
        }),
      ['VBA_PROJECT', 'XLM_MACRO_SHEET'],
      ['xl/vbaProject.bin', 'xl/macrosheets/sheet1.xml'],
    ],
    [
      'a folder named macrosheets whose parts are plain worksheets',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: xmlDefaults,
            overrides: { '/xl/macrosheets/sheet1.xml': WORKSHEET },
          }),
          'xl/macrosheets/sheet1.xml': '<worksheet/>',
        }),
      [],
      [],
    ],
  ];

  describe.each(scenarios)('%s', (_name, build, codes, parts) => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(await build());
    });

    it(`has verdict ${codes.length > 0 ? 'rejected' : 'accepted'}`, () => {
      expect(result.verdict).toBe(codes.length > 0 ? 'rejected' : 'accepted');
    });

    it('reports every expected reason code', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(codes);
    });

    it('names each offending part in the detail', () => {
      expect(result.reasons.map((r) => parts.some((part) => r.detail.includes(part)))).toEqual(
        codes.map(() => true),
      );
    });
  });

  describe('without a [Content_Types].xml manifest', () => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(await buildOoxml({ 'readme.txt': 'not office' }));
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only UNPARSEABLE', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['UNPARSEABLE']);
    });
  });
});
