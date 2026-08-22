/**
 * Single source of truth for reading a SCORM imsmanifest.xml's launch file
 * and version. Shared between the Quality Gate candidate validator
 * (lms-package-validator.ts) and the legacy structured-upload path
 * (lms-cursos-legacy.ts), which previously carried their own divergent
 * copies — the legacy one matched only the first <resource href="..."> with
 * a single non-global regex and double-quotes only, missing packages the
 * Quality Gate's matchAll + identifierref fallback correctly resolves.
 *
 * Tag names may carry an XML namespace prefix (e.g. <ns0:resource>,
 * <ns0:item> — a valid, common SCORM 1.2 authoring pattern when a manifest
 * declares xmlns:ns0="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
 * instead of using it as the default, unprefixed namespace). The element
 * regexes below tolerate an optional "prefix:" before the local name;
 * attribute names (href, identifier, identifierref) are not namespaced in
 * observed real packages and are matched unprefixed, as before.
 */

const TAG_PREFIX = '(?:[A-Za-z][\\w.-]*:)?';

export function parseQuotedAttribute(tag: string, attribute: string): string | null {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escapedAttribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

export function resolveScormLaunchFileHref(manifestXml: string): string | null {
  const resourceTag = new RegExp(`<${TAG_PREFIX}resource\\b[^>]*>`, 'gi');
  for (const resource of manifestXml.matchAll(resourceTag)) {
    const href = parseQuotedAttribute(resource[0], 'href');
    if (href) return href;
  }

  const item = new RegExp(`<${TAG_PREFIX}item\\b[^>]*>`, 'i').exec(manifestXml)?.[0];
  if (!item) return null;
  const identifierRef = parseQuotedAttribute(item, 'identifierref');
  if (!identifierRef) return null;

  for (const resource of manifestXml.matchAll(resourceTag)) {
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
