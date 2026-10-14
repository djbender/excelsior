import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { inspectSpreadsheet } from './inspect-spreadsheet.js';
import type { InspectionResult } from './types.js';

// Real Excel-produced binaries; provenance in src/test-support/fixtures/README.md.
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(join(__dirname, '../test-support/fixtures', name)),
  );

describe.each([
  ['clean.xls', 'accepted', []],
  ['clean.xlsx', 'accepted', []],
  ['clean.xlsm', 'accepted', []],
  ['clean.xlsb', 'accepted', []],
  ['vba.xlsm', 'rejected', ['VBA_PROJECT']],
  ['vba.xlsb', 'rejected', ['VBA_PROJECT']],
  ['vba.xlam', 'rejected', ['VBA_PROJECT']],
  ['vba.xltm', 'rejected', ['VBA_PROJECT']],
  ['xls-vba.xls', 'rejected', ['VBA_PROJECT']],
  ['xls-xlm.xls', 'rejected', ['XLM_MACRO_SHEET']],
  ['xlsm-xlm.xlsm', 'rejected', ['XLM_MACRO_SHEET']],
  ['xlsb-xlm.xlsb', 'rejected', ['XLM_MACRO_SHEET']],
  ['xls-vba-xlm.xls', 'rejected', ['VBA_PROJECT', 'XLM_MACRO_SHEET']],
  ['not-a-spreadsheet.pdf', 'rejected', ['NOT_A_SPREADSHEET']],
  ['not-a-spreadsheet.docx', 'rejected', ['NOT_A_SPREADSHEET']],
  // ODF packages have no [Content_Types].xml, so they cannot be verified. A valid
  // .ods is rejected too: this tool only verifies OOXML and OLE2 workbooks.
  ['not-a-spreadsheet.odt', 'rejected', ['UNPARSEABLE']],
  ['basic.ods', 'rejected', ['UNPARSEABLE']],
  ['encrypted.xlsx', 'rejected', ['ENCRYPTED']],
  ['encrypted.xls', 'rejected', ['ENCRYPTED']],
  ['truncated-clean.xlsx', 'rejected', ['UNPARSEABLE']],
  ['truncated-vba.xlsm', 'rejected', ['UNPARSEABLE']],
  ['truncated-vba.xls', 'rejected', ['UNPARSEABLE']],
] as const)('real fixture %s', (name, verdict, codes) => {
  let result: InspectionResult;

  beforeAll(async () => {
    result = await inspectSpreadsheet(fixture(name));
  });

  it(`is ${verdict}`, () => {
    expect(result.verdict).toBe(verdict);
  });

  it('reports the expected reason codes', () => {
    expect(result.reasons.map((r) => r.code)).toEqual(codes);
  });
});

// A damaged macro file must never read as clean: cut each one at every 1% mark.
describe.each([
  'vba.xlsm',
  'vba.xlsb',
  'vba.xlam',
  'xls-vba.xls',
  'xls-xlm.xls',
  'xlsm-xlm.xlsm',
  'xlsb-xlm.xlsb',
  'xls-vba-xlm.xls',
])('truncated copies of %s', (name) => {
  it('are never accepted', async () => {
    const full = fixture(name);
    const acceptedAtPercent: number[] = [];
    for (let percent = 0; percent < 100; percent++) {
      const cut = full.slice(0, Math.floor((full.length * percent) / 100));
      if ((await inspectSpreadsheet(cut)).verdict === 'accepted') {
        acceptedAtPercent.push(percent);
      }
    }
    expect(acceptedAtPercent).toEqual([]);
  });
});
