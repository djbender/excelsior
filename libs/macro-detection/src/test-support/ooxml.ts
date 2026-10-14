import JSZip from 'jszip';

export interface ContentTypesSpec {
  defaults?: Record<string, string>;
  overrides?: Record<string, string>;
  /**
   * Content type declared for /xl/workbook.xml, so a package looks like a
   * workbook by default. Pass null to omit it, or set the override yourself.
   */
  workbookMain?: string | null;
}

export const MAIN_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
export const MAIN_XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.main+xml';
export const MAIN_XLSB =
  'application/vnd.ms-excel.sheet.binary.macroEnabled.main';
export const WORD_MAIN =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export const VBA_PROJECT = 'application/vnd.ms-office.vbaProject';
export const MACRO_SHEET = 'application/vnd.ms-excel.macrosheet+xml';
export const WORKSHEET =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

/** The part that goes with the default workbookMain declaration in contentTypes(). */
export const WORKBOOK_PART = { 'xl/workbook.xml': '<workbook/>' };

export function contentTypes({
  defaults = {},
  overrides = {},
  workbookMain = MAIN_XLSX,
}: ContentTypesSpec = {}): string {
  if (workbookMain !== null && !('/xl/workbook.xml' in overrides)) {
    overrides = { '/xl/workbook.xml': workbookMain, ...overrides };
  }
  const defaultTags = Object.entries(defaults).map(
    ([extension, type]) =>
      `<Default Extension="${extension}" ContentType="${type}"/>`,
  );
  const overrideTags = Object.entries(overrides).map(
    ([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    [...defaultTags, ...overrideTags].join('') +
    '</Types>'
  );
}

export async function buildOoxml(
  parts: Record<string, string | Uint8Array>,
  options: { compression?: 'STORE' | 'DEFLATE' } = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(parts)) zip.file(name, body);
  return zip.generateAsync({
    type: 'uint8array',
    compression: options.compression ?? 'DEFLATE',
  });
}
