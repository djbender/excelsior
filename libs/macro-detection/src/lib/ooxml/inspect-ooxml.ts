import JSZip from 'jszip';
import { startsWith, type ContainerInspector } from '../container-inspector.js';
import type { Reason } from '../types.js';
import { parseContentTypes } from './content-types.js';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const CONTENT_TYPES_PART = '[Content_Types].xml';

const VBA_CONTENT_TYPE = /vbaproject/i;
const MACRO_SHEET_CONTENT_TYPE = /macrosheet/i;
const VBA_ENTRY_NAME = /vbaproject\.bin$/i;

function reasonsForEntry(name: string, contentType: string | undefined): Reason[] {
  const reasons: Reason[] = [];
  const vbaByType = contentType !== undefined && VBA_CONTENT_TYPE.test(contentType);
  if (VBA_ENTRY_NAME.test(name) || vbaByType) {
    reasons.push({ code: 'VBA_PROJECT', detail: `VBA project found in part ${name}` });
  }
  if (contentType !== undefined && MACRO_SHEET_CONTENT_TYPE.test(contentType)) {
    reasons.push({ code: 'XLM_MACRO_SHEET', detail: `Excel 4.0 macro sheet found in part ${name}` });
  }
  return reasons;
}

export const ooxmlInspector: ContainerInspector = {
  matches: (buf) => startsWith(buf, ZIP_MAGIC),
  async inspect(buf) {
    const zip = await JSZip.loadAsync(buf);
    const manifest = await zip.file(CONTENT_TYPES_PART)?.async('string');
    if (manifest === undefined) throw new Error(`Missing ${CONTENT_TYPES_PART}`);

    const types = parseContentTypes(manifest);
    return Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .flatMap((entry) => reasonsForEntry(entry.name, types.resolve(entry.name)));
  },
};
