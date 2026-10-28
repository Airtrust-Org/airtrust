/**
 * Formative SCORM profile — import evidence, approve, preflight and roll back.
 *
 * Flow: upload (VALIDATED) → import signed staging journey → administrative
 * approval → activation (checks everything again, atomically).
 * Nothing in this file trusts the ZIP, the browser, or a client-sent verdict.
 */
import { ApiError } from '../../middleware/error-handler';
import {
  formativeAttestationDigest, FORMATIVE_PROFILE, verifyFormativeAttestation,
  type FormativeAttestation,
} from './lms-scorm-formative-profile';
import { parseStoredScormValidation } from './lms-scorm-package-filename';
import type { ScormQualityGateResult } from './lms-scorm-quality-gate';

export type FormativeStoredQuality = ScormQualityGateResult & {
  formativeAttestation?: FormativeAttestation;
  formativeCertification?: { status: 'CERTIFIED'; attestationSha256: string; verifiedAt: string };
};

export type FormativeCandidateRow = {
  id: string; empresa_id: number; curso_id: number; package_sha256: string; r2_prefix: string;
  launch_file: string; status: string; validation_result_json: string | null;
  assessment_policy: 'SCORED' | 'FORMATIVE' | null;
  certification_profile: typeof FORMATIVE_PROFILE | null;
  previous_active_package_id?: string | null;
};

const CANDIDATE_COLUMNS = `id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status,
  validation_result_json, assessment_policy, certification_profile, previous_active_package_id`;

export async function readCandidate(
  db: D1Database, empresaId: number, cursoId: number, packageId: string,
): Promise<FormativeCandidateRow> {
  const row = await db.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM lms_scorm_package_versions
      WHERE id = ? AND empresa_id = ? AND curso_id = ?`,
  ).bind(packageId, empresaId, cursoId).first<FormativeCandidateRow>();
  if (!row) throw new ApiError('Versão candidata não encontrada neste curso', 404, 'SCORM_CANDIDATE_NOT_FOUND');
  return row;
}

function profileContext(row: FormativeCandidateRow, runtimeSha: string | undefined) {
  const quality = parseStoredScormValidation<FormativeStoredQuality>(row.validation_result_json);
  const contract = quality?.formativeContract;
  if (row.certification_profile !== FORMATIVE_PROFILE || quality?.certificationProfile !== FORMATIVE_PROFILE ||
      row.assessment_policy !== 'FORMATIVE' || !contract?.eligible) {
    throw new ApiError('Este pacote não é elegível ao perfil formativo sem prova final', 409, 'FORMATIVE_PROFILE_NOT_ELIGIBLE');
  }
  return {
    quality: quality as FormativeStoredQuality,
    context: {
      packageSha256: row.package_sha256, runtimeSha: runtimeSha ?? '',
      requiredSlides: contract.requiredSlides, requiredActivities: contract.requiredActivities,
    },
  };
}

function exactConfirmation(row: FormativeCandidateRow, cursoId: number, confirm: {
  cursoId?: unknown; packageSha256?: unknown } | undefined) {
  if (!confirm || confirm.cursoId !== cursoId || confirm.packageSha256 !== row.package_sha256) {
    throw new ApiError('Confirme o curso e o SHA-256 exatos do pacote', 409, 'ACTIVATION_CONFIRMATION_REQUIRED');
  }
}

export async function importFormativeAttestation(params: {
  db: D1Database; empresaId: number; cursoId: number; packageId: string; userId: number | null;
  attestation: unknown; attestationSecret?: string; runtimeSha?: string;
}) {
  const row = await readCandidate(params.db, params.empresaId, params.cursoId, params.packageId);
  if (row.status !== 'VALIDATED') throw new ApiError('Somente candidatos VALIDATED recebem evidência', 409, 'SCORM_CANDIDATE_NOT_VALIDATED');
  const { quality, context } = profileContext(row, params.runtimeSha);
  const verdict = await verifyFormativeAttestation(params.attestation, context, params.attestationSecret);
  if (!verdict.ok) throw new ApiError('Atestação formativa inválida ou sem proveniência', 409, `FORMATIVE_ATTESTATION_${verdict.reason}`);
  const envelope = params.attestation as FormativeAttestation;
  const digest = await formativeAttestationDigest(envelope);
  const approved = await params.db.prepare(
    `SELECT 1 AS found FROM lms_scorm_package_approvals WHERE empresa_id=? AND curso_id=? AND package_id=?`,
  ).bind(params.empresaId, params.cursoId, row.id).first<{ found: number }>();
  if (approved) throw new ApiError('Pacote já aprovado; a evidência não pode ser substituída', 409, 'FORMATIVE_ALREADY_APPROVED');
  const stored: FormativeStoredQuality = {
    ...quality, formativeAttestation: envelope,
    formativeCertification: { status: 'CERTIFIED', attestationSha256: digest, verifiedAt: new Date().toISOString() },
  };
  const results = await params.db.batch([
    params.db.prepare(
      `UPDATE lms_scorm_package_versions SET validation_result_json=?, validation_finished_at=datetime('now')
        WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=? AND status='VALIDATED'
          AND validation_result_json=?`,
    ).bind(JSON.stringify(stored), row.id, params.empresaId, params.cursoId, row.package_sha256, row.validation_result_json),
    params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log (id,empresa_id,curso_id,package_id,action,actor_id,reason,created_at)
       SELECT ?,?,?,?,'VALIDATION_PASSED',?,?,datetime('now') WHERE changes()=1`,
    ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, row.id, params.userId,
      `FORMATIVE_ATTESTATION_IMPORTED:${digest}`),
  ]);
  if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
    throw new ApiError('A edição mudou durante a importação; recarregue e tente de novo', 409, 'FORMATIVE_IMPORT_RACE');
  }
  return { packageId: row.id, packageSha256: row.package_sha256, status: 'CERTIFIED' as const, attestationSha256: digest };
}

