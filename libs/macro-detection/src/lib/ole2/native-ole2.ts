import { LimitExceededError } from '../errors.js';
import type { Reason } from '../types.js';
import { scanWorkbookGlobals, type WorkbookGlobals } from './biff.js';
import { readCompoundFile } from './compound-file.js';

const ENCRYPTED_PACKAGE_STREAMS = ['/EncryptionInfo', '/EncryptedPackage'];
// Excel 97+ stores the workbook as "Workbook"; Excel 5/95 as "Book".
const WORKBOOK_STREAMS = ['/Workbook', '/Book'];
// Excel's own storage is _VBA_PROJECT_CUR; Word keeps its project under Macros/VBA.
const VBA_PATH = /(^|\/)_vba_project_cur(\/|$)|\/vba\/dir$/i;

const SHEET_TYPE_MACRO = 1;
const SHEET_TYPE_VB_MODULE = 6;

/**
 * Inspects an OLE2 file: an encrypted OOXML package, or a legacy `.xls` workbook.
 * Throws when the container itself cannot be read, so the caller reports it as
 * unparseable; problems inside the workbook stream become reasons instead, so any
 * macro evidence already found is still reported.
 */
export function inspectOle2(buf: Uint8Array): Reason[] {
  const file = readCompoundFile(buf);

  if (ENCRYPTED_PACKAGE_STREAMS.some((path) => file.has(path))) {
    return [
      { code: 'ENCRYPTED', detail: 'File is an encrypted Office package' },
    ];
  }

  let globals: WorkbookGlobals | undefined;
  let problem: Reason | undefined;
  const workbookPath = WORKBOOK_STREAMS.find((path) => file.has(path));
  if (workbookPath === undefined) {
    problem = {
      code: 'NOT_A_SPREADSHEET',
      detail: 'OLE2 file has no Workbook stream',
    };
  } else {
    try {
      globals = scanWorkbookGlobals(file.read(workbookPath) as Uint8Array);
    } catch (error) {
      if (error instanceof LimitExceededError) throw error;
      problem = {
        code: 'UNPARSEABLE',
        detail: error instanceof Error ? error.message : 'Unreadable workbook',
      };
    }
  }

  const reasons: Reason[] = [];

  const vbaPath = file.entries.find((entry) => VBA_PATH.test(entry.path))?.path;
  const vbaEvidence =
    vbaPath !== undefined
      ? `VBA project storage ${vbaPath} found in OLE2 workbook`
      : globals?.declaresVbaProject
        ? 'Workbook declares a VBA project (OBPROJ record)'
        : globals?.sheets.some((sheet) => sheet.type === SHEET_TYPE_VB_MODULE)
          ? 'Workbook contains a Visual Basic module sheet'
          : undefined;
  if (vbaEvidence !== undefined) {
    reasons.push({ code: 'VBA_PROJECT', detail: vbaEvidence });
  }

  for (const sheet of globals?.sheets ?? []) {
    if (sheet.type === SHEET_TYPE_MACRO) {
      reasons.push({
        code: 'XLM_MACRO_SHEET',
        detail: `Excel 4.0 macro sheet "${sheet.name}"`,
      });
    }
  }

  if (globals?.encrypted) {
    reasons.push({
      code: 'ENCRYPTED',
      detail: 'Password-protected legacy .xls (BIFF FilePass record)',
    });
  }
  if (problem) reasons.push(problem);
  return reasons;
}
