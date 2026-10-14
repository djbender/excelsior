import * as XLSX from 'xlsx';
import { startsWith, type ContainerInspector } from '../container-inspector.js';

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

export const ole2Inspector: ContainerInspector = {
  matches: (buf) => startsWith(buf, OLE2_MAGIC),
  async inspect(buf) {
    XLSX.read(buf, { type: 'array', bookVBA: true });
    return [];
  },
};
