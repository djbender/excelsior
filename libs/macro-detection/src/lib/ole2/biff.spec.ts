import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BIFF5,
  BIFF8,
  biffStream,
  bof,
  boundSheet,
  eof,
  record,
} from '../../test-support/raw-biff.js';
import { LimitExceededError } from '../errors.js';
import { scanWorkbookGlobals } from './biff.js';
import { readCompoundFile } from './compound-file.js';

const stream = biffStream;

// --- real files ------------------------------------------------------------------

const workbookOf = (fixture: string) => {
  const file = readFileSync(
    join(__dirname, '../../test-support/fixtures', fixture),
  );
  const bytes = readCompoundFile(new Uint8Array(file)).read('/Workbook');
  if (!bytes) throw new Error(`${fixture} has no Workbook stream`);
  return scanWorkbookGlobals(bytes);
};

describe('scanWorkbookGlobals: hand-built streams', () => {
  it('lists every sheet with its name and type', () => {
    const globals = scanWorkbookGlobals(
      stream(bof(), boundSheet('Sheet1', 0), boundSheet('Macros', 1), eof()),
    );
    expect(globals.sheets).toEqual([
      { name: 'Sheet1', type: 0 },
      { name: 'Macros', type: 1 },
    ]);
  });

  it('decodes a 16-bit sheet name', () => {
    const globals = scanWorkbookGlobals(
      stream(bof(), boundSheet('Übersicht€', 0), eof()),
    );
    expect(globals.sheets[0].name).toBe('Übersicht€');
  });

  it('decodes a BIFF5 sheet name', () => {
    const globals = scanWorkbookGlobals(
      stream(bof(BIFF5), boundSheet('Old', 1, BIFF5), eof()),
    );
    expect(globals.sheets).toEqual([{ name: 'Old', type: 1 }]);
  });

  it('reports a Visual Basic module sheet by its type', () => {
    const globals = scanWorkbookGlobals(
      stream(bof(), boundSheet('Module1', 6), eof()),
    );
    expect(globals.sheets[0].type).toBe(6);
  });

  it('reports a VBA project declared by an OBPROJ record', () => {
    const globals = scanWorkbookGlobals(
      stream(bof(), record(0x00d3), boundSheet('Sheet1', 0), eof()),
    );
    expect(globals.declaresVbaProject).toBe(true);
  });

  it('does not report a VBA project when there is no OBPROJ record', () => {
    const globals = scanWorkbookGlobals(
      stream(bof(), boundSheet('Sheet1', 0), eof()),
    );
    expect(globals.declaresVbaProject).toBe(false);
  });

  it('reports encryption when a FilePass record is present', () => {
    const globals = scanWorkbookGlobals(
      stream(
        bof(),
        record(0x002f, [1, 0, 1, 0]),
        boundSheet('Sheet1', 0),
        eof(),
      ),
    );
    expect(globals.encrypted).toBe(true);
  });

  it('stops at FilePass, because everything after it is encrypted', () => {
    // Bytes after FilePass are ciphertext: this "record" claims 60,000 bytes.
    const garbage = Uint8Array.from([0x85, 0x00, 0x60, 0xea, 1, 2, 3]);
    const globals = scanWorkbookGlobals(
      Uint8Array.from([
        ...stream(bof(), record(0x002f, [1, 0, 1, 0])),
        ...garbage,
      ]),
    );
    expect(globals.sheets).toEqual([]);
  });
});

describe('scanWorkbookGlobals: damaged streams', () => {
  it('rejects a stream that does not start with a BOF record', () => {
    expect(() => scanWorkbookGlobals(stream(eof()))).toThrow(/BOF/);
  });

  it('rejects a BOF for something other than the workbook globals', () => {
    expect(() =>
      scanWorkbookGlobals(stream(bof(BIFF8, 0x0010), eof())),
    ).toThrow(/globals/);
  });

  it('rejects a record that runs past the end of the stream', () => {
    const cut = stream(bof(), boundSheet('Sheet1', 0)).slice(0, -3);
    expect(() => scanWorkbookGlobals(cut)).toThrow(/overruns/);
  });

  it('rejects globals with no EOF record', () => {
    expect(() =>
      scanWorkbookGlobals(stream(bof(), boundSheet('Sheet1', 0))),
    ).toThrow(/end of/);
  });

  it('rejects an empty stream', () => {
    expect(() => scanWorkbookGlobals(new Uint8Array())).toThrow(/BOF/);
  });

  it('rejects a stream with an unreasonable number of sheets', () => {
    const many = Array.from({ length: 10_001 }, () => boundSheet('S', 0));
    expect(() => scanWorkbookGlobals(stream(bof(), ...many, eof()))).toThrow(
      LimitExceededError,
    );
  });
});

describe('scanWorkbookGlobals: real Excel files', () => {
  it('lists the one sheet of clean.xls', () => {
    expect(workbookOf('clean.xls').sheets).toEqual([
      { name: 'Sheet1', type: 0 },
    ]);
  });

  it('finds no VBA project in clean.xls', () => {
    expect(workbookOf('clean.xls').declaresVbaProject).toBe(false);
  });

  it('finds no encryption in clean.xls', () => {
    expect(workbookOf('clean.xls').encrypted).toBe(false);
  });

  it('finds the Excel 4.0 macro sheet in xls-xlm.xls', () => {
    expect(
      workbookOf('xls-xlm.xls').sheets.map((sheet) => sheet.type),
    ).toContain(1);
  });

  it('finds the declared VBA project in xls-vba.xls', () => {
    expect(workbookOf('xls-vba.xls').declaresVbaProject).toBe(true);
  });

  it('finds both the macro sheet and the VBA project in xls-vba-xlm.xls', () => {
    const globals = workbookOf('xls-vba-xlm.xls');
    expect([
      globals.declaresVbaProject,
      globals.sheets.some((sheet) => sheet.type === 1),
    ]).toEqual([true, true]);
  });

  it('finds the FilePass record in the password-protected encrypted.xls', () => {
    expect(workbookOf('encrypted.xls').encrypted).toBe(true);
  });
});
