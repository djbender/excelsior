import { beforeAll, describe, expect, it } from 'vitest';
import { inspectSpreadsheet } from './inspect-spreadsheet.js';
import { MAX_INPUT_BYTES } from './limits.js';
import type { InspectionResult } from './types.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('inspectSpreadsheet: input gating', () => {
  describe.each([
    ['empty input', () => new Uint8Array(), 'NOT_A_SPREADSHEET'],
    ['plain text', () => bytes('hello,world\n1,2\n'), 'NOT_A_SPREADSHEET'],
    ['input over the size limit', () => new Uint8Array(MAX_INPUT_BYTES + 1), 'LIMIT_EXCEEDED'],
  ] as const)('%s', (_name, input, code) => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(input());
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it(`reports only ${code}`, () => {
      expect(result.reasons.map((r) => r.code)).toEqual([code]);
    });
  });
});

describe('inspectSpreadsheet: corrupt containers fail closed', () => {
  const zipMagic = [0x50, 0x4b, 0x03, 0x04];
  const ole2Magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

  describe.each([
    ['truncated ZIP', Uint8Array.from([...zipMagic, 1, 2, 3])],
    ['truncated OLE2', Uint8Array.from([...ole2Magic, 1, 2, 3])],
  ] as const)('%s', (_name, input) => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(input);
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only UNPARSEABLE', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['UNPARSEABLE']);
    });
  });
});
