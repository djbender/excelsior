import JSZip from 'jszip';
import { startsWith, type ContainerInspector } from '../container-inspector.js';
import type { Reason } from '../types.js';
import { parseContentTypes } from './content-types.js';
import {
  assertCentralDirectoryEntryCount,
  assertEntryCount,
  readCappedText,
} from './zip-guards.js';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const CONTENT_TYPES_PART = '[Content_Types].xml';

const VBA_CONTENT_TYPE = /vbaproject/i;
const MACRO_SHEET_CONTENT_TYPE = /macrosheet/i;
const VBA_ENTRY_NAME = /vbaproject\.bin$/i;
// Main part of an Excel package: xlsx/xltx, and the macroEnabled xlsm/xltm/xlam/xlsb.
// Only used to confirm the package is a workbook, never to reject on its own.
const WORKBOOK_MAIN_CONTENT_TYPE =
  /spreadsheetml\.(sheet|template)\.main|ms-excel\.(sheet(\.binary)?|template|addin)\.macroEnabled\.main/i;

function reasonsForEntry(
  name: string,
  contentType: string | undefined,
): Reason[] {
  const reasons: Reason[] = [];
  const vbaByType =
    contentType !== undefined && VBA_CONTENT_TYPE.test(contentType);
  if (VBA_ENTRY_NAME.test(name) || vbaByType) {
    reasons.push({
      code: 'VBA_PROJECT',
      detail: `VBA project found in part ${name}`,
    });
  }
  if (contentType !== undefined && MACRO_SHEET_CONTENT_TYPE.test(contentType)) {
    reasons.push({
      code: 'XLM_MACRO_SHEET',
      detail: `Excel 4.0 macro sheet found in part ${name}`,
    });
  }
  return reasons;
}

export const ooxmlInspector: ContainerInspector = {
  matches: (buf) => startsWith(buf, ZIP_MAGIC),
  async inspect(buf) {
    assertCentralDirectoryEntryCount(buf);
    const zip = await JSZip.loadAsync(buf);
    assertEntryCount(Object.keys(zip.files).length);
    const manifest = await readCappedText(zip, CONTENT_TYPES_PART);
    if (manifest === undefined)
      throw new Error(`Missing ${CONTENT_TYPES_PART}`);

    const types = parseContentTypes(manifest);
    const parts = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => ({
        name: entry.name,
        contentType: types.resolve(entry.name),
      }));

    const reasons = parts.flatMap((part) =>
      reasonsForEntry(part.name, part.contentType),
    );
    const hasWorkbook = parts.some(
      (part) =>
        part.contentType !== undefined &&
        WORKBOOK_MAIN_CONTENT_TYPE.test(part.contentType),
    );
    if (!hasWorkbook) {
      reasons.push({
        code: 'NOT_A_SPREADSHEET',
        detail: 'Package has no spreadsheet workbook part',
      });
    }
    return reasons;
  },
};