export async function approveFormativePackage(params: {
  db: D1Database; empresaId: number; cursoId: number; packageId: string; userId: number | null;
  confirm?: { cursoId?: unknown; packageSha256?: unknown };
  note: string; editorialReviewRef?: string | null;
  attestationSecret?: string; runtimeSha?: string;
}) {
  if (!Number.isSafeInteger(params.userId) || Number(params.userId) <= 0) {
    throw new ApiError('Aprovação exige um administrador autenticado', 403, 'FORMATIVE_APPROVER_REQUIRED');
  }
  const row = await readCandidate(params.db, params.empresaId, params.cursoId, params.packageId);
  exactConfirmation(row, params.cursoId, params.confirm);
  if (row.status !== 'VALIDATED') throw new ApiError('Somente candidatos VALIDATED podem ser aprovados', 409, 'SCORM_CANDIDATE_NOT_VALIDATED');
  const note = params.note.trim();
  if (note.length < 10 || note.length > 500) throw new ApiError('A justificativa deve ter entre 10 e 500 caracteres', 400, 'FORMATIVE_NOTE_INVALID');
  const ref = params.editorialReviewRef?.trim() || null;
  if (ref !== null && (ref.length < 6 || ref.length > 200)) throw new ApiError('Referência da revisão editorial inválida', 400, 'FORMATIVE_REVIEW_REF_INVALID');
  const { quality, context } = profileContext(row, params.runtimeSha);
  const envelope = quality.formativeAttestation;
  if (!envelope) throw new ApiError('Importe a evidência de homologação antes de aprovar', 409, 'FORMATIVE_ATTESTATION_MISSING');
  const verdict = await verifyFormativeAttestation(envelope, context, params.attestationSecret);
  if (!verdict.ok) throw new ApiError('Evidência de homologação inválida ou vencida', 409, `FORMATIVE_ATTESTATION_${verdict.reason}`);
  const digest = await formativeAttestationDigest(envelope);

  const existing = await params.db.prepare(
    `SELECT id, attestation_sha256 FROM lms_scorm_package_approvals
      WHERE empresa_id=? AND curso_id=? AND package_id=?`,
  ).bind(params.empresaId, params.cursoId, row.id).first<{ id: string; attestation_sha256: string }>();
  if (existing) {
    if (existing.attestation_sha256 !== digest) throw new ApiError('Aprovação existente aponta para outra evidência', 409, 'FORMATIVE_APPROVAL_CONFLICT');
    return { approvalId: existing.id, packageId: row.id, packageSha256: row.package_sha256, alreadyApproved: true };
  }
  const approvalId = crypto.randomUUID();
  const results = await params.db.batch([
    params.db.prepare(
      `INSERT INTO lms_scorm_package_approvals
         (id,empresa_id,curso_id,package_id,package_sha256,certification_profile,attestation_sha256,
          editorial_review_ref,approver_id,approval_note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(approvalId, params.empresaId, params.cursoId, row.id, row.package_sha256, FORMATIVE_PROFILE,
      digest, ref, params.userId, note),
    params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log (id,empresa_id,curso_id,package_id,action,actor_id,reason,created_at)
       SELECT ?,?,?,?,'VALIDATION_PASSED',?,?,datetime('now') WHERE changes()=1`,
    ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, row.id, params.userId,
      `FORMATIVE_ADMIN_APPROVED:${approvalId}`),
  ]);
  if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
    throw new ApiError('A aprovação não foi gravada de forma atômica', 409, 'FORMATIVE_APPROVAL_RACE');
  }
  return { approvalId, packageId: row.id, packageSha256: row.package_sha256, alreadyApproved: false };
}

