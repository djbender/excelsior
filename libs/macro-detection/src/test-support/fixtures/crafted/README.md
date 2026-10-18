# Crafted fixtures

Unlike the files one directory up, these are **hand-edited**: each is the
Excel-made [`../vba.xlsm`](../README.md) rewritten by
[`scripts/make-crafted-fixtures.mjs`](../../../../scripts/make-crafted-fixtures.mjs).
They exist to test detector bypasses that Excel itself would never write.

Every file keeps the real `vbaProject.bin` from `vba.xlsm`, byte for byte, but:

- it is renamed to `xl/macros.dat`, so no file-name check can see it;
- `xl/_rels/workbook.xml.rels` still targets it with the `vbaProject` relationship;
- the `Default Extension="bin"` VBA declaration is removed.

Only how `[Content_Types].xml` declares `/xl/macros.dat` differs:

| File                    | Declaration                                                                               | Expected verdict        | Excel loads the VBA? |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------- | -------------------- |
| `charref.xlsm`          | `ContentType="application/vnd.ms-office.&#118;baProject"`                                 | rejected: `UNPARSEABLE` | yes                  |
| `percent-partname.xlsm` | `PartName="/xl/%6Dacros.dat"` (percent-encoded `m`)                                       | rejected: `UNPARSEABLE` | no, damaged (1)      |
| `prefixed.xlsm`         | Only this Override is prefixed: `<ct:Override …>`, `xmlns:ct` bound to the same namespace | rejected: `UNPARSEABLE` | yes                  |

All three are rejected as `UNPARSEABLE`, not `VBA_PROJECT`: the detector only
reads `[Content_Types].xml` in the plain form Excel writes, and refuses anything
else (entities, percent escapes, prefixes, comments, a DOCTYPE, …) before it
judges any part. That way it never has to agree with Excel's XML parser on how
to read an unusual manifest.

"Excel loads the VBA?" is checked by opening the file in Excel for Mac with
macros set to "disable with notification". "Yes" means Excel showed its "This
workbook contains macros" prompt, so the file is a real bypass for any detector
that misses it.

(1) Excel does not decode the percent escape, so it finds no content type for
`xl/macros.dat` and reports the file as damaged. Repairing it drops the VBA
project: no macro prompt follows. So this one was never a real bypass, but the
detector refuses it anyway, along with every other unusual manifest.

Why the detector ignores relationships: a fourth variant declared
`xl/macros.dat` as `application/octet-stream`, so only the `vbaProject`
relationship pointed at the VBA. Excel opened it with no macro prompt: without
the VBA content type it does not load the project. The content type alone
decides, so that variant was dropped.

## Regenerating

From the repo root:

```sh
node libs/macro-detection/scripts/make-crafted-fixtures.mjs
```

Output is deterministic (fixed timestamps), so rerunning should leave
`git status` clean.
