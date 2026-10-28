import { LimitExceededError } from '../errors.js';

/**
 * A minimal scanner for the workbook globals of a BIFF5/7/8 `.xls` stream, per [MS-XLS].
 *
 * It reads record headers (type, length) from the start of the stream up to the first
 * EOF and keeps only what a macro check needs: whether the file is password-encrypted,
 * whether the workbook declares a VBA project, and the type of every sheet. Everything
 * else is skipped by length. Each record advances at least four bytes, so the scan is
 * bounded by the stream size.
 */
export interface BoundSheet {
  name: string;
  /** 0 worksheet, 1 Excel 4.0 macro sheet, 2 chart, 6 Visual Basic module. */
  type: number;
}

export interface WorkbookGlobals {
  /** A FilePass record is present: everything after it is encrypted. */
  encrypted: boolean;
  /** An OBPROJ record is present: the workbook declares a VBA project. */
  declaresVbaProject: boolean;
  sheets: BoundSheet[];
}

const RECORD_BOF = 0x0809;
const RECORD_EOF = 0x000a;
const RECORD_FILEPASS = 0x002f;
const RECORD_BOUNDSHEET = 0x0085;
const RECORD_OBPROJ = 0x00d3;
const SUBSTREAM_WORKBOOK_GLOBALS = 0x0005;
const BIFF8 = 0x0600;
const MAX_SHEETS = 10_000;

export function scanWorkbookGlobals(stream: Uint8Array): WorkbookGlobals {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.length);
  const globals: WorkbookGlobals = {
    encrypted: false,
    declaresVbaProject: false,
    sheets: [],
  };

  let version = 0;
  let position = 0;
  let first = true;
  while (position + 4 <= stream.length) {
    const type = view.getUint16(position, true);
    const length = view.getUint16(position + 2, true);
    const start = position + 4;
    const end = start + length;
    if (end > stream.length) {
      throw new Error('Corrupted BIFF stream: a record overruns the stream');
    }

    if (first) {
      first = false;
      if (type !== RECORD_BOF || length < 4) {
        throw new Error(
          'Not a BIFF workbook stream: it does not start with a BOF record',
        );
      }
      version = view.getUint16(start, true);
      if (view.getUint16(start + 2, true) !== SUBSTREAM_WORKBOOK_GLOBALS) {
        throw new Error(
          'Not the workbook globals: the first BOF is for another substream',
        );
      }
    } else if (type === RECORD_FILEPASS) {
      // Everything after FilePass is encrypted, so there is nothing more to read.
      globals.encrypted = true;
      return globals;
    } else if (type === RECORD_OBPROJ) {
      globals.declaresVbaProject = true;
    } else if (type === RECORD_BOUNDSHEET) {
      if (globals.sheets.length >= MAX_SHEETS) {
        throw new LimitExceededError(
          `Workbook has more than ${MAX_SHEETS} sheets`,
        );
      }
      globals.sheets.push(readBoundSheet(stream.subarray(start, end), version));
    } else if (type === RECORD_EOF) {
      return globals;
    }
    position = end;
  }

  throw new Error(
    first
      ? 'Not a BIFF workbook stream: it does not start with a BOF record'
      : 'Corrupted BIFF stream: no end of the workbook globals',
  );
}

/** BoundSheet: position (4), state (1), sheet type (1), then the name. */
function readBoundSheet(data: Uint8Array, version: number): BoundSheet {
  const type = data.length > 5 ? data[5] : 0;
  const characters = data.length > 6 ? data[6] : 0;

  let name: string;
  if (version >= BIFF8) {
    const wide = data.length > 7 && (data[7] & 1) === 1;
    const bytes = data.subarray(8, 8 + characters * (wide ? 2 : 1));
    name = new TextDecoder(wide ? 'utf-16le' : 'latin1').decode(bytes);
  } else {
    name = new TextDecoder('latin1').decode(data.subarray(7, 7 + characters));
  }
  return { name, type };
}
