export interface ContentTypes {
  /** Content type for a ZIP entry name: Override PartName first, then Default Extension. */
  resolve(entryName: string): string | undefined;
}

const ELEMENT = /<(Default|Override)\b([^>]*)>/g;
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attributesOf(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name, double, single] of raw.matchAll(ATTRIBUTE)) {
    attributes.set(name.toLowerCase(), double ?? single ?? '');
  }
  return attributes;
}

const normalizePart = (name: string): string =>
  '/' + name.replace(/^\/+/, '').toLowerCase();

export function parseContentTypes(xml: string): ContentTypes {
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();

  for (const [, tag, rawAttributes] of xml.matchAll(ELEMENT)) {
    const attributes = attributesOf(rawAttributes);
    const contentType = attributes.get('contenttype');
    if (contentType === undefined) continue;
    if (tag === 'Default') {
      const extension = attributes.get('extension');
      if (extension !== undefined)
        defaults.set(extension.toLowerCase(), contentType);
    } else {
      const partName = attributes.get('partname');
      if (partName !== undefined)
        overrides.set(normalizePart(partName), contentType);
    }
  }

  return {
    resolve(entryName) {
      const override = overrides.get(normalizePart(entryName));
      if (override !== undefined) return override;
      const dot = entryName.lastIndexOf('.');
      return dot === -1
        ? undefined
        : defaults.get(entryName.slice(dot + 1).toLowerCase());
    },
  };
}
