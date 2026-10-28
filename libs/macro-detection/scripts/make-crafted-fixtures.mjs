// Writes the crafted bypass workbooks to disk, for opening them in Excel.
// The tests build them in memory; see src/test-support/crafted.md.
//
// Run from the repo root: node libs/macro-detection/scripts/make-crafted-fixtures.mjs [out-dir]
// out-dir defaults to tmp/crafted-fixtures (gitignored).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCrafted, CRAFTED_NAMES } from '../src/test-support/crafted.ts';

const lib = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? 'tmp/crafted-fixtures');
const vbaXlsm = readFileSync(join(lib, 'src/test-support/fixtures/vba.xlsm'));

mkdirSync(out, { recursive: true });
for (const name of CRAFTED_NAMES) {
  writeFileSync(join(out, name), await buildCrafted(vbaXlsm, name));
  console.log(`wrote ${join(out, name)}`);
}
