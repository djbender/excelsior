import * as XLSX from 'xlsx';
import { startsWith, type ContainerInspector } from '../container-inspector.js';
import { EncryptedError } from '../errors.js';
import type { Reason } from '../types.js';

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const ENCRYPTED_PACKAGE_STREAMS = ['/EncryptionInfo', '/EncryptedPackage'];
const PASSWORD_ERROR = /password|encrypt/i;

function assertNotEncrypted(buf: Uint8Array): void {
  const cfb = XLSX.CFB.read(buf, { type: 'array' });
  if (ENCRYPTED_PACKAGE_STREAMS.some((path) => XLSX.CFB.find(cfb, path))) {
    throw new EncryptedError('File is an encrypted Office package');
  }
}

function readWorkbook(buf: Uint8Array): XLSX.WorkBook {
  try {
    return XLSX.read(buf, { type: 'array', bookVBA: true });
  } catch (error) {
    // Legacy .xls password protection (FilePass record) surfaces as a thrown message.
    if (error instanceof Error && PASSWORD_ERROR.test(error.message)) {
      throw new EncryptedError(error.message);
    }
    throw error;
  }
}

export const ole2Inspector: ContainerInspector = {
  matches: (buf) => startsWith(buf, OLE2_MAGIC),
  async inspect(buf) {
    assertNotEncrypted(buf);
    const workbook = readWorkbook(buf);

    const reasons: Reason[] = [];
    if (workbook.vbaraw) {
      reasons.push({
        code: 'VBA_PROJECT',
        detail: 'VBA project storage found in OLE2 workbook',
      });
    }
    for (const name of workbook.SheetNames) {
      // SheetJS typings omit 'macro' from SheetType, but BIFF macro sheets are tagged with it.
      const sheetType: string | undefined = workbook.Sheets[name]?.['!type'];
      if (sheetType === 'macro') {
        reasons.push({
          code: 'XLM_MACRO_SHEET',
          detail: `Excel 4.0 macro sheet "${name}"`,
        });
      }
    }
    return reasons;
  },
};
