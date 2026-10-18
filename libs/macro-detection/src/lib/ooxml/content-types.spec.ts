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

  it('accepts the form Excel writes: declaration, CRLF, standalone', () => {
    const types = parseContentTypes(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="bin" ContentType="application/x-a"/></Types>',
    );
    expect(types.resolve('a.bin')).toBe('application/x-a');
  });

  it('accepts a manifest without a declaration', () => {
    const types = parseContentTypes(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="bin" ContentType="application/x-a"/></Types>',
    );
    expect(types.resolve('a.bin')).toBe('application/x-a');
  });

  it('accepts whitespace between and inside elements', () => {
    const types = parseContentTypes(
      xml('\n  <Override\n    PartName = "/a.bin"\n    ContentType="x" />\n'),
    );
    expect(types.resolve('a.bin')).toBe('x');
  });

  // Anything an XML parser could read differently from this one is refused, so
  // Excel and the detector can never disagree on what a part's type is.
  const ct = 'http://schemas.openxmlformats.org/package/2006/content-types';
  it.each([
    [
      'a character reference',
      xml('<Override PartName="/a.bin" ContentType="x-&#118;ba"/>'),
    ],
    [
      'a predefined entity',
      xml('<Override PartName="/a.bin" ContentType="a&amp;b"/>'),
    ],
    [
      'a percent-encoded PartName',
      xml('<Override PartName="/xl/%76ba.bin" ContentType="x"/>'),
    ],
    [
      'a percent-encoded Extension',
      xml('<Default Extension="%62in" ContentType="x"/>'),
    ],
    [
      'a namespace-prefixed element',
      `<Types xmlns="${ct}" xmlns:ct="${ct}"><ct:Override PartName="/a.bin" ContentType="x"/></Types>`,
    ],
    [
      'a prefixed root',
      `<ct:Types xmlns:ct="${ct}"><ct:Default Extension="bin" ContentType="x"/></ct:Types>`,
    ],
    ['the wrong namespace', '<Types xmlns="urn:other"></Types>'],
    ['a missing namespace', '<Types></Types>'],
    ['an extra attribute on the root', `<Types xmlns="${ct}" a="b"></Types>`],
    ['a comment', xml('<!-- <Override PartName="/a" ContentType="x"/> -->')],
    [
      'a DOCTYPE',
      `<?xml version="1.0"?><!DOCTYPE Types [<!ENTITY v "vba">]><Types xmlns="${ct}"></Types>`,
    ],
    ['CDATA', xml('<![CDATA[x]]>')],
    ['a processing instruction in the body', xml('<?pi x?>')],
    ['an unknown element', xml('<Other/>')],
    ['text between elements', xml('text')],
    [
      'a non-self-closing element',
      xml('<Default Extension="bin" ContentType="x"></Default>'),
    ],
    [
      'an unknown attribute',
      xml('<Default Extension="bin" ContentType="x" Other="y"/>'),
    ],
    [
      'an attribute name in the wrong case',
      xml('<Default extension="bin" ContentType="x"/>'),
    ],
    ['a missing attribute', xml('<Override PartName="/a.bin"/>')],
    [
      'a repeated attribute',
      xml('<Override PartName="/a" PartName="/b" ContentType="x"/>'),
    ],
    [
      'two Overrides for one part',
      xml(
        '<Override PartName="/a.bin" ContentType="x"/>' +
          '<Override PartName="/A.BIN" ContentType="y"/>',
      ),
    ],
    [
      'two Defaults for one extension',
      xml(
        '<Default Extension="bin" ContentType="x"/>' +
          '<Default Extension="BIN" ContentType="y"/>',
      ),
    ],
    ['an unclosed root', `<Types xmlns="${ct}">`],
    ['content after the root', xml('') + '<Types/>'],
  ])('throws on %s', (_name, manifest) => {
    expect(() => parseContentTypes(manifest)).toThrow();
  });

  describe('a 1 MiB manifest that goes wrong only at the very end', () => {
    // Unique part names, so no duplicate stops the parse early.
    let body = '';
    for (let i = 0; body.length < 1024 * 1024; i++) {
      body += `<Override PartName="/xl/p${i}.xml" ContentType="x"/>\n  `;
    }
    const manifest = `<Types xmlns="${ct}">${body}<Other/></Types>`;

    it('is read all the way to the end before being refused', () => {
      expect(() => parseContentTypes(manifest)).toThrow(/unexpected content/);
    });

    it('is refused quickly', () => {
      const started = performance.now();
      try {
        parseContentTypes(manifest);
      } catch {
        // Refusing it is expected; only the time matters here.
      }
      expect(performance.now() - started).toBeLessThan(500);
    });
  });

  it('takes the extension from the file name, not a folder', () => {
    const types = parseContentTypes(
      xml('<Default Extension="d/x" ContentType="application/x-a"/>'),
    );
    expect(types.resolve('xl.d/x')).toBeUndefined();
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
