import { ApiError } from '../../middleware/error-handler';
import { readScormQaCandidate } from './lms-scorm-candidate-preview';
import { assertScormF0BindingWitness } from './lms-scorm-f0-binding-contract';

/**
 * Staging-only, read-only QA evidence. NO cross-tenant fallback, no learner
 * bootstrap and no trusting a supplied package SHA as an enrollment binding.
 * The physical binding is provisioned by F0 under Schema V2 governance.
 */
export type ScormQaReadbackConfig = {
  environment: unknown;
  tenantId: number;
  authorizedTenant: string | undefined;
  secret: string | undefined;
  providedSecret: string | undefined;
  runtimeSha: string | undefined;
};

export function assertScormQaReadbackAccess(config: ScormQaReadbackConfig): void {
  const expectedTenant = Number(config.authorizedTenant);
  const secret = config.secret;
  const actual = config.providedSecret;
  // Constant work for equal-length comparisons, no secret values in errors.
  let mismatch = !secret || secret.length < 32 || !actual ||
    actual.length !== secret?.length;
  if (!mismatch && secret && actual) {
    let diff = 0;
    for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ actual.charCodeAt(i);
    mismatch = diff !== 0;
  }
  if (config.environment !== 'staging' ||
      !Number.isSafeInteger(expectedTenant) || expectedTenant <= 0 ||
      config.tenantId !== expectedTenant ||
      !/^[a-f0-9]{40}$/.test(config.runtimeSha ?? '') ||
      mismatch) {
    throw new ApiError('Leitura SCORM QA não autorizada', 403);
  }
}

