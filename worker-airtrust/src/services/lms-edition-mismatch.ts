import { parseScormLocationPair } from '../lib/lms/lms-progress-guardrails';

/**
 * A previous SCORM completion belongs to a different edition if its persisted
 * authored total does not match the active, server-stored completion manifest.
 * Neither score nor a 100% badge proves equivalence across package editions.
 */
export type LmsEditionMismatch = {
  required: true;
  previous_total: number;
  active_total: number;
  reason?: 'PACKAGE_VERSION_CHANGED' | 'SLIDE_IDS_CHANGED' | 'PACKAGE_SHA_CHANGED';
  previous_version?: string;
  active_version?: string;
};

export async function detectLmsEditionMismatch(params: {
  bucket: R2Bucket | null | undefined;
  contentType: unknown;
  activePrefix: unknown;
  empresaId: number;
  cursoId: number;
  matriculaId?: number;
  cmiJson: unknown;
  suspendData?: unknown;
  db?: D1Database;
  enrollmentStartedAt?: unknown;
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
    const inline = cmi['cmi.suspend_data'];
    const saved = typeof inline === 'string' && inline.trim() ? inline : params.suspendData;
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
      // Factory's runtime engine identifier in suspend_data.p may differ from
      // the authored edition identifier in the manifest. Only an immutable,
      // same-enrollment handoff tied to the exact ACTIVE package SHA and current
      // cycle proves that later SCORM commits belong to the active edition.
      if (params.db && Number.isSafeInteger(params.matriculaId) &&
          Number(params.matriculaId) > 0) {
        try {
          const activeHandoff = await params.db.prepare(`
            SELECT h.id
              FROM lms_scorm_edition_handoffs h
              JOIN lms_matriculas m ON m.id=h.matricula_id
                AND m.empresa_id=h.empresa_id AND m.curso_id=h.curso_id
                AND m.deleted_at IS NULL AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
              JOIN lms_matricula_ciclos cy ON cy.id=h.ciclo_id
                AND cy.empresa_id=h.empresa_id AND cy.matricula_id=m.id
                AND cy.curso_id=m.curso_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
              JOIN lms_cursos c ON c.id=m.curso_id
                AND c.empresa_id=m.empresa_id AND c.deleted_at IS NULL
                AND c.tipo_conteudo='scorm'
              JOIN lms_scorm_package_versions p ON p.empresa_id=c.empresa_id
                AND p.curso_id=c.id AND p.r2_prefix=c.scorm_package_r2_prefix
                AND p.status='ACTIVE' AND p.package_sha256=h.target_package_sha256
              JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id
                AND ps.empresa_id=m.empresa_id
              WHERE h.empresa_id=? AND h.curso_id=? AND h.matricula_id=?
                AND h.target_package_prefix=? AND c.scorm_package_r2_prefix=?
                AND datetime(ps.last_commit_at)>=datetime(h.created_at)
                -- Do not select a historical handoff when a later handoff in
                -- the same cycle targets another package (A -> B -> rollback A).
                AND h.id = (
                  SELECT MAX(h_latest.id)
                  FROM lms_scorm_edition_handoffs h_latest
                  WHERE h_latest.empresa_id=h.empresa_id
                    AND h_latest.matricula_id=h.matricula_id
                    AND h_latest.ciclo_id=h.ciclo_id
                )
              ORDER BY h.id DESC LIMIT 1
          `).bind(params.empresaId, params.cursoId, params.matriculaId,
            prefix, prefix).first<{ id: number }>();
          if (activeHandoff && Number.isSafeInteger(activeHandoff.id) &&
              activeHandoff.id > 0) return null;
        } catch {
          // Missing/inaccessible provenance never turns a mismatch into approval.
        }
      }
      return {
        required: true, previous_total: priorTotal, active_total: activeTotal,
        reason: 'PACKAGE_VERSION_CHANGED',
        previous_version: priorPackageVersion,
        active_version: activeVersion,
      };
    }
    // Legacy SCORM may omit package identity. A replacement of equal slide
    // count is proven only when the enrolled learner began BEFORE activation
    // and the previous candidate has a different immutable SHA.
    if (params.db && typeof params.enrollmentStartedAt === 'string') {
      try {
        const lineage = await params.db.prepare(
          `SELECT active.package_sha256 AS active_sha,
                  previous.package_sha256 AS previous_sha,
                  active.activated_at AS activated_at
             FROM lms_scorm_package_versions active
             JOIN lms_scorm_package_versions previous
               ON previous.id = active.previous_active_package_id
              AND previous.empresa_id = active.empresa_id
              AND previous.curso_id = active.curso_id
            WHERE active.empresa_id = ? AND active.curso_id = ?
              AND active.status = 'ACTIVE' AND active.r2_prefix = ?
            LIMIT 1`,
        ).bind(params.empresaId, params.cursoId, prefix).first<{
          active_sha: string; previous_sha: string; activated_at: string | null;
        }>();
        const toTime = (value: string | null) => Date.parse(
          value ? (value.includes('T') ? value : value.replace(' ', 'T') + 'Z') : '',
        );
        const start = toTime(params.enrollmentStartedAt);
        const activation = toTime(lineage?.activated_at ?? null);
        if (lineage && /^[0-9a-f]{64}$/i.test(lineage.active_sha) &&
            /^[0-9a-f]{64}$/i.test(lineage.previous_sha) &&
            lineage.active_sha !== lineage.previous_sha &&
            Number.isFinite(start) && Number.isFinite(activation) &&
            start < activation) {
          return { required: true, previous_total: priorTotal, active_total: activeTotal,
            reason: 'PACKAGE_SHA_CHANGED' };
        }
      } catch {
        // Missing provenance cannot authorize a reset.
      }
    }
    return null;
  } catch {
    // Unavailable manifests are not proof of an edition mismatch.
    return null;
  }
}
