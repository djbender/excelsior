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
  ['xls-xlm.xls', 'rejected', ['XLM_MACRO_SHEET']],
  ['encrypted.xlsx', 'rejected', ['ENCRYPTED']],
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

describe('real fixtures needing VBA (cannot be scripted; see README)', () => {
  it.todo('rejects xls-vba.xls as VBA_PROJECT');
  it.todo('rejects vba.xlsm as VBA_PROJECT');
  it.todo('rejects vba.xlsb as VBA_PROJECT');
  it.todo('accepts a clean .xlsm saved by Excel (no VBA)');
  it.todo('accepts a clean .xlsb saved by Excel (no VBA)');
});
