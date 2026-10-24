import { ApiError } from '../../middleware/error-handler';
import { mergeScormRuntimeState } from '../../services/lms-progress-guardrails';
import { ScormCommitSchema } from '../../services/lms-scorm-commit-schema';

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
type F0Scope = {
  tenantId: number; courseId: number; packageId: string;
  packageSha256: string; enrollmentId: number; runtimeSha: string;
};
export type F0BindingState = {
  id: string; cycleId: number; runId: string;
  cmiJson: string | null; suspendData: string | null;
  sessionCount: number; launchedSha: string | null; committedSha: string | null;
};
function checkScope(s: F0Scope): void {
  if (!positive(s.tenantId) || !positive(s.courseId) || !positive(s.enrollmentId) ||
      !/^[0-9a-f-]{36}$/i.test(s.packageId) || !HEX64.test(s.packageSha256) ||
      !HEX40.test(s.runtimeSha)) throw new ApiError('SCORM_F0_RUNTIME_SCOPE_INVALID', 403);
}

/**
 * All scope witnesses come from D1 and are pinned to a still-VALIDATED
 * inactive candidate, the current cycle and a synthetic QA employee.
 * Never infer package identity from the mutable course active pointer.
 */
export async function readF0CandidateRuntimeState(db: D1Database, scope: F0Scope): Promise<F0BindingState> {
  checkScope(scope);
  let row: {
    id:string; ciclo_id:number; run_id:string; launched_package_sha256:string|null;
    last_committed_package_sha256:string|null; cmi_json:string|null;
    suspend_data:string|null; session_count:number|null;
  } | null;
  try {
    row = await db.prepare(
      `SELECT b.id,b.ciclo_id,b.run_id,b.launched_package_sha256,
              b.last_committed_package_sha256,
              sc.cmi_json,sc.suspend_data,sc.session_count
         FROM lms_scorm_qa_evidence_bindings b
         JOIN lms_scorm_package_versions p ON p.id=b.package_id
           AND p.empresa_id=b.empresa_id AND p.curso_id=b.curso_id
           AND p.package_sha256=b.package_sha256 AND p.status='VALIDATED'
         JOIN lms_cursos c ON c.id=b.curso_id AND c.empresa_id=b.empresa_id
           AND c.deleted_at IS NULL AND c.publicado=0
           AND c.scorm_package_r2_prefix IS NOT p.r2_prefix
         JOIN lms_matriculas m ON m.id=b.matricula_id
           AND m.empresa_id=b.empresa_id AND m.curso_id=b.curso_id
           AND m.deleted_at IS NULL AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
           AND m.observacoes='QA_SCORM_F0:' || b.run_id
         JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=b.empresa_id
           AND f.deleted_at IS NULL AND f.nome LIKE 'QA-PARTICIPANTE-%'
         JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id
           AND cy.matricula_id=m.id AND cy.empresa_id=b.empresa_id
           AND cy.curso_id=b.curso_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
         LEFT JOIN lms_progresso_scorm sc ON sc.empresa_id=b.empresa_id
           AND sc.matricula_id=b.matricula_id
        WHERE b.empresa_id=? AND b.curso_id=? AND b.package_id=?
          AND b.package_sha256=? AND b.matricula_id=?
          AND b.status='ACTIVE' AND b.synthetic=1
          AND b.staging_runtime_sha=? AND julianday(b.expires_at)>julianday('now')
        LIMIT 1`,
    ).bind(scope.tenantId,scope.courseId,scope.packageId,scope.packageSha256,
      scope.enrollmentId,scope.runtimeSha).first<typeof row extends null ? never : NonNullable<typeof row>>();
  } catch {
    throw new ApiError('SCORM_F0_STAGING_BINDING_UNAVAILABLE', 409);
  }
  if (!row || !positive(row.ciclo_id) ||
      (row.launched_package_sha256 !== null && row.launched_package_sha256 !== scope.packageSha256) ||
      (row.last_committed_package_sha256 !== null &&
        (row.launched_package_sha256 !== scope.packageSha256 ||
         row.last_committed_package_sha256 !== scope.packageSha256)) ||
      ((row.cmi_json !== null || row.suspend_data !== null || Number(row.session_count ?? 0)>0) &&
       row.last_committed_package_sha256 !== scope.packageSha256)) {
    throw new ApiError('SCORM_F0_RUNTIME_BINDING_OR_EDITION_INVALID', 409);
  }
  return {
    id: row.id, cycleId:row.ciclo_id, runId:row.run_id,
    cmiJson:row.cmi_json, suspendData:row.suspend_data,
    sessionCount:Number(row.session_count ?? 0),
    launchedSha:row.launched_package_sha256,
    committedSha:row.last_committed_package_sha256,
  };
}

