import { parseScormLocationPair } from './lms-progress-guardrails';
import { planScormActiveResume, type ScormActiveResumePlan } from './lms-scorm-active-resume-plan';

/**
 * Read-only preview. No change to CMI, enrollment, cycle or package.
 * A governed archival transaction MUST precede any writes into the new edition.
 */
export async function readScormActiveResumeProposal(params: {
  db: D1Database; bucket: R2Bucket | null | undefined;
  empresaId: number; cursoId: number; matriculaId: number;
  cycleId: number;
  activePrefix: string | null;
  cycleStartedAt: string | null | undefined;
  cmiJson: string | null | undefined;
  /** Read append-only handoff provenance only when the governed schema is enabled. */
  handoffHistoryEnabled?: boolean;
}): Promise<ScormActiveResumePlan | null> {
  const { empresaId, cursoId, matriculaId, cycleId, bucket, activePrefix } = params;
  const root = 'lms/scorm/' + empresaId + '/' + cursoId + '/';
  const isPositiveId = (id: number) => Number.isSafeInteger(id) && id > 0;
  if (!isPositiveId(empresaId) || !isPositiveId(cursoId) ||
      !isPositiveId(matriculaId) || !isPositiveId(cycleId) ||
      !bucket || !activePrefix || !activePrefix.startsWith(root) ||
      activePrefix.includes('..') || activePrefix.includes('\\') ||
      !activePrefix.endsWith('/')) return null;

  // Confirm the exact tenant/enrollment/course/current-cycle/active-edition
  // tuple before reading any R2 manifest. A valid prefix alone is not scope.
  let activePackageSha256: string | null = null;
  try {
    const activePackage = await params.db.prepare(`
      SELECT p.package_sha256
      FROM lms_matriculas m
      JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
        AND cy.curso_id=m.curso_id
      JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
        AND c.deleted_at IS NULL AND c.tipo_conteudo='scorm'
      JOIN lms_scorm_package_versions p ON p.empresa_id=c.empresa_id
        AND p.curso_id=c.id AND p.r2_prefix=c.scorm_package_r2_prefix
        AND p.status='ACTIVE'
      WHERE m.id=? AND m.empresa_id=? AND m.curso_id=? AND m.deleted_at IS NULL
        AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND m.qualificacao_historico_id IS NULL
        AND cy.id=? AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
        AND c.scorm_package_r2_prefix=?
      ORDER BY p.id DESC LIMIT 1`,
    ).bind(matriculaId, empresaId, cursoId, cycleId, activePrefix)
      .first<{package_sha256:string|null}>();
    if (typeof activePackage?.package_sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(activePackage.package_sha256)) {
      activePackageSha256 = activePackage.package_sha256;
    }
  } catch {
    return null;
  }
  if (!activePackageSha256) return null;

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
  let previousPackageSha256: string | null = null;
  let handoffHistoryUnavailable = false;
  if (params.handoffHistoryEnabled) {
    try {
      const handoff = await params.db.prepare(
        `SELECT target_package_prefix AS r2_prefix,target_package_sha256 AS package_sha256
         FROM lms_scorm_edition_handoffs
         WHERE empresa_id=? AND curso_id=? AND matricula_id=? AND ciclo_id=?
         ORDER BY id DESC LIMIT 1`,
      ).bind(empresaId, cursoId, matriculaId, cycleId)
        .first<{r2_prefix:string;package_sha256:string}>();
      if (handoff) {
        if (handoff.r2_prefix.startsWith(root) && handoff.r2_prefix.endsWith('/') &&
            !handoff.r2_prefix.includes('..') && !handoff.r2_prefix.includes('\\') &&
            /^[a-f0-9]{64}$/.test(handoff.package_sha256)) {
          previousPrefix = handoff.r2_prefix;
          previousPackageSha256 = handoff.package_sha256;
        } else {
          handoffHistoryUnavailable = true;
        }
      }
    } catch {
      // If the enabled handoff ledger cannot be read, never infer a stale
      // cycle-start package as the source of CMI written after a handoff.
      handoffHistoryUnavailable = true;
    }
  }
  if (!previousPrefix && !handoffHistoryUnavailable &&
      typeof params.cycleStartedAt === 'string' && params.cycleStartedAt.trim()) {
    try {
      const row = await params.db.prepare(
        'SELECT p.r2_prefix,p.package_sha256 FROM lms_scorm_package_audit_log a ' +
        'JOIN lms_scorm_package_versions p ON p.id = a.package_id ' +
        'AND p.empresa_id = a.empresa_id AND p.curso_id = a.curso_id ' +
        'WHERE a.empresa_id = ? AND a.curso_id = ? AND a.action = \'ACTIVATED\' ' +
        'AND datetime(a.created_at) <= datetime(?) ' +
        'ORDER BY a.created_at DESC, a.id DESC LIMIT 1',
      ).bind(empresaId, cursoId, params.cycleStartedAt)
        .first<{ r2_prefix: string | null; package_sha256: string | null }>();
      previousPrefix = row?.r2_prefix ?? null;
      previousPackageSha256 = row?.package_sha256 ?? null;
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
    cycleId: params.cycleId ?? null,
    activePackageSha256, previousPackageSha256,
  });
}
