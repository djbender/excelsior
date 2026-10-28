# Crafted fixtures

Unlike the files in [`fixtures/`](fixtures/README.md), these are **not
committed**: [`crafted.ts`](crafted.ts) builds each one in memory at test time
by rewriting the Excel-made `fixtures/vba.xlsm`. They exist to test detector
bypasses that Excel itself would never write.

Every file keeps the real `vbaProject.bin` from `vba.xlsm`, byte for byte, but:

- it is renamed, so no file-name check can see it;
- `xl/_rels/workbook.xml.rels` still targets it with the `vbaProject` relationship.

Only the new name and how `[Content_Types].xml` declares the part differ. The
first three rename it to `xl/macros.dat` and drop vba.xlsm's
`Default Extension="bin"` VBA declaration:

| File                    | Declaration                                                                                                                            | Expected verdict        | Excel loads the VBA?  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- |
| `charref.xlsm`          | `ContentType="application/vnd.ms-office.&#118;baProject"`                                                                              | rejected: `UNPARSEABLE` | yes                   |
| `percent-partname.xlsm` | `PartName="/xl/%6Dacros.dat"` (percent-encoded `m`)                                                                                    | rejected: `UNPARSEABLE` | no, damaged (1)       |
| `prefixed.xlsm`         | Only this Override is prefixed: `<ct:Override …>`, `xmlns:ct` bound to the same namespace                                              | rejected: `UNPARSEABLE` | yes                   |
| `unicode-fold.xlsm`     | Part `xl/prjk.bin` keeps the VBA `Default Extension="bin"`; a decoy `Override PartName="/xl/prjK.bin"` (KELVIN SIGN) says octet-stream | rejected: `UNPARSEABLE` | yes, after repair (2) |

All are rejected as `UNPARSEABLE`, not `VBA_PROJECT`: the detector only reads
`[Content_Types].xml` in the plain form Excel writes, and refuses anything else
(entities, percent escapes, prefixes, comments, a DOCTYPE, non-ASCII, …) before
it judges any part. That way it never has to agree with Excel's XML parser on
how to read an unusual manifest.

"Excel loads the VBA?" is checked by opening the file in Excel for Mac with
macros set to "disable with notification". "Yes" means Excel showed its "This
workbook contains macros" prompt, so the file is a real bypass for any detector
that misses it.

(1) Excel does not decode the percent escape, so it finds no content type for
`xl/macros.dat` and reports the file as damaged. Repairing it drops the VBA
project: no macro prompt follows. So this one was never a real bypass, but the
detector refuses it anyway, along with every other unusual manifest.

(2) JavaScript's `toLowerCase()` folds KELVIN SIGN (U+212A) to `k`, so a
detector using it lets the decoy's harmless type shadow the real part. Excel
folds ASCII only, so the decoy names nothing: Excel reports the file as
damaged, and after "repair" it loads the VBA project through the `bin`
Default. Found by an adversarial review of the first version of this fix.

Why the detector ignores relationships: a fourth variant declared
`xl/macros.dat` as `application/octet-stream`, so only the `vbaProject`
relationship pointed at the VBA. Excel opened it with no macro prompt: without
the VBA content type it does not load the project. The content type alone
decides, so that variant was dropped.

## Writing them to disk

To open them in Excel, from the repo root:

```sh
node libs/macro-detection/scripts/make-crafted-fixtures.mjs [out-dir]
```

`out-dir` defaults to `tmp/crafted-fixtures` (gitignored). Output is
deterministic (fixed timestamps), byte-identical to the files the Excel results
above were recorded against.
