-- Generates the binary spreadsheet fixtures with real Microsoft Excel (macOS).
-- Usage: osascript make-fixtures.applescript <fixture-name> <dir>
-- Excel is sandboxed, so <dir> must be inside its container; the caller copies
-- the results out. See ../src/test-support/fixtures/README.md.
--
-- Excel's AppleScript dictionary cannot create VBA modules, so the VBA
-- fixtures (xls-vba.xls, vba.xlsb) are converted from <dir>/vba.xlsm, which
-- must be authored by hand once (a workbook containing one Sub).

on run argv
	set fixtureName to item 1 of argv
	set outDir to item 2 of argv
	set target to outDir & "/" & fixtureName

	tell application "Microsoft Excel"
		set display alerts to false
		-- Opening vba.xlsm shows Excel's "Enable macros?" prompt. `automation
		-- security` does not suppress it on macOS; answer "Disable Macros" (the VBA
		-- project is still carried through Save As) or set Excel > Settings >
		-- Security & Privacy > Macro Security to "Disable all macros without notification".
		if fixtureName is "xls-vba.xls" or fixtureName is "vba.xlsb" or fixtureName is "xls-vba-xlm.xls" then
			open workbook workbook file name (outDir & "/vba.xlsm")
		else
			make new workbook
		end if
		try
			set wb to active workbook
			if fixtureName is "clean.xls" then
				set value of cell "A1" of active sheet to "clean"
				save workbook as wb filename target file format Excel98to2004 file format
			else if fixtureName is "clean.xlsm" then
				set value of cell "A1" of active sheet to "clean"
				save workbook as wb filename target file format macro enabled XML file format
			else if fixtureName is "clean.xlsb" then
				set value of cell "A1" of active sheet to "clean"
				save workbook as wb filename target file format Excel binary file format
			else if fixtureName is "xls-xlm.xls" then
				set macroSheet to make new macro sheet at before sheet 1 of wb
				set formula of cell "A1" of macroSheet to "=HALT()"
				save workbook as wb filename target file format Excel98to2004 file format
			else if fixtureName is "encrypted.xlsx" then
				set value of cell "A1" of active sheet to "secret"
				save workbook as wb filename target file format Excel XML file format password "fixture-password"
			else if fixtureName is "clean.xlsx" then
				set value of cell "A1" of active sheet to "clean"
				save workbook as wb filename target file format Excel XML file format
			else if fixtureName is "xlsm-xlm.xlsm" then
				set macroSheet to make new macro sheet at before sheet 1 of wb
				set formula of cell "A1" of macroSheet to "=HALT()"
				save workbook as wb filename target file format macro enabled XML file format
			else if fixtureName is "xlsb-xlm.xlsb" then
				set macroSheet to make new macro sheet at before sheet 1 of wb
				set formula of cell "A1" of macroSheet to "=HALT()"
				save workbook as wb filename target file format Excel binary file format
			else if fixtureName is "encrypted.xls" then
				set value of cell "A1" of active sheet to "secret"
				save workbook as wb filename target file format Excel98to2004 file format password "fixture-password"
			else if fixtureName is "xls-vba-xlm.xls" then
				set macroSheet to make new macro sheet at before sheet 1 of wb
				set formula of cell "A1" of macroSheet to "=HALT()"
				save workbook as wb filename target file format Excel98to2004 file format
			else if fixtureName is "xls-vba.xls" then
				save workbook as wb filename target file format Excel98to2004 file format
			else if fixtureName is "vba.xlsb" then
				save workbook as wb filename target file format Excel binary file format
			else
				error "Unknown fixture " & fixtureName
			end if
		on error errMsg number errNum
			close active workbook saving no
			error errMsg number errNum
		end try
		-- Save As re-binds the workbook, so the original reference is stale.
		close active workbook saving no
	end tell
end run
