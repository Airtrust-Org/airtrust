/**
 * Single source of truth for reading a SCORM imsmanifest.xml's launch file
 * and version. Shared between the Quality Gate candidate validator
 * (lms-package-validator.ts) and the legacy structured-upload path
 * (lms-cursos-legacy.ts), which previously carried their own divergent
 * copies — the legacy one matched only the first <resource href="..."> with
 * a single non-global regex and double-quotes only, missing packages the
 * Quality Gate's matchAll + identifierref fallback correctly resolves.
 */

export function parseQuotedAttribute(tag: string, attribute: string): string | null {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escapedAttribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

export function resolveScormLaunchFileHref(manifestXml: string): string | null {
  for (const resource of manifestXml.matchAll(/<resource\b[^>]*>/gi)) {
    const href = parseQuotedAttribute(resource[0], 'href');
    if (href) return href;
  }

  const item = /<item\b[^>]*>/i.exec(manifestXml)?.[0];
  if (!item) return null;
  const identifierRef = parseQuotedAttribute(item, 'identifierref');
  if (!identifierRef) return null;

  for (const resource of manifestXml.matchAll(/<resource\b[^>]*>/gi)) {
    if (parseQuotedAttribute(resource[0], 'identifier') !== identifierRef) continue;
    const href = parseQuotedAttribute(resource[0], 'href');
    if (href) return href;
  }
  return null;
}

export function resolveScormVersion(manifestXml: string): '1.2' | '2004' {
  if (/adlcp:schemaversion[^>]*>\s*2004/i.test(manifestXml) || /SCORM\s*2004/i.test(manifestXml)) {
    return '2004';
  }
  return '1.2';
}