export type ActivationCheck = { id: string; ok: boolean; detail: string };
export type ActivationImpact = { terminalToFreeze: number; inProgress: number; notStarted: number };
export type ActivationPreflight = {
  packageId: string; packageSha256: string; status: string;
  certificationProfile: string | null; assessmentPolicy: string | null;
  course: { id: number; titulo: string; tipoConteudo: string; publicado: boolean; currentPolicy: string; masteryScore: number | null };
  active: { packageId: string; packageSha256: string; policy: string | null } | null;
  checks: ActivationCheck[]; impact: ActivationImpact; canActivate: boolean;
  /** SCORED when a regular edition replaces a formative one; null = policy untouched. */
  incomingPolicy: 'SCORED' | 'FORMATIVE' | null;
};

async function cycleImpact(db: D1Database, empresaId: number, cursoId: number): Promise<ActivationImpact> {
  const rows = await db.prepare(
    `SELECT status, COUNT(*) AS n FROM lms_matricula_ciclos
      WHERE empresa_id=? AND deleted_at IS NULL AND assessment_policy IS NULL
        AND (curso_id=? OR matricula_id IN (SELECT m.id FROM lms_matriculas m WHERE m.empresa_id=? AND m.curso_id=?))
      GROUP BY status`,
  ).bind(empresaId, cursoId, empresaId, cursoId).all<{ status: string; n: number }>();
  const impact: ActivationImpact = { terminalToFreeze: 0, inProgress: 0, notStarted: 0 };
  for (const row of rows.results ?? []) {
    const n = Number(row.n) || 0;
    if (row.status === 'EM_ANDAMENTO') impact.inProgress += n;
    else if (row.status === 'NAO_INICIADO') impact.notStarted += n;
    else impact.terminalToFreeze += n;
  }
  return impact;
}

/**
 * Single source of truth for "may this candidate replace the course's active
 * edition under the formative profile". Used by the preflight screen AND the
 * activation itself, so the UI can never disagree with the server.
 */
