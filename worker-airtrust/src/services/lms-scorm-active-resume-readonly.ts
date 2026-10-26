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
  /** Column suspend_data, used when cmi_json does not inline it. */
  suspendData?: string | null;
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
  const manifestSlideIds = previousPrefix ? await readSlides(previousPrefix) : null;
  // The learner's own Factory snapshot is self-describing: it carries the
  // stable unit IDs of the edition that wrote it. It is a navigation map even
  // when the historical R2 manifest/audit lineage is gone; a conflicting
  // manifest makes the provenance ambiguous, so neither map is used.
  const ownSnapshot = readNativeSnapshot(cmi, params.suspendData);
  const candidateIds = manifestSlideIds && ownSnapshot &&
    manifestSlideIds.join('\u0000') !== ownSnapshot.ids.join('\u0000')
    ? null : (manifestSlideIds ?? ownSnapshot?.ids ?? null);
  const markerPosition = marker && marker.current >= 1 &&
    marker.current <= marker.total ? marker.current : null;
  // lesson_location indexes the authored unit list only when both totals agree
  // (a 46-screen counter over 45 required units would shift every anchor);
  // otherwise only the package-authored cursor of the same snapshot can anchor.
  const markerIndexesIds = Boolean(candidateIds && markerPosition !== null &&
    marker?.total === candidateIds.length);
  const snapshotPosition = ownSnapshot && candidateIds && ownSnapshot.cursor !== null &&
    ownSnapshot.cursor < candidateIds.length ? ownSnapshot.cursor + 1 : null;
  const idAnchor = markerIndexesIds ? markerPosition
    : candidateIds && markerPosition === null ? snapshotPosition
    : candidateIds && snapshotPosition !== null ? snapshotPosition : null;
  // Without a trustworthy ID anchor the plan degrades to a proportional,
  // non-certifying suggestion over the learner's own location counter.
  const previousSlideIds = candidateIds && (idAnchor !== null || markerPosition === null)
    ? candidateIds : null;
  const fromSnapshot = Boolean(previousSlideIds && !manifestSlideIds);
  const viewed = cmi['airtrust.viewed_slides'];
  const viewedPositions: unknown[] = Array.isArray(viewed) && markerIndexesIds ? viewed
    : ownSnapshot && previousSlideIds ? ownSnapshot.visited.map((index) => index + 1)
    : Array.isArray(viewed) ? viewed : [];
  const previousVisitedIds = previousSlideIds
    ? [...new Set(viewedPositions.filter((value: unknown) =>
        Number.isSafeInteger(value) && Number(value) >= 1 &&
        Number(value) <= previousSlideIds.length).map((value: unknown) =>
          previousSlideIds[Number(value) - 1]))]
    : [];
  const previousPosition = previousSlideIds ? idAnchor : markerPosition;
  const previousCursorId = previousSlideIds && previousPosition &&
    previousPosition <= previousSlideIds.length
    ? previousSlideIds[previousPosition - 1] : null;
  return planScormActiveResume({
    activeSlideIds, previousSlideIds, previousVisitedIds,
    previousCursorId, previousPosition,
    previousTotal: previousSlideIds ? previousSlideIds.length : marker?.total ?? null,
    cycleId: params.cycleId ?? null,
    activePackageSha256,
    // A snapshot-only map has no verified package hash; never label it with one.
    previousPackageSha256: fromSnapshot ? null : previousPackageSha256,
  });
}

/** Factory/M8 suspend_data: `ids` (stable unit IDs), `a` (cursor index), `d` (visited indexes). */
function readNativeSnapshot(
  cmi: Record<string, unknown>, suspendData: string | null | undefined,
): { ids: string[]; cursor: number | null; visited: number[] } | null {
  const inline = cmi['cmi.suspend_data'];
  const raw = typeof inline === 'string' && inline.trim() ? inline : suspendData;
  if (typeof raw !== 'string' || raw.length > 65_536) return null;
  try {
    const state = JSON.parse(raw) as Record<string, unknown>;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    const ids = state.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000 ||
        !ids.every((id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 256) ||
        new Set(ids).size !== ids.length) return null;
    const inRange = (n: unknown): n is number =>
      Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) < ids.length;
    const visited = Array.isArray(state.d) && state.d.every(inRange) ? state.d as number[] : [];
    return { ids: ids as string[], cursor: inRange(state.a) ? state.a : null, visited };
  } catch {
    return null;
  }
}
