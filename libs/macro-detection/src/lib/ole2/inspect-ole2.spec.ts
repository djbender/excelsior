import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import type { InspectionResult } from '../types.js';

/** A real BIFF8 .xls written by SheetJS: one sheet, no macros. */
function cleanXls(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[1, 2]]), 'Sheet1');
  return new Uint8Array(
    XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer,
  );
}

/** Re-opens the compound file and adds a stream at `path`. */
function withStream(xls: Uint8Array, path: string): Uint8Array {
  const cfb = XLSX.CFB.read(xls, { type: 'array' });
  XLSX.CFB.utils.cfb_add(cfb, path, new Uint8Array([1, 2, 3]));
  return new Uint8Array(
    XLSX.CFB.write(cfb, { type: 'array' }) as ArrayLike<number>,
  );
}

describe('inspectSpreadsheet: OLE2', () => {
  describe('a clean .xls', () => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(cleanXls());
    });

    it('is accepted', () => {
      expect(result.verdict).toBe('accepted');
    });
  });

  describe('an .xls containing a VBA project storage', () => {
    let result: InspectionResult;

    beforeAll(async () => {
      result = await inspectSpreadsheet(
        withStream(cleanXls(), '/_VBA_PROJECT_CUR/VBA/dir'),
      );
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only VBA_PROJECT', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['VBA_PROJECT']);
    });
  });

  describe('an OLE2 container holding an encrypted OOXML package', () => {
    let result: InspectionResult;

    beforeAll(async () => {
      const withInfo = withStream(cleanXls(), '/EncryptionInfo');
      result = await inspectSpreadsheet(
        withStream(withInfo, '/EncryptedPackage'),
      );
    });

    it('is rejected', () => {
      expect(result.verdict).toBe('rejected');
    });

    it('reports only ENCRYPTED', () => {
      expect(result.reasons.map((r) => r.code)).toEqual(['ENCRYPTED']);
    });
  });
});
