-- Generates non-spreadsheet fixtures with real Microsoft Word (macOS).
-- Usage: osascript make-word-fixtures.applescript <fixture-name> <dir>
-- Word is sandboxed, so <dir> must be inside its container
-- (~/Library/Containers/com.microsoft.Word/Data/...); the caller copies the
-- results out. See ../src/test-support/fixtures/README.md.

on run argv
	set fixtureName to item 1 of argv
	set outDir to item 2 of argv
	set target to outDir & "/" & fixtureName

	tell application "Microsoft Word"
		set display alerts to alerts none
		make new document
		try
			if fixtureName is "not-a-spreadsheet.docx" then
				insert text "not a spreadsheet" at text object of active document
				save as active document file name target file format format document
			else if fixtureName is "not-a-spreadsheet.odt" then
				insert text "not a spreadsheet" at text object of active document
				save as active document file name target file format format ODT
			else
				error "Unknown fixture " & fixtureName
			end if
		on error errMsg number errNum
			close active document saving no
			error errMsg number errNum
		end try
		-- Save As re-binds the document, so the original reference is stale.
		close active document saving no
	end tell
end run
