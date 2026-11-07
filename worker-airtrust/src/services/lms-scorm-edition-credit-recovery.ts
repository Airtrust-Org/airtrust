import { readActiveCompletionManifest } from './lms-completion-manifest-evidence';
import { buildScormAdministrativeCredit } from './lms-scorm-administrative-credit';

/**
 * Safe catch-up for students who accepted the old 0566 handoff before the
 * global recognition policy existed. Never overwrite a real new-edition
 * attempt, assessment or completion. The original immutable archive is the
 * only source of prior progress and the active package must still match SHA.
 */
export async function restorePriorEditionAdministrativeCredit(input: {
  db:D1Database; bucket:R2Bucket|null|undefined;
  empresaId:number;matriculaId:number;actorId:number;
  callerFuncionarioId:number|null;isAdmin:boolean;
}):Promise<{handoffId:number;progressPct:number;location:string;alreadyApplied:boolean}> {
  const {db,empresaId,matriculaId,actorId}=input;
  if([empresaId,matriculaId,actorId].some(n=>!Number.isSafeInteger(n)||n<=0)){
    throw new Error('SCORM_ADMIN_CREDIT_SCOPE_INVALID');
  }
  const row=await db.prepare(`
    SELECT h.id AS handoff_id,h.previous_enrollment_json,h.resume_plan_json,
      h.target_package_sha256,m.curso_id,m.funcionario_id,m.status,
      m.progresso_pct,m.qualificacao_historico_id,cy.id AS ciclo_id,
      c.scorm_package_r2_prefix AS active_prefix,
      ps.cmi_json,ps.suspend_data
    FROM lms_scorm_edition_handoffs h
    JOIN lms_matriculas m ON m.id=h.matricula_id AND m.empresa_id=h.empresa_id
      AND m.curso_id=h.curso_id AND m.funcionario_id=h.funcionario_id
      AND m.deleted_at IS NULL
    JOIN lms_matricula_ciclos cy ON cy.id=h.ciclo_id
      AND cy.empresa_id=m.empresa_id AND cy.matricula_id=m.id
      AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
      AND c.tipo_conteudo='scorm' AND c.deleted_at IS NULL
    JOIN lms_scorm_package_versions p ON p.empresa_id=h.empresa_id
      AND p.curso_id=h.curso_id AND p.r2_prefix=h.target_package_prefix
      AND p.package_sha256=h.target_package_sha256 AND p.status='ACTIVE'
    LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
    WHERE h.empresa_id=? AND h.matricula_id=?
      AND c.scorm_package_r2_prefix=h.target_package_prefix
      AND m.qualificacao_historico_id IS NULL
    ORDER BY h.id DESC LIMIT 1`)
    .bind(empresaId,matriculaId).first<{
      handoff_id:number;previous_enrollment_json:string;resume_plan_json:string;
      target_package_sha256:string;curso_id:number;funcionario_id:number;status:string;
      progresso_pct:number;qualificacao_historico_id:number|null;ciclo_id:number;
      active_prefix:string;cmi_json:string|null;suspend_data:string|null;
    }>();
  if(!row)throw new Error('SCORM_ADMIN_CREDIT_NO_ACTIVE_HANDOFF');
  if(!input.isAdmin&&row.funcionario_id!==input.callerFuncionarioId){
    throw new Error('SCORM_ADMIN_CREDIT_FORBIDDEN');
  }
  let priorPct:number,position:number,total:number;
  try{
    const archive=JSON.parse(row.previous_enrollment_json);
    const plan=JSON.parse(row.resume_plan_json);
    priorPct=Number(archive?.enrollment?.progresso_pct);
    position=Number(plan?.targetPosition);
    total=Number(plan?.activeTotal);
    if(plan.canMarkComplete!==false||plan.canTransferScore!==false||
       !Number.isSafeInteger(position)||!Number.isSafeInteger(total)||
       !Number.isSafeInteger(priorPct)||priorPct<1||priorPct>100){
      throw new Error('bad plan');
    }
  }catch{throw new Error('SCORM_ADMIN_CREDIT_ARCHIVE_INVALID');}
  const manifest=await readActiveCompletionManifest({
    bucket:input.bucket,empresaId,cursoId:row.curso_id,activePrefix:row.active_prefix,
  });
  if(!manifest||!manifest.packageVersion||manifest.requiredSlideIds.length!==total||
     total<2)throw new Error('SCORM_ADMIN_CREDIT_ACTIVE_MANIFEST_INVALID');
  const credit=buildScormAdministrativeCredit({
    manifest,packageSha256:row.target_package_sha256,
    handoffId:row.handoff_id,previousProgressPct:Math.min(99,priorPct),
    targetPosition:Math.max(2,position),
  });
  let marker:Record<string,unknown>|null=null;
  try{marker=JSON.parse(row.cmi_json??'null') as Record<string,unknown>;}catch{}
  const existing=marker?.['airtrust.administrative_credit'];
  if(existing&&typeof existing==='object'&&
     (existing as Record<string,unknown>).handoff_id===row.handoff_id &&
     Number(row.progresso_pct)>=credit.progressPct){
    return {handoffId:row.handoff_id,progressPct:Number(row.progresso_pct),
      location:credit.location,alreadyApplied:true};
  }
  if(!['NAO_INICIADO','EM_ANDAMENTO'].includes(row.status)||
     Number(row.progresso_pct)!==0||
     (row.cmi_json!==null&&row.cmi_json!=='')||
     (row.suspend_data!==null&&row.suspend_data!=='')){
    throw new Error('SCORM_ADMIN_CREDIT_ACTIVE_STUDY_ALREADY_STARTED');
  }
  const predicates=`EXISTS(SELECT 1 FROM lms_scorm_edition_handoffs h
    JOIN lms_scorm_package_versions p ON p.empresa_id=h.empresa_id
      AND p.curso_id=h.curso_id AND p.package_sha256=h.target_package_sha256
      AND p.r2_prefix=h.target_package_prefix AND p.status='ACTIVE'
    JOIN lms_cursos c ON c.id=h.curso_id AND c.empresa_id=h.empresa_id
      AND c.scorm_package_r2_prefix=p.r2_prefix
    WHERE h.id=? AND h.empresa_id=? AND h.matricula_id=? AND h.ciclo_id=?
      AND h.target_package_sha256=?)`;
  const guard=[row.handoff_id,empresaId,matriculaId,row.ciclo_id,row.target_package_sha256];
  const batchResult=await db.batch([
    db.prepare(`UPDATE lms_progresso_scorm
      SET lesson_status='incomplete',completion_status=NULL,success_status=NULL,
        score_raw=NULL,score_max=NULL,score_min=NULL,score_scaled=NULL,
        suspend_data=?,cmi_json=?,session_count=0,updated_at=datetime('now')
      WHERE matricula_id=? AND empresa_id=?
        AND (cmi_json IS NULL OR cmi_json='')
        AND (suspend_data IS NULL OR suspend_data='') AND __PRED__
        AND EXISTS(SELECT 1 FROM lms_matriculas m
          WHERE m.id=? AND m.empresa_id=?
          AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
          AND m.progresso_pct=0 AND m.qualificacao_historico_id IS NULL)`.replace('__PRED__',predicates))
      .bind(credit.suspendData,credit.cmiJson,matriculaId,empresaId,...guard,
        matriculaId,empresaId),
    db.prepare(`UPDATE lms_matriculas
      SET status='EM_ANDAMENTO',progresso_pct=?,ultimo_slide=?,ultima_pagina=?,
        data_inicio=COALESCE(data_inicio,datetime('now')),updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND status IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND progresso_pct=0
        AND qualificacao_historico_id IS NULL AND __PRED__
        AND EXISTS(SELECT 1 FROM lms_progresso_scorm ps
          WHERE ps.matricula_id=? AND ps.empresa_id=?
            AND ps.cmi_json=? AND ps.suspend_data=?)`.replace('__PRED__',predicates))
      .bind(credit.progressPct,Math.max(2,position),Math.max(2,position),matriculaId,empresaId,
        ...guard,matriculaId,empresaId,credit.cmiJson,credit.suspendData),
    db.prepare(`UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO',
        progresso_pct=?,data_inicio=COALESCE(data_inicio,datetime('now')),
        updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND matricula_id=? AND ciclo_atual=1
        AND deleted_at IS NULL AND __PRED__
        AND EXISTS(SELECT 1 FROM lms_matriculas m
          WHERE m.id=? AND m.empresa_id=? AND m.status='EM_ANDAMENTO'
            AND m.progresso_pct=?)`.replace('__PRED__',predicates))
      .bind(credit.progressPct,row.ciclo_id,empresaId,matriculaId,...guard,
        matriculaId,empresaId,credit.progressPct),
    db.prepare(`INSERT INTO audit_logs
        (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
      SELECT ?,'SCORM_ADMIN_PRIOR_EDITION_CREDIT','lms_matriculas',?,NULL,
        json_object('authority','OWNER_GLOBAL_POLICY_2026_11_03',
        'basis','ARCHIVED_HANDOFF_RESTORE','handoff_id',?,
        'cycle_id',?,'target_sha',?,'credited_units',?,'location',?,
        'prior_progress_pct',?),?,datetime('now')
      WHERE EXISTS(SELECT 1 FROM lms_matriculas m
        JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
        WHERE m.id=? AND m.empresa_id=? AND m.progresso_pct=?
          AND ps.cmi_json=? AND ps.suspend_data=?)
        AND __PRED__
        AND NOT EXISTS(SELECT 1 FROM audit_logs a
          WHERE a.action='SCORM_ADMIN_PRIOR_EDITION_CREDIT'
            AND a.empresa_id=? AND a.entity_id=?
            AND json_extract(CASE WHEN json_valid(a.new_values)
              THEN a.new_values ELSE '{}' END,'$.handoff_id')=?)`.replace('__PRED__',predicates))
      .bind(actorId,matriculaId,row.handoff_id,row.ciclo_id,row.target_package_sha256,
        credit.creditedUnits,credit.location,credit.progressPct,empresaId,
        matriculaId,empresaId,credit.progressPct,credit.cmiJson,credit.suspendData,...guard,
        empresaId,matriculaId,row.handoff_id),
  ]);
  const after=await db.prepare(`SELECT m.status,m.progresso_pct,ps.cmi_json
    FROM lms_matriculas m JOIN lms_progresso_scorm ps
      ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
    WHERE m.id=? AND m.empresa_id=?`)
    .bind(matriculaId,empresaId).first<{status:string;progresso_pct:number;cmi_json:string|null}>();
  if(after?.status!=='EM_ANDAMENTO'||after.progresso_pct!==credit.progressPct||
     after.cmi_json!==credit.cmiJson){
    throw new Error('SCORM_ADMIN_CREDIT_POSTCHECK_FAILED');
  }
  return {handoffId:row.handoff_id,progressPct:credit.progressPct,
    location:credit.location,alreadyApplied:Number(batchResult[0]?.meta?.changes??0)===0};
}
