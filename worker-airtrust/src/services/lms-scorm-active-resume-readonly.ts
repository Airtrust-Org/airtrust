import { parseScormLocationPair } from './lms-progress-guardrails';
import { planScormActiveResume, type ScormActiveResumePlan } from './lms-scorm-active-resume-plan';

/**
 * Read-only preview. No change to CMI, enrollment, cycle or package.
 * A governed archival transaction MUST precede any writes into the new edition.
 */
export async function readScormActiveResumeProposal(params: {
  db: D1Database; bucket: R2Bucket | null | undefined;
  empresaId: number; cursoId: number;
  activePrefix: string | null;
  cycleStartedAt: string | null | undefined;
  cmiJson: string | null | undefined;
}): Promise<ScormActiveResumePlan | null> {
  const { empresaId, cursoId, bucket, activePrefix } = params;
  const root = 'lms/scorm/' + empresaId + '/' + cursoId + '/';
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(cursoId) || cursoId <= 0 ||
      !bucket || !activePrefix || !activePrefix.startsWith(root) ||
      activePrefix.includes('..') || activePrefix.includes('\\') ||
      !activePrefix.endsWith('/')) return null;

  async function readSlides(prefix: string): Promise<string[] | null> {
    if (!prefix.startsWith(root) || !prefix.endsWith('/') ||
        prefix.includes('..') || prefix.includes('\\')) return null;
    try {
      const object = await bucket!.get(prefix + 'airtrust-completion-manifest.json');
      if (!object || object.size > 100_000) return null;
      const json = JSON.parse(await object.text()) as {
        content?: { requiredSlides?: unknown };
      };
      const slideIds = json?.content?.requiredSlides;
      if (!Array.isArray(slideIds) || slideIds.length < 1 || slideIds.length > 1000 ||
          !slideIds.every((id: unknown) =>
            typeof id === 'string' && id.length > 0 && id.length <= 256) ||
          new Set(slideIds).size !== slideIds.length) return null;
      return slideIds as string[];
    } catch {
      return null;
    }
  }

  const activeSlideIds = await readSlides(activePrefix);
  if (!activeSlideIds) return null;
  let cmi: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(params.cmiJson || 'null') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      cmi = parsed as Record<string, unknown>;
    }
  } catch {
    // Never authorize credit for invalid or missing historical CMI.
  }
  const marker = parseScormLocationPair(
    cmi['cmi.location'] ?? cmi['cmi.core.lesson_location'],
  );

  let previousPrefix: string | null = null;
  if (typeof params.cycleStartedAt === 'string' && params.cycleStartedAt.trim()) {
    try {
      const row = await params.db.prepare(
        'SELECT p.r2_prefix FROM lms_scorm_package_audit_log a ' +
        'JOIN lms_scorm_package_versions p ON p.id = a.package_id ' +
        'AND p.empresa_id = a.empresa_id AND p.curso_id = a.curso_id ' +
        'WHERE a.empresa_id = ? AND a.curso_id = ? AND a.action = \'ACTIVATED\' ' +
        'AND datetime(a.created_at) <= datetime(?) ' +
        'ORDER BY a.created_at DESC, a.id DESC LIMIT 1',
      ).bind(empresaId, cursoId, params.cycleStartedAt)
        .first<{ r2_prefix: string | null }>();
      previousPrefix = row?.r2_prefix ?? null;
    } catch {
      previousPrefix = null;
    }
  }
  const previousSlideIds = previousPrefix ? await readSlides(previousPrefix) : null;
  const viewed = cmi['airtrust.viewed_slides'];
  const previousVisitedIds = previousSlideIds && Array.isArray(viewed)
    ? [...new Set(viewed.filter((value: unknown) =>
        Number.isSafeInteger(value) && Number(value) >= 1 &&
        Number(value) <= previousSlideIds.length).map((value: unknown) =>
          previousSlideIds[Number(value) - 1]))]
    : [];

  const previousPosition = marker && marker.current >= 1 &&
    marker.current <= marker.total ? marker.current : null;
  const previousCursorId = previousSlideIds && previousPosition &&
    previousPosition <= previousSlideIds.length
    ? previousSlideIds[previousPosition - 1] : null;
  return planScormActiveResume({
    activeSlideIds, previousSlideIds, previousVisitedIds,
    previousCursorId, previousPosition, previousTotal: marker?.total ?? null,
  });
}
