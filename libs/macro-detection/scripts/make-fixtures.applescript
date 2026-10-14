-- Generates the binary spreadsheet fixtures with real Microsoft Excel (macOS).
-- Usage: osascript make-fixtures.applescript <fixture-name> <output-dir>
-- Excel is sandboxed, so files are written inside its container, then the
-- caller copies them out. See ../src/test-support/fixtures/README.md.

on run argv
	set fixtureName to item 1 of argv
	set outDir to item 2 of argv
	set target to outDir & "/" & fixtureName

	tell application "Microsoft Excel"
		set display alerts to false
		set wb to make new workbook
		try
			if fixtureName is "clean.xls" then
				set value of cell "A1" of active sheet to "clean"
				save workbook as wb filename target file format Excel98to2004 file format
			else if fixtureName is "xls-xlm.xls" then
				set macroSheet to make new macro sheet at before sheet 1 of wb
				set formula of cell "A1" of macroSheet to "=HALT()"
				save workbook as wb filename target file format Excel98to2004 file format
			else if fixtureName is "encrypted.xlsx" then
				set value of cell "A1" of active sheet to "secret"
				save workbook as wb filename target file format Excel XML file format password "fixture-password"
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
