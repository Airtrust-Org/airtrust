import { parseScormLocationPair } from './lms-progress-guardrails';

/**
 * A previous SCORM completion belongs to a different edition if its persisted
 * authored total does not match the active, server-stored completion manifest.
 * Neither score nor a 100% badge proves equivalence across package editions.
 */
export type LmsEditionMismatch = {
  required: true;
  previous_total: number;
  active_total: number;
};

export async function detectLmsEditionMismatch(params: {
  bucket: R2Bucket | null | undefined;
  contentType: unknown;
  activePrefix: unknown;
  cmiJson: unknown;
}): Promise<LmsEditionMismatch | null> {
  if (String(params.contentType ?? '').toLowerCase() !== 'scorm') return null;
  if (!params.bucket || typeof params.activePrefix !== 'string') return null;
  const prefix = params.activePrefix.trim();
  if (!prefix.startsWith('lms/scorm/') || prefix.includes('..') || prefix.includes('\\')) return null;

  let priorTotal: number | null = null;
  try {
    const cmi = JSON.parse(String(params.cmiJson ?? '')) as Record<string, unknown>;
    if (!cmi || typeof cmi !== 'object' || Array.isArray(cmi)) return null;
    const location = parseScormLocationPair(
      cmi['cmi.location'] ?? cmi['cmi.core.lesson_location'],
    );
    const claimedTotal = cmi['airtrust.total_slides'];
    priorTotal = location?.total ??
      (Number.isInteger(claimedTotal) ? Number(claimedTotal) : null);
    if (priorTotal === null || priorTotal < 1 || priorTotal > 1000) return null;
    if (claimedTotal !== undefined && Number(claimedTotal) !== priorTotal) return null;
  } catch {
    return null;
  }

  try {
    const key = `${prefix.endsWith('/') ? prefix : `${prefix}/`}airtrust-completion-manifest.json`;
    const object = await params.bucket.get(key);
    if (!object || object.size > 100_000) return null;
    const manifest = JSON.parse(await object.text()) as {
      content?: { requiredSlides?: unknown };
    };
    const requiredSlides = manifest?.content?.requiredSlides;
    if (!Array.isArray(requiredSlides) || requiredSlides.length < 1 ||
      requiredSlides.length > 1000 || !requiredSlides.every((x) => typeof x === 'string')) {
      return null;
    }
    const activeTotal = requiredSlides.length;
    return activeTotal === priorTotal ? null : {
      required: true,
      previous_total: priorTotal,
      active_total: activeTotal,
    };
  } catch {
    // Unavailable manifests are not proof of an edition mismatch.
    return null;
  }
}