export async function witnessF0CandidateLaunch(db:D1Database, scope:F0Scope, binding:F0BindingState) {
  const rows = await db.batch([
    db.prepare(
      `UPDATE lms_scorm_qa_evidence_bindings
          SET launched_package_sha256=?,updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND curso_id=? AND package_id=?
          AND package_sha256=? AND matricula_id=? AND ciclo_id=?
          AND run_id=? AND staging_runtime_sha=? AND synthetic=1
          AND status='ACTIVE' AND julianday(expires_at)>julianday('now')
          AND (launched_package_sha256 IS NULL OR launched_package_sha256=?)`,
    ).bind(scope.packageSha256,binding.id,scope.tenantId,scope.courseId,
      scope.packageId,scope.packageSha256,scope.enrollmentId,binding.cycleId,
      binding.runId,scope.runtimeSha,scope.packageSha256),
    db.prepare(
      `INSERT INTO audit_logs(action,entity_type,entity_id,new_values,empresa_id,created_at)
       SELECT 'SCORM_F0_STAGING_CANDIDATE_LAUNCHED','lms_scorm_qa_evidence_bindings',
              NULL,?,b.empresa_id,datetime('now')
         FROM lms_scorm_qa_evidence_bindings b
        WHERE b.id=? AND b.empresa_id=? AND b.matricula_id=?
          AND b.launched_package_sha256=? AND b.status='ACTIVE'
          AND julianday(b.expires_at)>julianday('now')`,
    ).bind(JSON.stringify({source:'F0_CANDIDATE_LAUNCH',candidate:scope.packageSha256,
      runId:binding.runId,cycleId:binding.cycleId}),
      binding.id,scope.tenantId,scope.enrollmentId,scope.packageSha256),
  ]);
  if (Number(rows[0]?.meta?.changes)!==1 || Number(rows[1]?.meta?.changes)!==1) {
    throw new ApiError('SCORM_F0_LAUNCH_WITNESS_NOT_STORED',409);
  }
  return {source:'F0_CANDIDATE_LAUNCH',packageSha256:scope.packageSha256};
}

export function validateF0IncompleteCommit(raw:unknown, expectedEnrollment:number, expectedCycle:number) {
  const parsed=ScormCommitSchema.safeParse(raw);
  if(!parsed.success)throw new ApiError('SCORM_F0_COMMIT_INVALID',400);
  const d=parsed.data;
  if(d.matricula_id!==expectedEnrollment || d.ciclo_id!==expectedCycle ||
     !['incomplete',null,undefined].includes(d.lesson_status) ||
     !['incomplete',null,undefined].includes(d.completion_status) ||
     !['unknown',null,undefined].includes(d.success_status) ||
     [d.score_raw,d.score_max,d.score_min,d.score_scaled].some(v=>v!=null) ||
     d.completion_candidate===true || d.completion_observed_at ||
     (d.cmi_json!=null && d.cmi_json.length>65535) ||
     (!d.cmi_json && !d.suspend_data)) {
    throw new ApiError('SCORM_F0_COMPLETION_OR_SCORE_FORBIDDEN',403);
  }
  let cmi:Record<string,unknown>={};
  try {
    if(d.cmi_json) {
      const parsedJson=JSON.parse(d.cmi_json);
      if(!parsedJson || typeof parsedJson!=='object' || Array.isArray(parsedJson))
        throw Error('NOT_OBJECT');
      cmi=parsedJson as Record<string,unknown>;
    }
  } catch { throw new ApiError('SCORM_F0_CMI_INVALID',400); }
  const badStatuses=new Set(['passed','completed','failed','success','succeeded']);
  if(Object.entries(cmi).some(([key,value])=>
    key.startsWith('cmi.core.score') || key.startsWith('cmi.score.') ||
    ((key==='cmi.core.lesson_status'||key==='cmi.completion_status'||key==='cmi.success_status') &&
      badStatuses.has(String(value).toLowerCase())))) {
    throw new ApiError('SCORM_F0_TERMINAL_OR_SCORE_FORBIDDEN',403);
  }
  return d;
}


