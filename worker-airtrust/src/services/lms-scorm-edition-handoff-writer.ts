/**
 * Governed, in-cycle SCORM handoff writer. NOT wired to a route/flag: enabling
 * requires Schema V2 applied, old asset sessions invalidated and E2E QA.
 * Snapshots original CMI/score/attempts BEFORE clearing the current runtime.
 */
export type ScormEditionHandoff = Readonly<{
  empresaId:number; matriculaId:number; actorId:number;
  operationId:string; targetSha256:string;
  resumePlanJson:string;
}>;
export type HandoffReceipt = Readonly<{id:number;cycleId:number;targetSha256:string;alreadyApplied:boolean}>;
const sha=/^[a-f0-9]{64}$/;
const safePositive=(v:number)=>Number.isSafeInteger(v)&&v>0;
const op=/^[A-Za-z0-9][A-Za-z0-9:_-]{15,119}$/;
function verify(input:ScormEditionHandoff):void {
  if(!safePositive(input.empresaId)||!safePositive(input.matriculaId)||
    !safePositive(input.actorId)||!op.test(input.operationId)||
    !sha.test(input.targetSha256)) throw new Error('SCORM_HANDOFF_SCOPE_INVALID');
  try {
    const plan:unknown=JSON.parse(input.resumePlanJson);
    if(!plan||typeof plan!=='object'||Array.isArray(plan)||
      (plan as Record<string,unknown>).canMarkComplete!==false ||
      (plan as Record<string,unknown>).canTransferScore!==false) {
      throw new Error('bad plan');
    }
  }catch{throw new Error('SCORM_HANDOFF_PLAN_UNSAFE');}
}
type ScopeRow={ciclo_id:number;curso_id:number;funcionario_id:number;target_prefix:string};
type ArchiveRow={id:number;ciclo_id:number;target_package_sha256:string;operation_id:string};
export async function writeScormEditionHandoff(
  db:D1Database,input:ScormEditionHandoff,
):Promise<HandoffReceipt> {
  verify(input);
  const scope=await db.prepare(`
    SELECT cy.id ciclo_id,m.curso_id,m.funcionario_id,p.r2_prefix target_prefix
    FROM lms_matriculas m
    JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    JOIN lms_scorm_package_versions p ON p.empresa_id=m.empresa_id AND p.curso_id=m.curso_id
    WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL
     AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
     AND m.qualificacao_historico_id IS NULL
     AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
     AND c.tipo_conteudo='scorm' AND c.deleted_at IS NULL
     AND c.scorm_package_r2_prefix=p.r2_prefix
     AND p.status='ACTIVE' AND p.package_sha256=?`)
     .bind(input.matriculaId,input.empresaId,input.targetSha256).first<ScopeRow>();
  if(!scope?.ciclo_id||!scope.target_prefix)throw new Error('SCORM_HANDOFF_TARGET_OR_CYCLE_NOT_VERIFIED');
  const findReceipt=()=>db.prepare(`
    SELECT id,ciclo_id,target_package_sha256,operation_id
    FROM lms_scorm_edition_handoffs
    WHERE empresa_id=? AND matricula_id=? AND ciclo_id=? AND target_package_sha256=?`)
    .bind(input.empresaId,input.matriculaId,scope.ciclo_id,input.targetSha256)
    .first<ArchiveRow>();
  const existing=await findReceipt();
  if(existing){
    if(existing.operation_id!==input.operationId)throw new Error('SCORM_HANDOFF_ALREADY_APPLIED_OTHER_OPERATION');
    return {id:existing.id,cycleId:existing.ciclo_id,targetSha256:existing.target_package_sha256,alreadyApplied:true};
  }
  // A batch is one D1 transaction. The immutable INSERT is the authorization
  // token for every later statement. Failed INSERT/UNIQUE rolls back the batch.
  const predicate=`EXISTS(SELECT 1 FROM lms_scorm_edition_handoffs h
    WHERE h.empresa_id=? AND h.matricula_id=? AND h.ciclo_id=?
      AND h.operation_id=? AND h.target_package_sha256=?)`;
  const scopeArgs=[input.empresaId,input.matriculaId,scope.ciclo_id,input.operationId,input.targetSha256];
  const statements=[
    db.prepare(`INSERT INTO lms_scorm_edition_handoffs
     (empresa_id,matricula_id,ciclo_id,curso_id,funcionario_id,operation_id,actor_id,
      previous_enrollment_json,previous_scorm_json,previous_diagnostics_json,
      previous_package_prefix,target_package_sha256,target_package_prefix,resume_plan_json)
     SELECT m.empresa_id,m.id,?,m.curso_id,m.funcionario_id,?,?,
      json_object('status',m.status,'progresso_pct',m.progresso_pct,'score_final',m.score_final,
        'tentativas',m.tentativas,'data_inicio',m.data_inicio,
        'ultimo_slide',m.ultimo_slide,'ultima_pagina',m.ultima_pagina),
      (SELECT json_object('lesson_status',p.lesson_status,'completion_status',p.completion_status,
         'success_status',p.success_status,'score_raw',p.score_raw,'score_max',p.score_max,
         'score_scaled',p.score_scaled,'suspend_data',p.suspend_data,'cmi_json',p.cmi_json,
         'session_time',p.session_time,'total_time',p.total_time,'launch_data',p.launch_data,
         'session_count',p.session_count,'last_commit_at',p.last_commit_at)
       FROM lms_progresso_scorm p WHERE p.matricula_id=m.id AND p.empresa_id=m.empresa_id),
      (SELECT json_group_array(json_object('tentativa',d.tentativa,'diagnostics_json',d.diagnostics_json))
        FROM lms_completion_diagnostics_snapshots d WHERE d.matricula_id=m.id AND d.empresa_id=m.empresa_id),
      NULL,?,?,?
     FROM lms_matriculas m
     WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL
       AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
       AND m.qualificacao_historico_id IS NULL
       AND EXISTS(SELECT 1 FROM lms_matricula_ciclos cy
         WHERE cy.id=? AND cy.empresa_id=m.empresa_id AND cy.matricula_id=m.id
          AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL)`)
      .bind(scope.ciclo_id,input.operationId,input.actorId,input.targetSha256,scope.target_prefix,
        input.resumePlanJson,input.matriculaId,input.empresaId,scope.ciclo_id),
    db.prepare(`UPDATE lms_progresso_scorm
      SET lesson_status=NULL,completion_status=NULL,success_status=NULL,
       score_raw=NULL,score_max=NULL,score_min=NULL,score_scaled=NULL,
       suspend_data=NULL,launch_data=NULL,cmi_json=NULL,
       session_time=NULL,total_time=NULL,session_count=0,
       last_commit_at=datetime('now'),updated_at=datetime('now')
      WHERE empresa_id=? AND matricula_id=? AND ${predicate}`)
      .bind(input.empresaId,input.matriculaId,...scopeArgs),
    db.prepare(`DELETE FROM lms_completion_diagnostics_snapshots
      WHERE empresa_id=? AND matricula_id=? AND ${predicate}`)
      .bind(input.empresaId,input.matriculaId,...scopeArgs),
    db.prepare(`UPDATE lms_matriculas SET status='NAO_INICIADO',
      progresso_pct=0,ultimo_slide=0,ultima_pagina=0,
      score_final=NULL,tentativas=0,data_inicio=NULL,data_conclusao=NULL,
      updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND status IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND qualificacao_historico_id IS NULL AND ${predicate}`)
      .bind(input.matriculaId,input.empresaId,...scopeArgs),
    db.prepare(`UPDATE lms_matricula_ciclos SET status='NAO_INICIADO',
      progresso_pct=0,tentativas=0,updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND matricula_id=? AND ciclo_atual=1
        AND deleted_at IS NULL AND ${predicate}`)
      .bind(scope.ciclo_id,input.empresaId,input.matriculaId,...scopeArgs),
    db.prepare(`INSERT INTO audit_logs
      (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
      SELECT ?,'SCORM_EDITION_IN_CYCLE_HANDOFF','lms_matriculas',?,NULL,
         json_object('handoff_operation_id',?,'cycle_id',?,'target_sha',?),?,datetime('now')
      WHERE ${predicate}`)
      .bind(input.actorId,input.matriculaId,input.operationId,scope.ciclo_id,
        input.targetSha256,input.empresaId,...scopeArgs),
  ];
  try {await db.batch(statements);}
  catch(error){
    const race=await findReceipt();
    if(race?.operation_id===input.operationId) {
      return {id:race.id,cycleId:race.ciclo_id,targetSha256:race.target_package_sha256,alreadyApplied:true};
    }
    throw error;
  }
  const receipt=await findReceipt();
  if(!receipt||receipt.operation_id!==input.operationId)throw new Error('SCORM_HANDOFF_BATCH_POSTCHECK_FAILED');
  return {id:receipt.id,cycleId:receipt.ciclo_id,targetSha256:receipt.target_package_sha256,alreadyApplied:false};
}
