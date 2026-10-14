import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  biffStream,
  bof,
  boundSheet,
  eof,
  filePass,
  obProj,
  workbookStream,
} from '../../test-support/raw-biff.js';
import { rawCfb, type RawCfbEntry } from '../../test-support/raw-cfb.js';
import { inspectOle2 } from './inspect-ole2.js';

const codes = (bytes: Uint8Array) =>
  inspectOle2(bytes).map((reason) => reason.code);

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(join(__dirname, '../../test-support/fixtures', name)),
  );

const SHEET = { name: 'Sheet1', type: 0 };
const MACRO_SHEET = { name: 'Macros', type: 1 };

const cfb = (...entries: RawCfbEntry[]) => rawCfb(entries).bytes;
const workbook = (data: Uint8Array): RawCfbEntry => ({
  path: 'Workbook',
  data,
});
const vbaDir: RawCfbEntry = { path: '_VBA_PROJECT_CUR/VBA/dir', data: 'x' };

describe('inspectOle2: real Excel files', () => {
  it('finds nothing in clean.xls', () => {
    expect(codes(fixture('clean.xls'))).toEqual([]);
  });

  it('finds the VBA project in xls-vba.xls', () => {
    expect(codes(fixture('xls-vba.xls'))).toEqual(['VBA_PROJECT']);
  });

  it('finds the macro sheet in xls-xlm.xls', () => {
    expect(codes(fixture('xls-xlm.xls'))).toEqual(['XLM_MACRO_SHEET']);
  });

  it('reports both the VBA project and the macro sheet in xls-vba-xlm.xls', () => {
    expect(codes(fixture('xls-vba-xlm.xls'))).toEqual([
      'VBA_PROJECT',
      'XLM_MACRO_SHEET',
    ]);
  });

  it('reports a password-protected .xls as encrypted', () => {
    expect(codes(fixture('encrypted.xls'))).toEqual(['ENCRYPTED']);
  });

  it('gives the encrypted .xls a readable reason, not a library error', () => {
    expect(inspectOle2(fixture('encrypted.xls'))[0].detail).toBe(
      'Password-protected legacy .xls (BIFF FilePass record)',
    );
  });

  it('reports an encrypted .xlsx package as encrypted', () => {
    expect(codes(fixture('encrypted.xlsx'))).toEqual(['ENCRYPTED']);
  });

  it('throws on a truncated file, so the caller reports it as unparseable', () => {
    expect(() => inspectOle2(fixture('truncated-vba.xls'))).toThrow();
  });
});

describe('inspectOle2: hand-built files', () => {
  it('finds nothing in a plain workbook', () => {
    expect(codes(cfb(workbook(workbookStream(SHEET))))).toEqual([]);
  });

  it('finds a VBA project storage', () => {
    expect(codes(cfb(workbook(workbookStream(SHEET)), vbaDir))).toEqual([
      'VBA_PROJECT',
    ]);
  });

  it('matches the VBA storage name case-insensitively', () => {
    expect(
      codes(
        cfb(workbook(workbookStream(SHEET)), {
          path: '_vba_project_cur/vba/dir',
          data: 'x',
        }),
      ),
    ).toEqual(['VBA_PROJECT']);
  });

  it('finds a VBA project in a Word-style Macros storage', () => {
    expect(
      codes(
        cfb(workbook(workbookStream(SHEET)), {
          path: 'Macros/VBA/dir',
          data: 'x',
        }),
      ),
    ).toEqual(['VBA_PROJECT']);
  });

  it('finds a VBA project declared only by an OBPROJ record', () => {
    expect(
      codes(
        cfb(workbook(biffStream(bof(), obProj(), boundSheet('S', 0), eof()))),
      ),
    ).toEqual(['VBA_PROJECT']);
  });

  it('finds a Visual Basic module sheet (Excel 5/95 macros)', () => {
    expect(
      codes(cfb(workbook(workbookStream(SHEET, { name: 'Module1', type: 6 })))),
    ).toEqual(['VBA_PROJECT']);
  });

  it('reports one reason per Excel 4.0 macro sheet', () => {
    expect(
      codes(
        cfb(
          workbook(
            workbookStream(MACRO_SHEET, { name: 'More', type: 1 }, SHEET),
          ),
        ),
      ),
    ).toEqual(['XLM_MACRO_SHEET', 'XLM_MACRO_SHEET']);
  });

  it('names the macro sheet in the reason', () => {
    const [reason] = inspectOle2(cfb(workbook(workbookStream(MACRO_SHEET))));
    expect(reason.detail).toContain('Macros');
  });

  it('reads a BIFF5 workbook stored as "Book"', () => {
    expect(codes(cfb({ path: 'Book', data: workbookStream(SHEET) }))).toEqual(
      [],
    );
  });

  it('reports FilePass in the workbook stream as encrypted', () => {
    expect(codes(cfb(workbook(biffStream(bof(), filePass(), eof()))))).toEqual([
      'ENCRYPTED',
    ]);
  });

  it('reports an encrypted OOXML package as encrypted', () => {
    expect(
      codes(
        cfb(
          { path: 'EncryptionInfo', data: 'x' },
          { path: 'EncryptedPackage', data: 'x' },
        ),
      ),
    ).toEqual(['ENCRYPTED']);
  });

  it('rejects an OLE2 file with no workbook stream as not a spreadsheet', () => {
    expect(codes(cfb({ path: 'WordDocument', data: 'x' }))).toEqual([
      'NOT_A_SPREADSHEET',
    ]);
  });

  it('still reports the VBA project of a file that is not a spreadsheet', () => {
    expect(codes(cfb({ path: 'WordDocument', data: 'x' }, vbaDir))).toEqual([
      'VBA_PROJECT',
      'NOT_A_SPREADSHEET',
    ]);
  });

  it('reports a damaged workbook stream as unparseable', () => {
    expect(codes(cfb(workbook(Uint8Array.from([1, 2, 3, 4, 5, 6]))))).toEqual([
      'UNPARSEABLE',
    ]);
  });

  it('still reports the VBA project when the workbook stream is damaged', () => {
    expect(
      codes(cfb(workbook(Uint8Array.from([1, 2, 3, 4, 5, 6])), vbaDir)),
    ).toEqual(['VBA_PROJECT', 'UNPARSEABLE']);
  });
});
