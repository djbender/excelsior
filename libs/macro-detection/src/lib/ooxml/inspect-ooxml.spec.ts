import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildOoxml,
  contentTypes,
  MACRO_SHEET,
  MAIN_XLSB,
  MAIN_XLSM,
  MAIN_XLSX,
  VBA_PROJECT,
  WORD_MAIN,
  WORKBOOK_PART,
  WORKSHEET,
} from '../../test-support/ooxml.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import type { InspectionResult } from '../types.js';

const xmlDefaults = {
  xml: 'application/xml',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
};

const cleanParts = (main: string) => ({
  '[Content_Types].xml': contentTypes({
    defaults: xmlDefaults,
    overrides: {
      '/xl/workbook.xml': main,
      '/xl/worksheets/sheet1.xml': WORKSHEET,
    },
  }),
  'xl/workbook.xml': '<workbook/>',
  'xl/worksheets/sheet1.xml': '<worksheet/>',
});

describe('inspectSpreadsheet: OOXML', () => {
  const scenarios: [string, () => Promise<Uint8Array>, string[], string[]][] = [
    ['a clean .xlsx', () => buildOoxml(cleanParts(MAIN_XLSX)), [], []],
    [
      'a clean .xlsm (macroEnabled main type, no VBA)',
      () => buildOoxml(cleanParts(MAIN_XLSM)),
      [],
      [],
    ],
    [
      'a vbaProject.bin declared through a Default extension',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, bin: VBA_PROJECT },
          }),
          ...WORKBOOK_PART,
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
          ...WORKBOOK_PART,
          'xl/innocent.dat': 'binary',
        }),
      ['VBA_PROJECT'],
      ['xl/innocent.dat'],
    ],
    [
      'a VBA content type hidden behind character references',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, dat: 'application/octet-stream' },
            overrides: {
              '/xl/innocent.dat': 'application/vnd.ms-office.&#118;baProject',
            },
          }),
          ...WORKBOOK_PART,
          'xl/innocent.dat': 'binary',
        }),
      ['UNPARSEABLE'],
      ['[Content_Types].xml'],
    ],
    [
      'a VBA Override whose PartName is percent-encoded',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, dat: 'application/octet-stream' },
            overrides: { '/xl/%69nnocent.dat': VBA_PROJECT },
          }),
          ...WORKBOOK_PART,
          'xl/innocent.dat': 'binary',
        }),
      ['UNPARSEABLE'],
      ['[Content_Types].xml'],
    ],
    [
      'a VBA Override in a namespace-prefixed element',
      () =>
        buildOoxml({
          '[Content_Types].xml':
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types">' +
            `<Override PartName="/xl/workbook.xml" ContentType="${MAIN_XLSX}"/>` +
            `<ct:Override PartName="/xl/innocent.dat" ContentType="${VBA_PROJECT}"/>` +
            '</Types>',
          ...WORKBOOK_PART,
          'xl/innocent.dat': 'binary',
        }),
      ['UNPARSEABLE'],
      ['[Content_Types].xml'],
    ],
    [
      'an undeclared vbaproject.bin (name match, mixed case)',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({ defaults: xmlDefaults }),
          ...WORKBOOK_PART,
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
          ...WORKBOOK_PART,
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
          ...WORKBOOK_PART,
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
          ...WORKBOOK_PART,
          'xl/macrosheets/sheet1.xml': '<worksheet/>',
        }),
      [],
      [],
    ],
    [
      'a Word document (no spreadsheet main part)',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: xmlDefaults,
            overrides: { '/word/document.xml': WORD_MAIN },
            workbookMain: null,
          }),
          'word/document.xml': '<document/>',
        }),
      ['NOT_A_SPREADSHEET'],
      ['workbook'],
    ],
    [
      'a Word macro document (VBA and no spreadsheet main part)',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, bin: VBA_PROJECT },
            overrides: { '/word/document.xml': WORD_MAIN },
            workbookMain: null,
          }),
          'word/document.xml': '<document/>',
          'word/vbaProject.bin': 'binary',
        }),
      ['VBA_PROJECT', 'NOT_A_SPREADSHEET'],
      ['word/vbaProject.bin', 'workbook'],
    ],
    [
      'a package whose /xl/workbook.xml is declared as a plain worksheet',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: xmlDefaults,
            overrides: { '/xl/workbook.xml': WORKSHEET },
          }),
          'xl/workbook.xml': '<worksheet/>',
        }),
      ['NOT_A_SPREADSHEET'],
      ['workbook'],
    ],
    [
      'an .xlsb-style workbook main type',
      () =>
        buildOoxml({
          '[Content_Types].xml': contentTypes({
            defaults: { ...xmlDefaults, bin: 'application/octet-stream' },
            overrides: { '/xl/workbook.bin': MAIN_XLSB },
          }),
          'xl/workbook.bin': 'binary',
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
      expect(
        result.reasons.map((r) =>
          parts.some((part) => r.detail.includes(part)),
        ),
      ).toEqual(codes.map(() => true));
    });
  });

  describe('without a [Content_Types].xml manifest', () => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(
        await buildOoxml({ 'readme.txt': 'not office' }),
      );
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only UNPARSEABLE', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['UNPARSEABLE']);
    });
  });
});