export async function readScormQaBackendEvidence(params: {
  db: D1Database; empresaId: number; cursoId: number;
  packageId: string; packageSha256: string; matriculaId: number;
  runtimeSha: string;
}) {
  const { db, empresaId, cursoId, packageId, packageSha256, matriculaId, runtimeSha } = params;
  if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0 ||
      !/^[a-f0-9]{64}$/.test(packageSha256)) {
    throw new ApiError('Escopo QA inválido', 400);
  }
  const candidate = await readScormQaCandidate(db, {
    empresaId, cursoId, packageId, expectedSha: packageSha256,
  });
  // Explicit immutable candidate->enrollment->cycle binding: never infer
  // this association from a mutable course active pointer or CMI contents.
  // The synthetic flag alone does not prove the enrollment belongs to the
  // F0 QA participant. Mirror the F0 runtime's employee, enrollment marker,
  // unpublished course and incomplete-cycle guards before reading state.
  // The binding table is an optional, Schema-V2-governed staging capability:
  // query it directly only for protected QA. Avoid adding schema introspection
  // to every LMS request or bypassing the shared schema snapshot.
  let bind: {
    ciclo_id:number; staging_runtime_sha:string;
    approval_receipt_sha256:string; run_id:string; expires_at:string;
    launched_package_sha256:string|null;
    last_committed_package_sha256:string|null;
    matricula_status:string; numero_ciclo:number;
    enrollment_progress_pct:number|null;
    enrollment_completed_at:string|null;
    enrollment_score_final:number|null;
    enrollment_qualification_history_id:number|null;
    enrollment_attempts:number;
    cycle_attempts:number;
    cycle_score_final:number|null;
    cycle_qualification_history_id:number|null;
  } | null;
  try {
    bind = await db.prepare(
    `SELECT b.ciclo_id, b.staging_runtime_sha, b.approval_receipt_sha256,
            b.run_id, b.expires_at, b.launched_package_sha256,
            b.last_committed_package_sha256,
            m.status AS matricula_status,
            m.progresso_pct AS enrollment_progress_pct,
            m.data_conclusao AS enrollment_completed_at,
            m.score_final AS enrollment_score_final,
            m.qualificacao_historico_id AS enrollment_qualification_history_id,
            m.tentativas AS enrollment_attempts,
            cy.tentativas AS cycle_attempts,
            cy.score_final AS cycle_score_final,
            cy.qualificacao_historico_id AS cycle_qualification_history_id,
            cy.numero_ciclo
       FROM lms_scorm_qa_evidence_bindings b
       JOIN lms_matriculas m
         ON m.id = b.matricula_id AND m.empresa_id = b.empresa_id
         AND m.curso_id = b.curso_id AND m.deleted_at IS NULL
       JOIN funcionarios f
         ON f.id = m.funcionario_id AND f.empresa_id = b.empresa_id
         AND f.deleted_at IS NULL AND f.nome LIKE 'QA-PARTICIPANTE-%'
       JOIN lms_cursos c
         ON c.id = b.curso_id AND c.empresa_id = b.empresa_id
         AND c.deleted_at IS NULL AND c.publicado = 0
       JOIN lms_matricula_ciclos cy
         ON cy.id = b.ciclo_id AND cy.matricula_id = m.id
         AND cy.empresa_id = b.empresa_id AND cy.curso_id = b.curso_id
         AND cy.ciclo_atual = 1 AND cy.deleted_at IS NULL
         AND cy.status IN ('NAO_INICIADO','EM_ANDAMENTO')
      WHERE b.empresa_id = ? AND b.curso_id = ? AND b.package_id = ?
        AND b.package_sha256 = ? AND b.matricula_id = ?
        AND b.status = 'ACTIVE' AND b.synthetic = 1
        AND m.observacoes = 'QA_SCORM_F0:' || b.run_id
        AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND b.staging_runtime_sha = ?
        AND julianday(b.expires_at) > julianday('now')
      LIMIT 1`,
  ).bind(empresaId, cursoId, candidate.id, candidate.package_sha256,
    matriculaId, runtimeSha).first<{
      ciclo_id:number; staging_runtime_sha:string;
      approval_receipt_sha256:string; run_id:string; expires_at:string;
      launched_package_sha256:string|null;
      last_committed_package_sha256:string|null;
      matricula_status:string; numero_ciclo:number;
    enrollment_progress_pct:number|null;
    enrollment_completed_at:string|null;
      enrollment_score_final:number|null;
      enrollment_qualification_history_id:number|null;
      enrollment_attempts:number;
      cycle_attempts:number;
      cycle_score_final:number|null;
      cycle_qualification_history_id:number|null;
    }>();
  } catch {
    // Missing QA schema, incompatible Schema V2 layout or D1 outage:
    // no evidence can be trusted. Never substitute a course/CMI-only read.
    throw new ApiError('SCORM_QA_BINDING_SCHEMA_NOT_READY', 409);
  }
  assertScormF0BindingWitness(bind, {
    packageSha256: candidate.package_sha256, runtimeSha,
    observedAt: Date.now(),
  });
  const state = await db.prepare(
    `SELECT cmi_json, suspend_data, lesson_status, completion_status,
            success_status, score_raw, score_max, score_min, score_scaled,
            session_count, last_commit_at
       FROM lms_progresso_scorm
      WHERE empresa_id = ? AND matricula_id = ?`,
  ).bind(empresaId, matriculaId).first<{
    cmi_json:string|null; suspend_data:string|null;
    lesson_status:string|null; completion_status:string|null;
    success_status:string|null; score_raw:number|null;
    score_max:number|null; score_min:number|null; score_scaled:number|null;
    session_count:number|null; last_commit_at:string|null;
  }>();
  // A synthetic F0 commit increments session_count and writes last_commit_at.
  // A malformed counter cannot be presented as zero sessions (including a
  // nullable/NaN value); a persisted CMI/suspend payload cannot have zero
  // sessions, and a positive counter without a commit timestamp is unproven.
  // Keep the pristine prelaunch zero-session readback compatible.
  if (state && (!Number.isSafeInteger(state.session_count) ||
      state.session_count < 0 ||
      ((state.cmi_json !== null || state.suspend_data !== null) &&
       state.session_count === 0) ||
      (state.session_count > 0 && !state.last_commit_at))) {
    throw new ApiError('SCORM_QA_SESSION_STATE_UNPROVEN', 409);
  }
  // F0's QA runtime, not a plan supplied by the test driver, must record
  // which candidate ZIP was actually served and committed to D1. Merely
  // attaching an existing enrollment to this package is not evidence.
  // A persisted commit timestamp is evidence of a write even when the CMI,
  // suspend payload and session counter are empty. Do not accept such a
  // commit without the exact served/committed candidate provenance.
  if (state?.cmi_json || state?.suspend_data || state?.session_count ||
      state?.last_commit_at != null) {
    if (bind.launched_package_sha256 !== candidate.package_sha256 ||
        bind.last_committed_package_sha256 !== candidate.package_sha256) {
      throw new ApiError('SCORM_QA_COMMIT_EDITION_UNPROVEN', 409);
    }
  } else if (bind.launched_package_sha256 !== null &&
             bind.launched_package_sha256 !== candidate.package_sha256) {
    throw new ApiError('SCORM_QA_LAUNCH_EDITION_DRIFT', 409);
  }
  // F0 is a suspend/resume-only synthetic exercise. Its enrollment/cycle
  // attempt counters and independent score/qualification pointers must remain
  // clean, even if the SCORM CMI appears incomplete.
  if ([bind.enrollment_score_final, bind.enrollment_qualification_history_id,
       bind.cycle_score_final, bind.cycle_qualification_history_id,
       state?.score_raw, state?.score_max, state?.score_min, state?.score_scaled]
      .some(value => value !== null && value !== undefined)) {
    throw new ApiError('SCORM_QA_GRADED_STATE_PRESENT', 409);
  }
  if (bind.enrollment_attempts !== 0 || bind.cycle_attempts !== 0) {
    throw new ApiError('SCORM_QA_ATTEMPT_STATE_PRESENT', 409);
  }
  // An incomplete enrollment status is not sufficient negative evidence:
  // a stale completion date or high progress can coexist with EM_ANDAMENTO.
  // The synthetic F0 suspend-only writer advances progress to at most 1%.
  const progress = bind.enrollment_progress_pct;
  if (typeof progress !== 'number' || !Number.isSafeInteger(progress) ||
      progress < 0 || progress > 1 || bind.enrollment_completed_at !== null) {
    throw new ApiError('SCORM_QA_ENROLLMENT_COMPLETION_STATE_PRESENT', 409);
  }
  // Enrollment and cycle can remain incomplete even after the SCORM runtime
  // has persisted a terminal result. F0 only proves suspend/resume: a passed,
  // failed or completed runtime is not valid negative assessment evidence.
  if (['completed', 'passed', 'failed'].includes((state?.lesson_status ?? '').toLowerCase()) ||
      state?.completion_status?.toLowerCase() === 'completed' ||
      ['passed', 'failed'].includes((state?.success_status ?? '').toLowerCase())) {
    throw new ApiError('SCORM_QA_TERMINAL_STATE_PRESENT', 409);
  }
  // xAPI is a separate tenant/enrollment-scoped persisted activity store.
  // A fresh synthetic F0 enrollment must have no xAPI rows at all (including
  // archived rows). Missing schema/query failure is UNPROVEN, not zero.
  let xapi: { total:number } | null;
  try {
    xapi = await db.prepare(
      `SELECT COUNT(*) AS total FROM lms_xapi_statements
        WHERE empresa_id = ? AND matricula_id = ?`,
    ).bind(empresaId, matriculaId).first<{total:number}>();
  } catch {
    throw new ApiError('SCORM_QA_XAPI_READBACK_UNAVAILABLE', 409);
  }
  if (!xapi || !Number.isSafeInteger(xapi.total) || xapi.total < 0) {
    throw new ApiError('SCORM_QA_XAPI_READBACK_UNPROVEN', 409);
  }
  if (xapi.total !== 0) throw new ApiError('SCORM_QA_XAPI_STATE_PRESENT', 409);
  // These scoped negative guards are NOT a witness of external approval
  // absence or a source for the F5 physical assessment count contract.
  // A synthetic F0 suspend/resume enrollment must not have generated any
  // qualification, including records from older cycles or soft-deleted
  // history. A missing/invalid count is not evidence of absence.
  let qualification: {total:number} | null;
  try {
    qualification = await db.prepare(
      `SELECT COUNT(*) AS total FROM qualificacoes_historico
        WHERE empresa_id = ? AND lms_matricula_id = ?`,
    ).bind(empresaId,matriculaId).first<{total:number}>();
  } catch {
    throw new ApiError('SCORM_QA_QUALIFICATION_READBACK_UNAVAILABLE',409);
  }
  if (!qualification || !Number.isSafeInteger(qualification.total) ||
      qualification.total < 0) {
    throw new ApiError('SCORM_QA_QUALIFICATION_READBACK_UNPROVEN',409);
  }
  if (qualification.total !== 0) {
    throw new ApiError('SCORM_QA_QUALIFICATION_STATE_PRESENT',409);
  }
  const hex = async (raw:string|null|undefined) => {
    if (raw === null || raw === undefined) return null;
    const result=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return [...new Uint8Array(result)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  };
  return {
    source:'WORKER_D1_STAGING_READBACK' as const,
    empresaId, cursoId, packageId:candidate.id,
    packageSha256:candidate.package_sha256, runtimeSha,
    enrollmentId:matriculaId, cycleId:bind.ciclo_id,
    cycleNumber:bind.numero_ciclo,
    runId:bind.run_id, approvalReceiptSha256:bind.approval_receipt_sha256,
    servedPackageSha256:bind.launched_package_sha256,
    committedPackageSha256:bind.last_committed_package_sha256,
    synthetic:true, observedAt:new Date().toISOString(),
    completionStatus:bind.matricula_status,
    cmiSha256:await hex(state?.cmi_json),
    suspendSha256:await hex(state?.suspend_data),
    hasSuspendData:!!state?.suspend_data,
    lessonStatus:state?.lesson_status ?? null,
    scormCompletionStatus:state?.completion_status ?? null,
    successStatus:state?.success_status ?? null,
    scormScoreRaw:state?.score_raw ?? null,
    sessionCount:state?.session_count ?? 0,
    lastCommitAt:state?.last_commit_at ?? null,
    qualificationHistoryCount:qualification.total,
    qualificationHistoryId:null,
    certificateDocument:null,
  };
}
