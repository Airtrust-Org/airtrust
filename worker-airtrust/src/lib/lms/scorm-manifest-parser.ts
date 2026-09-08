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
  const resources = [...manifestXml.matchAll(resourceTag)].map((match) => match[0]);

  // The organization item is the strongest launch signal: it names the
  // resource the learner actually enters. Resolve it before any positional
  // fallback so a preceding asset resource cannot become the launch file.
  const item = new RegExp(`<${TAG_PREFIX}item\\b[^>]*>`, 'i').exec(manifestXml)?.[0];
  const identifierRef = item ? parseQuotedAttribute(item, 'identifierref') : null;
  if (identifierRef) {
    for (const resource of resources) {
      if (parseQuotedAttribute(resource, 'identifier') !== identifierRef) continue;
      const href = parseQuotedAttribute(resource, 'href');
      if (href) return href;
    }
  }

  // When the organization does not provide a usable identifierref, prefer a
  // resource explicitly declared as a SCO. SCORM packages commonly list
  // support assets before the SCO resource; selecting the first href blindly
  // can launch CSS/media/auxiliary HTML instead of the course entry point.
  for (const resource of resources) {
    const scormType = parseQuotedAttribute(resource, 'scormtype')?.trim().toLowerCase();
    const href = parseQuotedAttribute(resource, 'href');
    if (scormType === 'sco' && href) return href;
  }

  // Compatibility fallback for older packages that omit adlcp:scormtype but
  // still expose a single launchable resource.
  for (const resource of resources) {
    const href = parseQuotedAttribute(resource, 'href');
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
