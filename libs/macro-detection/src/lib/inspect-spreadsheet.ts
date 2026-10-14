import type { ContainerInspector } from './container-inspector.js';
import { reasonFromError } from './errors.js';
import { MAX_INPUT_BYTES } from './limits.js';
import { ole2Inspector } from './ole2/inspect-ole2.js';
import { ooxmlInspector } from './ooxml/inspect-ooxml.js';
import type { InspectionResult, Reason } from './types.js';

const inspectors: readonly ContainerInspector[] = [
  ooxmlInspector,
  ole2Inspector,
];

const verdictFor = (reasons: Reason[]): InspectionResult => ({
  verdict: reasons.length > 0 ? 'rejected' : 'accepted',
  reasons,
});

export async function inspectSpreadsheet(
  buf: Uint8Array,
): Promise<InspectionResult> {
  try {
    if (buf.length > MAX_INPUT_BYTES) {
      return verdictFor([
        {
          code: 'LIMIT_EXCEEDED',
          detail: `File exceeds ${MAX_INPUT_BYTES} bytes`,
        },
      ]);
    }
    const inspector = inspectors.find((candidate) => candidate.matches(buf));
    if (!inspector) {
      return verdictFor([
        {
          code: 'NOT_A_SPREADSHEET',
          detail: 'File is not an OOXML or OLE2 spreadsheet',
        },
      ]);
    }
    return verdictFor(await inspector.inspect(buf));
  } catch (error) {
    return verdictFor([reasonFromError(error)]);
  }
}
