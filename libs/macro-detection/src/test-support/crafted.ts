// Builds the hand-edited bypass workbooks described in crafted.md.
//
// Each one starts from the Excel-made vba.xlsm and keeps its real vbaProject.bin,
// renamed (so no name heuristic sees it) and still targeted by the workbook's
// vbaProject relationship. Only the new name and how [Content_Types].xml
// declares that part differ.
import JSZip from 'jszip';

// Fixed timestamps so rebuilding gives byte-identical files.
const DATE = new Date('1980-01-01T00:00:00Z');

const VBA = 'application/vnd.ms-office.vbaProject';
const VBA_DEFAULT = `<Default Extension="bin" ContentType="${VBA}"/>`;
const HIDDEN_PART = 'xl/macros.dat';

interface Variant {
  /** The new name for xl/vbaProject.bin. */
  part: string;
  /** Edits vba.xlsm's [Content_Types].xml. */
  types: (types: string) => string;
}

const variants = {
  // Character reference: an XML parser reads "vbaProject".
  'charref.xlsm': {
    part: HIDDEN_PART,
    types: (types) =>
      types
        .replace(VBA_DEFAULT, '')
        .replace(
          '</Types>',
          `<Override PartName="/${HIDDEN_PART}" ContentType="application/vnd.ms-office.&#118;baProject"/></Types>`,
        ),
  },
  // Percent-encoded part name: as a URI it names /xl/macros.dat.
  'percent-partname.xlsm': {
    part: HIDDEN_PART,
    types: (types) =>
      types
        .replace(VBA_DEFAULT, '')
        .replace(
          '</Types>',
          `<Override PartName="/xl/%6Dacros.dat" ContentType="${VBA}"/></Types>`,
        ),
  },
  // Only the VBA Override is prefixed, with a second prefix bound to the same
  // namespace: to an XML parser it is one more Override like the others, and
  // the unprefixed workbook declaration still reads as a workbook.
  'prefixed.xlsm': {
    part: HIDDEN_PART,
    types: (types) =>
      types
        .replace(VBA_DEFAULT, '')
        .replace(
          'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"',
          '$& xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types"',
        )
        .replace(
          '</Types>',
          `<ct:Override PartName="/${HIDDEN_PART}" ContentType="${VBA}"/></Types>`,
        ),
  },
  // The part keeps vba.xlsm's VBA Default for .bin. A decoy Override names it
  // with a KELVIN SIGN (U+212A) for the "k": JavaScript's toLowerCase folds that
  // to "k", Excel's ASCII-only comparison does not, so only Excel uses the Default.
  'unicode-fold.xlsm': {
    part: 'xl/prjk.bin',
    types: (types) =>
      types.replace(
        '</Types>',
        '<Override PartName="/xl/prjK.bin" ContentType="application/octet-stream"/></Types>',
      ),
  },
} satisfies Record<string, Variant>;

export type CraftedName = keyof typeof variants;

export const CRAFTED_NAMES = Object.keys(variants) as CraftedName[];

/** Rewrites vba.xlsm (passed as `vbaXlsm`) into the named bypass workbook. */
export async function buildCrafted(
  vbaXlsm: Uint8Array,
  name: CraftedName,
): Promise<Uint8Array> {
  const { part, types } = variants[name];
  const source = await JSZip.loadAsync(vbaXlsm);
  const readText = (entry: string) => source.file(entry)!.async('string');
  const baseTypes = await readText('[Content_Types].xml');
  const rels = (await readText('xl/_rels/workbook.xml.rels')).replace(
    'Target="vbaProject.bin"',
    `Target="${part.slice('xl/'.length)}"`,
  );

  const zip = new JSZip();
  for (const entry of Object.values(source.files)) {
    if (entry.dir) continue;
    let body: string | Uint8Array;
    if (entry.name === '[Content_Types].xml') body = types(baseTypes);
    else if (entry.name === 'xl/_rels/workbook.xml.rels') body = rels;
    else body = await entry.async('uint8array');
    const target = entry.name === 'xl/vbaProject.bin' ? part : entry.name;
    // No implied folder entries: vba.xlsm has none, and they would carry today's date.
    zip.file(target, body, { date: DATE, createFolders: false });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
