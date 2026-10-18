// Writes the hand-edited fixtures in src/test-support/fixtures/crafted/.
//
// Each one starts from the Excel-made vba.xlsm and keeps its real vbaProject.bin,
// renamed to xl/macros.dat (so no name heuristic sees it) and still targeted by
// the workbook's vbaProject relationship. Only how [Content_Types].xml declares
// that part differs. See the README in that directory.
//
// Run from the repo root: node libs/macro-detection/scripts/make-crafted-fixtures.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/test-support/fixtures',
);
const out = join(fixtures, 'crafted');
// Fixed timestamps so regenerating gives byte-identical files.
const DATE = new Date('1980-01-01T00:00:00Z');

const VBA = 'application/vnd.ms-office.vbaProject';
const HIDDEN_PART = 'xl/macros.dat';

const variants = {
  // Character reference: an XML parser reads "vbaProject".
  'charref.xlsm': (types) =>
    types.replace(
      '</Types>',
      `<Override PartName="/${HIDDEN_PART}" ContentType="application/vnd.ms-office.&#118;baProject"/></Types>`,
    ),
  // Percent-encoded part name: as a URI it names /xl/macros.dat.
  'percent-partname.xlsm': (types) =>
    types.replace(
      '</Types>',
      `<Override PartName="/xl/%6Dacros.dat" ContentType="${VBA}"/></Types>`,
    ),
  // Only the VBA Override is prefixed, with a second prefix bound to the same
  // namespace: to an XML parser it is one more Override like the others, and
  // the unprefixed workbook declaration still reads as a workbook.
  'prefixed.xlsm': (types) =>
    types
      .replace(
        'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"',
        '$& xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types"',
      )
      .replace(
        '</Types>',
        `<ct:Override PartName="/${HIDDEN_PART}" ContentType="${VBA}"/></Types>`,
      ),
};

const source = await JSZip.loadAsync(readFileSync(join(fixtures, 'vba.xlsm')));
const read = (name) => source.file(name).async('uint8array');
const readText = (name) => source.file(name).async('string');

const baseTypes = (await readText('[Content_Types].xml')).replace(
  `<Default Extension="bin" ContentType="${VBA}"/>`,
  '',
);
const rels = (await readText('xl/_rels/workbook.xml.rels')).replace(
  'Target="vbaProject.bin"',
  'Target="macros.dat"',
);

mkdirSync(out, { recursive: true });
for (const [name, editTypes] of Object.entries(variants)) {
  const zip = new JSZip();
  for (const entry of Object.values(source.files)) {
    if (entry.dir) continue;
    let body;
    if (entry.name === '[Content_Types].xml') body = editTypes(baseTypes);
    else if (entry.name === 'xl/_rels/workbook.xml.rels') body = rels;
    else body = await read(entry.name);
    const target =
      entry.name === 'xl/vbaProject.bin' ? HIDDEN_PART : entry.name;
    // No implied folder entries: vba.xlsm has none, and they would carry today's date.
    zip.file(target, body, { date: DATE, createFolders: false });
  }
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
  writeFileSync(join(out, name), bytes);
  console.log(`wrote ${join(out, name)}`);
}