export async function evaluateFormativeActivation(params: {
  db: D1Database; empresaId: number; cursoId: number; packageId: string;
  attestationSecret?: string; runtimeSha?: string;
}): Promise<ActivationPreflight & { row: FormativeCandidateRow }> {
  const row = await readCandidate(params.db, params.empresaId, params.cursoId, params.packageId);
  const course = await params.db.prepare(
    `SELECT id, titulo, tipo_conteudo, publicado, scorm_assessment_policy, scorm_mastery_score
       FROM lms_cursos WHERE id=? AND empresa_id=? AND deleted_at IS NULL`,
  ).bind(params.cursoId, params.empresaId).first<{
    id: number; titulo: string; tipo_conteudo: string; publicado: number;
    scorm_assessment_policy: 'SCORED' | 'FORMATIVE'; scorm_mastery_score: number | null;
  }>();
  if (!course) throw new ApiError('Curso não encontrado', 404, 'UPLOAD_COURSE_INVALID');
  const active = await params.db.prepare(
    `SELECT id, package_sha256, assessment_policy FROM lms_scorm_package_versions
      WHERE empresa_id=? AND curso_id=? AND status='ACTIVE'`,
  ).bind(params.empresaId, params.cursoId).first<{ id: string; package_sha256: string; assessment_policy: string | null }>();

  const checks: ActivationCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  add('COURSE_IDENTITY', course.tipo_conteudo === 'scorm', `Curso ${course.id}: ${course.titulo}`);
  add('CANDIDATE_VALIDATED', row.status === 'VALIDATED', `Status ${row.status}`);
  add('NOT_ALREADY_ACTIVE', row.status !== 'ACTIVE' && active?.id !== row.id, active ? `Ativa: ${active.package_sha256.slice(0, 12)}` : 'Sem edição ativa');

  let incomingPolicy: 'SCORED' | 'FORMATIVE' | null = null;
  if (row.certification_profile === FORMATIVE_PROFILE) {
    incomingPolicy = 'FORMATIVE';
    let attestationOk = false;
    let approvalOk = false;
    try {
      const { quality, context } = profileContext(row, params.runtimeSha);
      add('PROFILE_ELIGIBLE', true, 'Contrato formativo sem prova final comprovado pelo servidor');
      const envelope = quality.formativeAttestation;
      const verdict = envelope ? await verifyFormativeAttestation(envelope, context, params.attestationSecret)
        : ({ ok: false, reason: 'ATTESTATION_MISSING' } as const);
      attestationOk = verdict.ok;
      add('JOURNEY_EVIDENCE', verdict.ok, verdict.ok ? 'Jornada funcional real em staging verificada' : `Evidência: ${verdict.reason}`);
      if (envelope && verdict.ok) {
        const digest = await formativeAttestationDigest(envelope);
        const approval = await params.db.prepare(
          `SELECT attestation_sha256 FROM lms_scorm_package_approvals
            WHERE empresa_id=? AND curso_id=? AND package_id=? AND package_sha256=?`,
        ).bind(params.empresaId, params.cursoId, row.id, row.package_sha256).first<{ attestation_sha256: string }>();
        approvalOk = approval?.attestation_sha256 === digest;
      }
    } catch (error) {
      add('PROFILE_ELIGIBLE', false, error instanceof ApiError ? error.message : 'Perfil inválido');
    }
    add('ADMIN_APPROVAL', approvalOk, approvalOk ? 'Aprovação administrativa vinculada a este SHA' : 'Aprovação administrativa pendente');
    void attestationOk;
  } else if (active?.assessment_policy === 'FORMATIVE') {
    // A regular edition replacing a formative one must restore a real threshold.
    incomingPolicy = 'SCORED';
    add('SCORED_THRESHOLD_PRESENT', (course.scorm_mastery_score ?? 0) > 0,
      'A edição regular exige nota mínima positiva no curso');
  }
  // Impact is only meaningful (and only queried) when the activation moves the policy.
  const impact = incomingPolicy ? await cycleImpact(params.db, params.empresaId, params.cursoId)
    : { terminalToFreeze: 0, inProgress: 0, notStarted: 0 };
  const publicOk = checks.filter(c => c.id !== 'NOT_ALREADY_ACTIVE').every(c => c.ok) &&
    checks.find(c => c.id === 'NOT_ALREADY_ACTIVE')?.ok === true;
  return {
    packageId: row.id, packageSha256: row.package_sha256, status: row.status,
    certificationProfile: row.certification_profile, assessmentPolicy: row.assessment_policy,
    course: { id: course.id, titulo: course.titulo, tipoConteudo: course.tipo_conteudo,
      publicado: course.publicado === 1, currentPolicy: course.scorm_assessment_policy,
      masteryScore: course.scorm_mastery_score },
    active: active ? { packageId: active.id, packageSha256: active.package_sha256, policy: active.assessment_policy } : null,
    checks, impact, incomingPolicy, canActivate: publicOk, row,
  };
}

