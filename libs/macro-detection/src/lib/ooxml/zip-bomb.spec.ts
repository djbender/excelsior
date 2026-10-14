import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentTypes } from '../../test-support/ooxml.js';
import { rawZip } from '../../test-support/raw-zip.js';
import { inspectSpreadsheet } from '../inspect-spreadsheet.js';
import { MAX_CONTENT_TYPES_BYTES } from '../limits.js';
import type { InspectionResult } from '../types.js';

// SAFETY: nothing here is a real zip bomb. The largest thing ever held in memory is
// 32 MiB of spaces, which DEFLATE shrinks to about 32 KiB (a ~1000:1 ratio, the most
// DEFLATE can do), and the code under test must stop reading after the cap anyway.
// Never raise BOMB_INFLATED_BYTES into the hundreds of MiB, never read a downloaded
// bomb such as 42.zip, and never write any of these archives to disk.
const BOMB_INFLATED_BYTES = 32 * 1024 * 1024;

const codes = (result: InspectionResult) => result.reasons.map((r) => r.code);

/** A zip whose only entry is a manifest that inflates to BOMB_INFLATED_BYTES. */
async function manifestBomb(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    contentTypes() + ' '.repeat(BOMB_INFLATED_BYTES),
  );
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/** Rewrites the uncompressed size in the first local header and its central entry. */
function claimUncompressedSize(bytes: Uint8Array, size: number): Uint8Array {
  const patched = new Uint8Array(bytes);
  const view = new DataView(patched.buffer);
  view.setUint32(22, size, true); // first local header, uncompressed size
  for (let at = patched.length - 22; at >= 0; at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      const centralDirectory = view.getUint32(at + 16, true);
      view.setUint32(centralDirectory + 24, size, true);
      return patched;
    }
  }
  throw new Error('end of central directory not found');
}

describe('a manifest that inflates far past the cap', () => {
  let bomb: Uint8Array;
  let result: InspectionResult;

  beforeAll(async () => {
    bomb = await manifestBomb();
    result = await inspectSpreadsheet(bomb);
  });

  it('really is a high-ratio file (at least 500:1)', () => {
    expect(bomb.length * 500).toBeLessThan(BOMB_INFLATED_BYTES);
  });

  it('is rejected as LIMIT_EXCEEDED', () => {
    expect(codes(result)).toEqual(['LIMIT_EXCEEDED']);
  });

  it('names the cap in the reason', () => {
    expect(result.reasons[0].detail).toContain(`${MAX_CONTENT_TYPES_BYTES}`);
  });
});

describe('the same bomb with headers that claim a tiny uncompressed size', () => {
  let result: InspectionResult;

  beforeAll(async () => {
    result = await inspectSpreadsheet(
      claimUncompressedSize(await manifestBomb(), 10),
    );
  });

  it('is still rejected as LIMIT_EXCEEDED, trusting the bytes over the header', () => {
    expect(codes(result)).toEqual(['LIMIT_EXCEEDED']);
  });
});

describe('a non-manifest entry that claims 2 GiB and cannot be inflated', () => {
  // If the inspector tried to inflate this entry, the garbage deflate stream would
  // make it throw and the verdict would be UNPARSEABLE. It must never be touched.
  let result: InspectionResult;

  beforeAll(async () => {
    result = await inspectSpreadsheet(
      rawZip([
        {
          name: '[Content_Types].xml',
          data: contentTypes({ defaults: { xml: 'application/xml' } }),
        },
        { name: 'xl/workbook.xml', data: '<workbook/>' },
        {
          name: 'xl/worksheets/sheet1.xml',
          data: new Uint8Array([
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
          ]),
          method: 8,
          uncompressedSize: 0x7fffffff,
        },
      ]),
    );
  });

  it('is accepted, because only the manifest is ever read', () => {
    expect(result.verdict).toBe('accepted');
  });
});
