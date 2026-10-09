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
  reason?: 'PACKAGE_VERSION_CHANGED' | 'SLIDE_IDS_CHANGED';
  previous_version?: string;
  active_version?: string;
};

export async function detectLmsEditionMismatch(params: {
  bucket: R2Bucket | null | undefined;
  contentType: unknown;
  activePrefix: unknown;
  empresaId: number;
  cursoId: number;
  cmiJson: unknown;
}): Promise<LmsEditionMismatch | null> {
  if (String(params.contentType ?? '').toLowerCase() !== 'scorm') return null;
  if (!params.bucket || typeof params.activePrefix !== 'string') return null;
  const prefix = params.activePrefix.trim();
  const tenantPrefix = `lms/scorm/${params.empresaId}/${params.cursoId}/`;
  if (!Number.isSafeInteger(params.empresaId) || params.empresaId <= 0 ||
      !Number.isSafeInteger(params.cursoId) || params.cursoId <= 0 ||
      !prefix.startsWith(tenantPrefix) || prefix.includes('..') || prefix.includes('\\')) return null;

  let priorTotal: number | null = null;
  let priorPackageVersion: string | null = null;
  let priorSlideIds: string[] | null = null;
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

    // Native Factory snapshots carry their original authored package version.
    // A 46-slide replacement can be incompatible with a previous 46-slide
    // edition; comparing only totals cannot establish transferability.
    const saved = cmi['cmi.suspend_data'];
    if (typeof saved === 'string' && saved.length <= 65_536) {
      try {
        const native = JSON.parse(saved) as Record<string, unknown>;
        if (native && typeof native === 'object' && !Array.isArray(native)) {
          const version = native.p;
          if (typeof version === 'string' && version.length > 0 && version.length <= 200) {
            priorPackageVersion = version;
          }
          if (Array.isArray(native.ids) && native.ids.length === priorTotal &&
              native.ids.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
            priorSlideIds = native.ids as string[];
          }
        }
      } catch {
        // Legacy SCORM suspend_data formats may not be JSON; totals are still
        // comparable, but never invent an edition identity from their cursor.
      }
    }
  } catch {
    return null;
  }

  try {
    const key = `${prefix.endsWith('/') ? prefix : `${prefix}/`}airtrust-completion-manifest.json`;
    const object = await params.bucket.get(key);
    if (!object || object.size > 100_000) return null;
    const manifest = JSON.parse(await object.text()) as {
      packageVersion?: unknown;
      content?: { requiredSlides?: unknown };
    };
    const requiredSlides = manifest?.content?.requiredSlides;
    if (!Array.isArray(requiredSlides) || requiredSlides.length < 1 ||
      requiredSlides.length > 1000 || !requiredSlides.every((x) => typeof x === 'string')) {
      return null;
    }
    const activeTotal = requiredSlides.length;
    if (activeTotal !== priorTotal) {
      return { required: true, previous_total: priorTotal, active_total: activeTotal };
    }

    // Same slide count is not sufficient evidence of edition compatibility.
    // Legacy snapshots without an explicit version remain inconclusive; this
    // guard does not mislabel them as proven compatible.
    const activeVersion = manifest?.packageVersion;
    if (priorSlideIds && priorSlideIds.some((id, i) => id !== requiredSlides[i])) {
      return {
        required: true, previous_total: priorTotal, active_total: activeTotal,
        reason: 'SLIDE_IDS_CHANGED',
      };
    }
    if (priorPackageVersion && typeof activeVersion === 'string' &&
        activeVersion.length > 0 && priorPackageVersion !== activeVersion) {
      return {
        required: true, previous_total: priorTotal, active_total: activeTotal,
        reason: 'PACKAGE_VERSION_CHANGED',
        previous_version: priorPackageVersion,
        active_version: activeVersion,
      };
    }
    return null;
  } catch {
    // Unavailable manifests are not proof of an edition mismatch.
    return null;
  }
}
