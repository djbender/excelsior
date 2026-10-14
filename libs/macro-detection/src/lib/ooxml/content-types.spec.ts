import { describe, expect, it } from 'vitest';
import { parseContentTypes } from './content-types.js';

const xml = (body: string) =>
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${body}</Types>`;

describe('parseContentTypes', () => {
  it('resolves a part through its Default extension', () => {
    const types = parseContentTypes(
      xml('<Default Extension="bin" ContentType="application/x-a"/>'),
    );
    expect(types.resolve('xl/stuff.bin')).toBe('application/x-a');
  });

  it('matches Default extensions case-insensitively', () => {
    const types = parseContentTypes(
      xml('<Default Extension="BIN" ContentType="application/x-a"/>'),
    );
    expect(types.resolve('xl/stuff.bin')).toBe('application/x-a');
  });

  it('prefers an Override over a Default', () => {
    const types = parseContentTypes(
      xml(
        '<Default Extension="bin" ContentType="application/x-a"/>' +
          '<Override PartName="/xl/stuff.bin" ContentType="application/x-b"/>',
      ),
    );
    expect(types.resolve('xl/stuff.bin')).toBe('application/x-b');
  });

  it('matches Override PartName case-insensitively', () => {
    const types = parseContentTypes(
      xml('<Override PartName="/XL/Stuff.XML" ContentType="application/x-b"/>'),
    );
    expect(types.resolve('xl/stuff.xml')).toBe('application/x-b');
  });

  it('accepts attributes in any order', () => {
    const types = parseContentTypes(
      xml('<Override ContentType="application/x-b" PartName="/a.xml"/>'),
    );
    expect(types.resolve('a.xml')).toBe('application/x-b');
  });

  it('accepts single-quoted attributes', () => {
    const types = parseContentTypes(
      xml("<Override PartName='/a.xml' ContentType='application/x-b'/>"),
    );
    expect(types.resolve('a.xml')).toBe('application/x-b');
  });

  it('returns undefined for an unmapped part', () => {
    const types = parseContentTypes(
      xml('<Default Extension="xml" ContentType="application/xml"/>'),
    );
    expect(types.resolve('xl/stuff.bin')).toBeUndefined();
  });

  it('does not resolve by folder name', () => {
    const types = parseContentTypes(
      xml(
        '<Override PartName="/xl/macrosheets/a.xml" ContentType="application/xml"/>',
      ),
    );
    expect(types.resolve('xl/macrosheets/b.xml')).toBeUndefined();
  });
});
