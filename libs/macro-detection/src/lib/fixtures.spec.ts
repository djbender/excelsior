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
  ['xls-vba.xls', 'rejected', ['VBA_PROJECT']],
  ['xls-xlm.xls', 'rejected', ['XLM_MACRO_SHEET']],
  ['xlsm-xlm.xlsm', 'rejected', ['XLM_MACRO_SHEET']],
  ['xlsb-xlm.xlsb', 'rejected', ['XLM_MACRO_SHEET']],
  ['xls-vba-xlm.xls', 'rejected', ['VBA_PROJECT', 'XLM_MACRO_SHEET']],
  ['encrypted.xlsx', 'rejected', ['ENCRYPTED']],
  ['encrypted.xls', 'rejected', ['ENCRYPTED']],
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
