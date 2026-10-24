import { ApiError } from '../../middleware/error-handler';

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export type ScormF0ProvisionRequest = {
  tenantId: number;
  courseId: number;
  packageId: string;
  packageSha256: string;
  enrollmentId: number;
  cycleId: number;
  runId: string;
  approvalReceiptSha256: string;
  runtimeSha: string;
  expiresAt: string;
  grantId: string;
  actorId: number;
};

export function assertScormF0ProvisionRequest(
  value: ScormF0ProvisionRequest, now = Date.now(),
): ScormF0ProvisionRequest {
  const until = Date.parse(value?.expiresAt ?? '');
  if (!Number.isSafeInteger(value?.tenantId) || value.tenantId <= 0 ||
      !Number.isSafeInteger(value?.courseId) || value.courseId <= 0 ||
      !Number.isSafeInteger(value?.enrollmentId) || value.enrollmentId <= 0 ||
      !Number.isSafeInteger(value?.cycleId) || value.cycleId <= 0 ||
      !Number.isSafeInteger(value?.actorId) || value.actorId <= 0 ||
      !UUID.test(value?.packageId ?? '') || !UUID.test(value?.runId ?? '') ||
      !HEX64.test(value?.packageSha256 ?? '') ||
      !HEX64.test(value?.approvalReceiptSha256 ?? '') ||
      !HEX40.test(value?.runtimeSha ?? '') ||
      !/^[1-9][0-9]{0,15}$/.test(value?.grantId ?? '') ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value?.expiresAt ?? '') ||
      !Number.isFinite(until) || !Number.isFinite(now) ||
      until < now + 60_000 || until > now + 3_600_000) {
    throw new ApiError('SCORM_F0_PROVISION_SCOPE_OR_EXPIRY_INVALID', 409);
  }
  return value;
}

/**
 * Staging-only F0 binding for a clean, already-provisioned *synthetic*
 * enrollment and its current cycle. The caller must first authenticate as
 * a tenant admin, prove the staging-only readback secret and the exact F5
 * Worker grant (tenant/course/ZIP/runtime/expiry).
 *
 * D1.batch executes atomically. The audit is SELECT-dependent on the binding
 * insert, so unsuccessful attempts cannot create fictitious success audits.
 * Neither this operation nor its caller can activate a package, complete a
 * training, issue a certificate, or create a learner.
 */
export async function provisionScormF0QaBinding(
  db: D1Database,
  requested: ScormF0ProvisionRequest,
  now = Date.now(),
) {
  const input = assertScormF0ProvisionRequest(requested, now);
  const id = crypto.randomUUID();
  const audit = JSON.stringify({
    source: 'SCORM_F0_STAGING_CANDIDATE_BINDING_V1',
    runId: input.runId, grantId: input.grantId,
    packageId: input.packageId, packageSha256: input.packageSha256,
    enrollmentId: input.enrollmentId, cycleId: input.cycleId,
    expiresAt: input.expiresAt, runtimeSha: input.runtimeSha,
    activation: false, certification: false,
  });
  const created = await db.batch([
    db.prepare(
      `INSERT INTO lms_scorm_qa_evidence_bindings
         (id,empresa_id,curso_id,package_id,package_sha256,matricula_id,
          ciclo_id,staging_runtime_sha,approval_receipt_sha256,run_id,
          expires_at,launched_package_sha256,last_committed_package_sha256,
          status,synthetic)
       SELECT ?,c.empresa_id,c.id,p.id,p.package_sha256,m.id,cy.id,?,?,?,?,
              NULL,NULL,'ACTIVE',1
         FROM lms_cursos c
         JOIN lms_scorm_package_versions p
           ON p.empresa_id=c.empresa_id AND p.curso_id=c.id
         JOIN lms_matriculas m
           ON m.empresa_id=c.empresa_id AND m.curso_id=c.id
         JOIN funcionarios f
           ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
         JOIN lms_matricula_ciclos cy
           ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
          AND cy.curso_id=m.curso_id
        WHERE c.empresa_id=? AND c.id=? AND c.deleted_at IS NULL
          AND c.ativo=1 AND c.publicado=0
          AND c.titulo LIKE 'QA SCORM %'
          AND p.id=? AND p.package_sha256=? AND p.status='VALIDATED'
          AND p.r2_prefix!=COALESCE(c.scorm_package_r2_prefix,'')
          AND m.id=? AND m.status='NAO_INICIADO' AND m.deleted_at IS NULL
          AND m.observacoes=? AND m.qualificacao_historico_id IS NULL
          AND m.score_final IS NULL AND COALESCE(m.progresso_pct,0)=0
          AND COALESCE(m.tentativas,0)=0
          AND f.deleted_at IS NULL AND f.nome LIKE 'QA-PARTICIPANTE-%'
          AND cy.id=? AND cy.ciclo_atual=1 AND cy.numero_ciclo=1
          AND cy.status='NAO_INICIADO' AND cy.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM lms_progresso_scorm sp
                         WHERE sp.empresa_id=m.empresa_id
                           AND sp.matricula_id=m.id)
          AND NOT EXISTS(SELECT 1 FROM qualificacoes_historico q
                         WHERE q.empresa_id=m.empresa_id
                           AND q.lms_matricula_id=m.id
                           AND q.deleted_at IS NULL)
          AND NOT EXISTS(SELECT 1 FROM lms_scorm_qa_evidence_bindings b
                         WHERE b.empresa_id=m.empresa_id
                           AND b.matricula_id=m.id AND b.status='ACTIVE')`,
    ).bind(
      id, input.runtimeSha, input.approvalReceiptSha256,
      input.runId, input.expiresAt, input.tenantId, input.courseId,
      input.packageId, input.packageSha256, input.enrollmentId,
      `QA_SCORM_F0:${input.runId}`, input.cycleId,
    ),
    db.prepare(
      `INSERT INTO audit_logs
         (user_id,action,entity_type,entity_id,old_values,new_values,
          empresa_id,created_at)
       SELECT ?,'SCORM_F0_STAGING_BINDING_CREATED',
              'lms_scorm_qa_evidence_bindings',NULL,NULL,?,
              b.empresa_id,datetime('now')
         FROM lms_scorm_qa_evidence_bindings b
        WHERE b.id=? AND b.empresa_id=? AND b.curso_id=?
          AND b.matricula_id=? AND b.package_id=?`,
    ).bind(input.actorId, audit, id, input.tenantId,
      input.courseId, input.enrollmentId, input.packageId),
  ]);
  if (Number(created[0]?.meta?.changes) !== 1 ||
      Number(created[1]?.meta?.changes) !== 1) {
    throw new ApiError('SCORM_F0_SYNTHETIC_ENROLLMENT_NOT_ELIGIBLE', 409);
  }
  return {
    source: 'SCORM_F0_STAGING_CANDIDATE_BINDING_V1',
    bindingId: id, tenantId: input.tenantId, courseId: input.courseId,
    packageId: input.packageId, packageSha256: input.packageSha256,
    enrollmentId: input.enrollmentId, cycleId: input.cycleId,
    runId: input.runId, expiresAt: input.expiresAt,
    runtimeSha: input.runtimeSha, grantId: input.grantId,
    activePackageChanged: false, certificateIssued: false,
    completionWritten: false, sourceOfActualCandidateCommit: false,
  };
}
