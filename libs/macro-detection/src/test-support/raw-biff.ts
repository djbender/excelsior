/**
 * Builds BIFF record streams by hand, so tests can describe a `.xls` workbook's globals
 * (sheets, an OBPROJ record, a FilePass record) without an Office program.
 */
export const BIFF8 = 0x0600;
export const BIFF5 = 0x0500;

const u16 = (value: number) => [value & 0xff, value >> 8];

export const record = (type: number, data: number[] = []): number[] => [
  ...u16(type),
  ...u16(data.length),
  ...data,
];

/** BOF for the workbook globals (substream 0x0005) or another substream type. */
export const bof = (version = BIFF8, substream = 0x0005): number[] =>
  record(0x0809, [
    ...u16(version),
    ...u16(substream),
    ...new Array(12).fill(0),
  ]);

export const eof = (): number[] => record(0x000a);

/** OBPROJ: the workbook declares a VBA project. */
export const obProj = (): number[] => record(0x00d3);

/** FilePass: the workbook is password-encrypted. */
export const filePass = (): number[] => record(0x002f, [1, 0, 1, 0]);

/** BoundSheet: position, state, sheet type (0 sheet, 1 macro, 6 VB module), then the name. */
export const boundSheet = (
  name: string,
  type: number,
  version = BIFF8,
): number[] => {
  const head = [0, 0, 0, 0, 0, type];
  if (version < BIFF8) {
    return record(0x0085, [
      ...head,
      name.length,
      ...[...name].map((c) => c.charCodeAt(0)),
    ]);
  }
  const wide = [...name].some((c) => c.charCodeAt(0) > 0xff);
  const chars = wide
    ? [...name].flatMap((c) => u16(c.charCodeAt(0)))
    : [...name].map((c) => c.charCodeAt(0));
  return record(0x0085, [...head, name.length, wide ? 1 : 0, ...chars]);
};

export const biffStream = (...records: number[][]): Uint8Array =>
  Uint8Array.from(records.flat());

/** A minimal valid workbook: BOF, the given sheets, EOF. */
export const workbookStream = (
  ...sheets: { name: string; type: number }[]
): Uint8Array =>
  biffStream(
    bof(),
    ...sheets.map((sheet) => boundSheet(sheet.name, sheet.type)),
    eof(),
  );
