import JSZip from 'jszip';

const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '</Types>';

/** Builds a minimal OOXML workbook, optionally containing a VBA project. */
export async function workbook(withVba: boolean): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('xl/workbook.xml', '<workbook/>');
  if (withVba) zip.file('xl/vbaProject.bin', 'binary');
  return zip.generateAsync({ type: 'nodebuffer' });
}