export function assertActivationConfirmation(
  preflight: Pick<ActivationPreflight, 'incomingPolicy' | 'impact'>,
  row: FormativeCandidateRow, cursoId: number,
  confirm: { cursoId?: unknown; packageSha256?: unknown; acknowledgeInProgress?: unknown } | undefined,
) {
  if (preflight.incomingPolicy === null) return;
  exactConfirmation(row, cursoId, confirm);
  if (preflight.impact.inProgress > 0 && confirm?.acknowledgeInProgress !== preflight.impact.inProgress) {
    throw new ApiError(
      `Há ${preflight.impact.inProgress} matrícula(s) em andamento que passarão a seguir a nova edição; confirme a quantidade`,
      409, 'ACTIVATION_IN_PROGRESS_ACK_REQUIRED');
  }
}

// ── Rollback ────────────────────────────────────────────────────────────────

export async function rollbackScormPackageVersion(params: {
  db: D1Database; bucket: R2Bucket; empresaId: number; cursoId: number; userId: number | null;
  confirm?: { cursoId?: unknown; restorePackageId?: unknown };
}) {
  const active = await params.db.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM lms_scorm_package_versions
      WHERE empresa_id=? AND curso_id=? AND status='ACTIVE'`,
  ).bind(params.empresaId, params.cursoId).first<FormativeCandidateRow>();
  if (!active?.previous_active_package_id) throw new ApiError('Não há edição anterior recuperável', 409, 'ROLLBACK_NO_PREVIOUS');
  const target = await params.db.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM lms_scorm_package_versions
      WHERE id=? AND empresa_id=? AND curso_id=? AND status='SUPERSEDED'`,
  ).bind(active.previous_active_package_id, params.empresaId, params.cursoId).first<FormativeCandidateRow>();
  if (!target) throw new ApiError('A edição anterior não está mais recuperável', 409, 'ROLLBACK_TARGET_UNAVAILABLE');
  if (params.confirm?.cursoId !== params.cursoId || params.confirm?.restorePackageId !== target.id) {
    throw new ApiError('Confirme o curso e a edição que será restaurada', 409, 'ROLLBACK_CONFIRMATION_REQUIRED');
  }
  const launch = await params.bucket.head(`${target.r2_prefix}${target.launch_file}`);
  if (!launch) throw new ApiError('Arquivos da edição anterior ausentes no armazenamento', 409, 'ROLLBACK_TARGET_ASSETS_MISSING');

  // Only a policy-aware activation moved the course policy; only then does the
  // rollback move it back. The restored edition was stamped by that activation.
  const policyAware = active.assessment_policy !== null && target.assessment_policy !== null;
  if (policyAware && target.assessment_policy === 'SCORED') {
    const course = await params.db.prepare(
      `SELECT scorm_mastery_score FROM lms_cursos WHERE id=? AND empresa_id=? AND deleted_at IS NULL`,
    ).bind(params.cursoId, params.empresaId).first<{ scorm_mastery_score: number | null }>();
    if ((course?.scorm_mastery_score ?? 0) <= 0) {
      throw new ApiError('Restaurar a edição pontuada exige nota mínima positiva no curso', 409, 'ROLLBACK_THRESHOLD_MISSING');
    }
  }
  const currentPolicy = `(SELECT c.scorm_assessment_policy FROM lms_cursos c
    WHERE c.id=? AND c.empresa_id=? AND c.deleted_at IS NULL)`;
  const stillActive = `EXISTS(SELECT 1 FROM lms_scorm_package_versions v
    WHERE v.id=? AND v.empresa_id=? AND v.curso_id=? AND v.status='ACTIVE')`;
  const freeze = policyAware ? [params.db.prepare(
    `UPDATE lms_matricula_ciclos SET assessment_policy=${currentPolicy}
      WHERE empresa_id=? AND assessment_policy IS NULL AND deleted_at IS NULL
        AND status NOT IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND (curso_id=? OR matricula_id IN (SELECT m.id FROM lms_matriculas m WHERE m.empresa_id=? AND m.curso_id=?))
        AND ${stillActive}`,
  ).bind(params.cursoId, params.empresaId, params.empresaId, params.cursoId, params.empresaId,
    params.cursoId, active.id, params.empresaId, params.cursoId)] : [];
  const auditRolled = crypto.randomUUID();
  const auditRestored = crypto.randomUUID();
  const results = await params.db.batch([
    ...freeze,
    params.db.prepare(
      `UPDATE lms_scorm_package_versions SET status='SUPERSEDED'
        WHERE id=? AND empresa_id=? AND curso_id=? AND status='ACTIVE'`,
    ).bind(active.id, params.empresaId, params.cursoId),
    params.db.prepare(
      `UPDATE lms_scorm_package_versions SET status='ACTIVE', activated_at=datetime('now'), activated_by=?
        WHERE id=? AND empresa_id=? AND curso_id=? AND status='SUPERSEDED' AND changes()=1`,
    ).bind(params.userId, target.id, params.empresaId, params.cursoId),
    params.db.prepare(
      `UPDATE lms_cursos SET scorm_package_r2_prefix=?, scorm_launch_file=?,
         scorm_assessment_policy=COALESCE(?,scorm_assessment_policy), updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND deleted_at IS NULL AND changes()=1
          AND EXISTS(SELECT 1 FROM lms_scorm_package_versions p WHERE p.id=? AND p.empresa_id=? AND p.curso_id=? AND p.status='ACTIVE')`,
    ).bind(target.r2_prefix, target.launch_file, policyAware ? target.assessment_policy : null,
      params.cursoId, params.empresaId, target.id, params.empresaId, params.cursoId),
    params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log (id,empresa_id,curso_id,package_id,action,actor_id,reason,created_at)
       SELECT ?,?,?,?,'ROLLED_BACK',?,?,datetime('now') WHERE changes()=1`,
    ).bind(auditRolled, params.empresaId, params.cursoId, active.id, params.userId, `RESTORED:${target.id}`),
    // The edition timeline derives "active at T" from ACTIVATED rows; keep it truthful.
    params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log (id,empresa_id,curso_id,package_id,action,actor_id,reason,created_at)
       SELECT ?,?,?,?,'ACTIVATED',?,?,datetime('now') WHERE changes()=1`,
    ).bind(auditRestored, params.empresaId, params.cursoId, target.id, params.userId, `ROLLBACK_RESTORE:${active.id}`),
    params.db.prepare(
      `DELETE FROM lms_completion_diagnostics_snapshots WHERE empresa_id=? AND curso_id=?
         AND EXISTS(SELECT 1 FROM lms_scorm_package_audit_log a WHERE a.id=? AND a.empresa_id=? AND a.curso_id=? AND a.action='ACTIVATED')`,
    ).bind(params.empresaId, params.cursoId, auditRestored, params.empresaId, params.cursoId),
  ]);
  const at = freeze.length;
  if (results[at]?.meta?.changes !== 1 || results[at + 1]?.meta?.changes !== 1 ||
      results[at + 2]?.meta?.changes !== 1 || results[at + 3]?.meta?.changes !== 1 ||
      results[at + 4]?.meta?.changes !== 1) {
    throw new ApiError('A restauração mudou durante a execução; confira o estado do curso', 409, 'ROLLBACK_RACE');
  }
  return { restoredPackageId: target.id, restoredPackageSha256: target.package_sha256, rolledBackPackageId: active.id };
}
