export interface ContentTypes {
  /** Content type for a ZIP entry name: Override PartName first, then Default Extension. */
  resolve(entryName: string): string | undefined;
}

const NAMESPACE = String.raw`http://schemas\.openxmlformats\.org/package/2006/content-types`;
// Printable ASCII only, and no character an XML parser or a URI could decode:
// `&` (entities), `<`, `%`. Non-ASCII is out because JavaScript and Excel fold
// its case differently; tabs and newlines because XML rewrites them to spaces.
const VALUE = String.raw`(?:"[^"<&%\x00-\x1F\x7F-￿]*"|'[^'<&%\x00-\x1F\x7F-￿]*')`;
const ATTRIBUTES = String.raw`(?:\s+[A-Za-z]+\s*=\s*${VALUE})*`;

// Sticky, so each one must match exactly where the previous one stopped.
const HEAD = new RegExp(
  String.raw`(?:<\?xml${ATTRIBUTES}\s*\?>)?\s*<Types\s+xmlns\s*=\s*(?:"${NAMESPACE}"|'${NAMESPACE}')\s*>`,
  'y',
);
const ELEMENT = new RegExp(
  String.raw`\s*<(Default|Override)(${ATTRIBUTES})\s*/>`,
  'y',
);
const TAIL = /\s*<\/Types>\s*$/y;
const ATTRIBUTE = /([A-Za-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ATTRIBUTE_NAMES = {
  Default: ['ContentType', 'Extension'],
  Override: ['ContentType', 'PartName'],
} as const;

class NotExcelFormError extends Error {
  constructor(problem: string) {
    super(`[Content_Types].xml is not in the form Excel writes: ${problem}`);
  }
}

function attributesOf(
  tag: keyof typeof ATTRIBUTE_NAMES,
  raw: string,
): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name, double, single] of raw.matchAll(ATTRIBUTE)) {
    if (attributes.has(name)) {
      throw new NotExcelFormError(`${tag} repeats ${name}`);
    }
    attributes.set(name, double ?? single);
  }
  const expected = ATTRIBUTE_NAMES[tag];
  if (
    attributes.size !== expected.length ||
    !expected.every((name) => attributes.has(name))
  ) {
    throw new NotExcelFormError(
      `${tag} must have exactly ${expected.join(' and ')}`,
    );
  }
  return attributes;
}

// ASCII-only case folding, as OPC and Excel compare part names. toLowerCase()
// would also fold e.g. KELVIN SIGN to "k", merging names Excel keeps apart.
const normalizePart = (name: string): string =>
  '/' +
  name.replace(/^\/+/, '').replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/**
 * Reads the manifest only in the plain form Excel writes: an optional XML
 * declaration, then `<Types>` in the default namespace holding self-closing
 * `<Default>` and `<Override>` elements with exactly their two attributes.
 *
 * Anything else throws, which the caller reports as unparseable: entities,
 * percent escapes, prefixes, comments, a DOCTYPE, unknown elements or
 * attributes, duplicates. Each of those is a place where Excel's XML parser
 * could read a part's type differently from this one, so refusing them means
 * the two can never disagree.
 */
export function parseContentTypes(xml: string): ContentTypes {
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();

  HEAD.lastIndex = 0;
  if (!HEAD.test(xml)) throw new NotExcelFormError('unexpected start');
  let position = HEAD.lastIndex;

  for (;;) {
    ELEMENT.lastIndex = position;
    const match = ELEMENT.exec(xml);
    if (!match) break;
    position = ELEMENT.lastIndex;

    const tag = match[1] as keyof typeof ATTRIBUTE_NAMES;
    const attributes = attributesOf(tag, match[2]);
    const contentType = attributes.get('ContentType') as string;
    const [map, key] =
      tag === 'Default'
        ? [defaults, (attributes.get('Extension') as string).toLowerCase()]
        : [overrides, normalizePart(attributes.get('PartName') as string)];
    if (map.has(key)) {
      throw new NotExcelFormError(`two ${tag} elements for ${key}`);
    }
    map.set(key, contentType);
  }

  TAIL.lastIndex = position;
  if (!TAIL.test(xml)) {
    throw new NotExcelFormError(`unexpected content at offset ${position}`);
  }

  return {
    resolve(entryName) {
      const part = normalizePart(entryName);
      const override = overrides.get(part);
      if (override !== undefined) return override;
      const fileName = part.slice(part.lastIndexOf('/') + 1);
      const dot = fileName.lastIndexOf('.');
      return dot === -1 ? undefined : defaults.get(fileName.slice(dot + 1));
    },
  };
}