async function sha256(value:string|null) {
  if(value===null)return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

/**
 * Save an actual browser-driven SCORM incomplete/suspend commit from the
 * candidate-scoped cookie. All D1 mutations are guarded by the same immutable
 * F0 binding; never change completion, scores or qualification history.
 */
export async function commitF0CandidateSuspend(
  db:D1Database, scope:F0Scope, raw:unknown,
) {
  const before=await readF0CandidateRuntimeState(db,scope);
  if(before.launchedSha!==scope.packageSha256) {
    throw new ApiError('SCORM_F0_CANDIDATE_NOT_LAUNCHED',409);
  }
  const d=validateF0IncompleteCommit(raw,scope.enrollmentId,before.cycleId);
  const merged=mergeScormRuntimeState({
    currentCmiJson:before.cmiJson,incomingCmiJson:d.cmi_json??null,
    currentSuspendData:before.suspendData,incomingSuspendData:d.suspend_data??null,
  });
  if(merged.decisions.blockedTerminalRegression ||
     !merged.cmiJson || merged.cmiJson.length>65535 ||
     (merged.suspendData!==null && merged.suspendData.length>65535)) {
    throw new ApiError('SCORM_F0_COMMIT_RUNTIME_INVALID',409);
  }
  const cmiHash=await sha256(merged.cmiJson);
  const suspendHash=await sha256(merged.suspendData);
  const cmiJson=merged.cmiJson, suspendData=merged.suspendData;
  const args=[
    before.id,scope.tenantId,scope.courseId,scope.packageId,scope.packageSha256,
    scope.enrollmentId,before.cycleId,before.runId,scope.runtimeSha,
  ] as const;
  const changes=await db.batch([
    db.prepare(
      `UPDATE lms_scorm_qa_evidence_bindings
          SET last_committed_package_sha256=?,updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND curso_id=? AND package_id=?
          AND package_sha256=? AND matricula_id=? AND ciclo_id=?
          AND run_id=? AND staging_runtime_sha=?
          AND launched_package_sha256=? AND synthetic=1
          AND status='ACTIVE' AND julianday(expires_at)>julianday('now')
          AND (last_committed_package_sha256 IS NULL OR last_committed_package_sha256=?)`,
    ).bind(scope.packageSha256,...args,scope.packageSha256,scope.packageSha256),
    db.prepare(
      `INSERT INTO lms_progresso_scorm
         (matricula_id,empresa_id,lesson_status,completion_status,success_status,
          score_raw,score_max,score_min,score_scaled,session_time,total_time,
          suspend_data,launch_data,cmi_json,session_count,last_commit_at)
       SELECT b.matricula_id,b.empresa_id,'incomplete','incomplete','unknown',
              NULL,NULL,NULL,NULL,NULL,NULL,?,NULL,?,1,datetime('now')
         FROM lms_scorm_qa_evidence_bindings b
        WHERE b.id=? AND b.empresa_id=? AND b.curso_id=? AND b.package_id=?
          AND b.package_sha256=? AND b.matricula_id=? AND b.ciclo_id=?
          AND b.run_id=? AND b.staging_runtime_sha=?
          AND b.synthetic=1 AND b.status='ACTIVE'
          AND b.launched_package_sha256=b.package_sha256
          AND b.last_committed_package_sha256=b.package_sha256
          AND julianday(b.expires_at)>julianday('now')
       ON CONFLICT(matricula_id) DO UPDATE SET
         lesson_status='incomplete',completion_status='incomplete',
         success_status='unknown',
         suspend_data=COALESCE(excluded.suspend_data,lms_progresso_scorm.suspend_data),
         cmi_json=COALESCE(excluded.cmi_json,lms_progresso_scorm.cmi_json),
         session_count=lms_progresso_scorm.session_count+1,
         last_commit_at=datetime('now'),updated_at=datetime('now')`,
    ).bind(suspendData,cmiJson,...args),
    db.prepare(
      `UPDATE lms_matriculas
          SET status='EM_ANDAMENTO',
              progresso_pct=MAX(COALESCE(progresso_pct,0),1),
              data_inicio=COALESCE(data_inicio,datetime('now')),
              updated_at=datetime('now')
        WHERE id=? AND empresa_id=? AND curso_id=? AND deleted_at IS NULL
          AND status IN ('NAO_INICIADO','EM_ANDAMENTO')
          AND observacoes=?
          AND EXISTS(SELECT 1 FROM lms_scorm_qa_evidence_bindings b
              WHERE b.empresa_id=lms_matriculas.empresa_id
                AND b.matricula_id=lms_matriculas.id
                AND b.id=? AND b.package_sha256=? AND b.status='ACTIVE'
                AND b.last_committed_package_sha256=b.package_sha256
                AND julianday(b.expires_at)>julianday('now'))`,
    ).bind(scope.enrollmentId,scope.tenantId,scope.courseId,
      `QA_SCORM_F0:${before.runId}`,before.id,scope.packageSha256),
    db.prepare(
      `UPDATE lms_matricula_ciclos
          SET status='EM_ANDAMENTO',updated_at=datetime('now')
        WHERE id=? AND matricula_id=? AND empresa_id=? AND curso_id=?
          AND ciclo_atual=1 AND deleted_at IS NULL
          AND status IN ('NAO_INICIADO','EM_ANDAMENTO')
          AND EXISTS(SELECT 1 FROM lms_scorm_qa_evidence_bindings b
              WHERE b.empresa_id=lms_matricula_ciclos.empresa_id
                AND b.ciclo_id=lms_matricula_ciclos.id
                AND b.id=? AND b.package_sha256=? AND b.status='ACTIVE'
                AND julianday(b.expires_at)>julianday('now'))`,
    ).bind(before.cycleId,scope.enrollmentId,scope.tenantId,
      scope.courseId,before.id,scope.packageSha256),
    db.prepare(
      `INSERT INTO audit_logs(action,entity_type,entity_id,new_values,empresa_id,created_at)
       SELECT 'SCORM_F0_STAGING_CANDIDATE_COMMIT',
              'lms_scorm_qa_evidence_bindings',NULL,?,
              b.empresa_id,datetime('now')
         FROM lms_scorm_qa_evidence_bindings b
        WHERE b.id=? AND b.empresa_id=? AND b.package_id=?
          AND b.matricula_id=? AND b.ciclo_id=?
          AND b.last_committed_package_sha256=b.package_sha256
          AND b.status='ACTIVE' AND julianday(b.expires_at)>julianday('now')`,
    ).bind(JSON.stringify({
      source:'F0_CANDIDATE_INCOMPLETE_COMMIT_V1',
      packageSha256:scope.packageSha256,runId:before.runId,
      cycleId:before.cycleId,cmiSha256:cmiHash,suspendSha256:suspendHash,
      assessment:false,certificate:false,
    }),before.id,scope.tenantId,scope.packageId,
    scope.enrollmentId,before.cycleId),
    // D1.batch commits before it returns changes. An after-the-fact result
    // check cannot roll back a partially applied candidate commit. Force a
    // SQL error *inside the same batch transaction* unless all required
    // side effects are observable on the exact synthetic cycle and edition.
    db.prepare(
      `SELECT CASE WHEN
          EXISTS(SELECT 1 FROM lms_scorm_qa_evidence_bindings b
            JOIN lms_progresso_scorm sp
              ON sp.matricula_id=b.matricula_id AND sp.empresa_id=b.empresa_id
            JOIN lms_matriculas m
              ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id
            JOIN lms_matricula_ciclos cy
              ON cy.id=b.ciclo_id AND cy.empresa_id=b.empresa_id
             AND cy.matricula_id=b.matricula_id
            WHERE b.id=? AND b.empresa_id=? AND b.curso_id=?
              AND b.package_id=? AND b.package_sha256=?
              AND b.matricula_id=? AND b.ciclo_id=?
              AND b.run_id=? AND b.staging_runtime_sha=?
              AND b.status='ACTIVE' AND b.synthetic=1
              AND b.launched_package_sha256=b.package_sha256
              AND b.last_committed_package_sha256=b.package_sha256
              AND m.status='EM_ANDAMENTO'
              AND cy.status='EM_ANDAMENTO' AND cy.ciclo_atual=1
              AND sp.session_count>=?
              AND sp.lesson_status='incomplete'
              AND sp.score_raw IS NULL
              AND m.score_final IS NULL
              AND m.qualificacao_historico_id IS NULL)
          THEN 1 ELSE json_extract('INVALID_JSON_ROLLBACK_SENTINEL','$.impossible') END AS verified`,
    ).bind(...args,before.sessionCount+1),
  ]);
  if(changes.slice(0,5).some(change=>Number(change?.meta?.changes)!==1) ||
     Number((changes[5]?.results?.[0] as {verified?:number}|undefined)?.verified)!==1){
    throw new ApiError('SCORM_F0_ATOMIC_COMMIT_NOT_PROVEN',409);
  }
  const after=await readF0CandidateRuntimeState(db,scope);
  if(after.committedSha!==scope.packageSha256 || after.sessionCount<=before.sessionCount){
    throw new ApiError('SCORM_F0_BACKEND_COMMIT_READBACK_FAILED',409);
  }
  return {
    source:'F0_CANDIDATE_INCOMPLETE_COMMIT_V1',packageSha256:scope.packageSha256,
    runId:before.runId,cycleId:before.cycleId,
    sessionCount:after.sessionCount,cmiSha256:cmiHash,suspendSha256:suspendHash,
    completionWritten:false,scoreWritten:false,certificateIssued:false,
  };
}
