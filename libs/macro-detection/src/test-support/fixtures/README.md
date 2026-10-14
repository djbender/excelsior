# Binary fixtures

Produced by real Microsoft Excel for Mac 16.113.4 using
[`scripts/make-fixtures.applescript`](../../../scripts/make-fixtures.applescript).
None are synthesized or hand-edited.

| File | Contents | Expected verdict |
| --- | --- | --- |
| `clean.xls` | One sheet, cell A1 = "clean". Saved as Excel 97-2004. | accepted |
| `clean.xlsm` | Saved as macro-enabled .xlsm, but with no VBA module. Proves "capable of macros" is not "has macros". | accepted |
| `clean.xlsb` | Saved as .xlsb, no VBA module. | accepted |
| `xls-xlm.xls` | An Excel 4.0 macro sheet with `=HALT()` in A1, plus a worksheet. Saved as Excel 97-2004. | rejected: `XLM_MACRO_SHEET` |
| `encrypted.xlsx` | Saved as .xlsx with an open password (`fixture-password`). Excel stores this as an OLE2 container holding `EncryptionInfo` and `EncryptedPackage`. | rejected: `ENCRYPTED` |

## Regenerating

Excel is sandboxed, so it can only write inside its container. Run once per
fixture, then copy the result into this directory:

```sh
C=~/Library/Containers/com.microsoft.Excel/Data/fixtures
mkdir -p "$C"
osascript libs/macro-detection/scripts/make-fixtures.applescript clean.xls "$C"
osascript libs/macro-detection/scripts/make-fixtures.applescript xls-xlm.xls "$C"
osascript libs/macro-detection/scripts/make-fixtures.applescript encrypted.xlsx "$C"
osascript libs/macro-detection/scripts/make-fixtures.applescript clean.xlsm "$C"
osascript libs/macro-detection/scripts/make-fixtures.applescript clean.xlsb "$C"
```

## VBA fixtures

Excel's AppleScript dictionary has no VBA project or VBE classes, so a VBA
module cannot be inserted by script. `vba.xlsm` was authored by hand in Excel
(Developer tab, Visual Basic, Insert Module, an empty `Sub Hello()`, saved as
.xlsm). The script derives the other two from it, so `vba.xlsm` must be in the
container directory first:

```sh
osascript libs/macro-detection/scripts/make-fixtures.applescript xls-vba.xls "$C"
osascript libs/macro-detection/scripts/make-fixtures.applescript vba.xlsb "$C"
```

| File | Contents | Expected verdict |
| --- | --- | --- |
| `vba.xlsm` | Hand-made macro-enabled workbook with one empty `Sub`. | rejected: `VBA_PROJECT` |
| `xls-vba.xls` | `vba.xlsm` re-saved as Excel 97-2004. | rejected: `VBA_PROJECT` |
| `vba.xlsb` | `vba.xlsm` re-saved as Excel binary. | rejected: `VBA_PROJECT` |
