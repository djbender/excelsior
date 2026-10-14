import JSZip from 'jszip';
import { startsWith, type ContainerInspector } from '../container-inspector.js';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

export const ooxmlInspector: ContainerInspector = {
  matches: (buf) => startsWith(buf, ZIP_MAGIC),
  async inspect(buf) {
    await JSZip.loadAsync(buf);
    return [];
  },
};
