#!/usr/bin/env node
// #2215: reviewed tenant-6 canonical organizational EAD rules only.
// Never publish a course, manufacture qualification evidence, or invite students.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const TENANT = 6;
const REVIEWED = Object.freeze([1,9,16,17,18,19,20,21,22,23,28,29,30,31,32,33,46,47,68,69,70,71,198,343,344,345,346,347,348,357,380,381,382,383,384,385,386,395,412,502,503,505,506,534,535,575,576,577,578,579,580,581,582,583,588,589,590,591,592,593,594,595,596,597,598,599,600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,626,627,663,664,672,673,675,676,679,680,681,682,683,684,685,686,689,690,691,692,693,694,695,696,697,698,699,700,701,702,706,707]);
const ARCHIVED = Object.freeze([237,240,242,244,256,665,666,667]);
const DRAFTS = Object.freeze({75:189,80:45,81:120,82:203});
const SPECIAL = Object.freeze([104,480,668,677,678,703]);
const ALL = [...new Set([...REVIEWED,...ARCHIVED,...SPECIAL])].sort((a,b)=>a-b);
const MODE = process.argv[2];
const CONFIRM = process.env.COMPLIANCE_2215_CONFIRMATION;
if (!['dry-run','apply'].includes(MODE)) throw Error('INVALID_MODE');
if (CONFIRM !== (MODE==='apply'
  ? 'AIRTRUST_2215_PRODUCTION_FINALIZE_EXACT_REVIEWED_RULES_NO_CONTENT_NO_EMAIL'
  : 'AIRTRUST_2215_DRYRUN_ONLY')) throw Error('CONFIRMATION_MISMATCH');
if (process.env.COMPLIANCE_2215_TARGET_DB && process.env.COMPLIANCE_2215_TARGET_DB!=='airtrust-db') throw Error('DB_TARGET_INVALID');

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function d1(sql, mutating=false) {
  if (!mutating && !/^\s*(SELECT|WITH)\b/i.test(sql)) throw Error('READONLY_SQL_REQUIRED');
  const child=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],
    {cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',maxBuffer:16*1024*1024});
  if(child.status!==0)throw Error('D1_COMMAND_FAILED');
  let payload;
  try {payload=JSON.parse(child.stdout);}catch{throw Error('D1_INVALID_JSON');}
  if(!Array.isArray(payload)||payload.some(x=>x.success!==true))throw Error('D1_OPERATION_FAILED');
  return {rows:payload.flatMap(x=>x.results||[]),changes:payload.reduce((n,x)=>n+Number(x.meta?.changes||0),0)};
}
function readState() {
  const rules=d1(`SELECT tr.id,tr.qualificacao_tipo_id,tr.escopo,tr.condicao_id,tr.fundamento_tipo,
       tr.modalidade_requerida,tr.auto_matricular_ead,tr.ativo,tr.deleted_at,
       qt.codigo,qt.categoria,qt.deleted_at qualification_deleted,
       (SELECT COUNT(*) FROM lms_cursos c WHERE c.empresa_id=tr.empresa_id
         AND c.qualificacao_tipo_id=tr.qualificacao_tipo_id AND c.ativo=1 AND c.publicado=1
         AND c.deleted_at IS NULL) published_courses
       FROM treinamento_requisitos tr
       JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id
       WHERE tr.empresa_id=${TENANT} AND tr.id IN (${ALL.join(',')}) ORDER BY tr.id`).rows;
  const drafts=d1(`SELECT id,qualificacao_tipo_id,publicado,ativo,deleted_at,
       scorm_package_r2_prefix FROM lms_cursos
       WHERE empresa_id=${TENANT} AND id IN (${Object.keys(DRAFTS).join(',')}) ORDER BY id`).rows;
  return {rules,drafts};
}
const byId = state=>new Map(state.rules.map(x=>[Number(x.id),x]));
function verify(state,post=false){
  if(state.rules.length!==ALL.length)throw Error('RULE_COUNT_DRIFT');
  if(state.drafts.length!==4)throw Error('DRAFT_COUNT_DRIFT');
  const map=byId(state);
  for(const [id,qualification] of Object.entries(DRAFTS)){
    const row=state.drafts.find(x=>Number(x.id)===Number(id));
    if(!row||Number(row.qualificacao_tipo_id)!==qualification||Number(row.ativo)!==1
      ||Number(row.publicado)!==0||row.deleted_at!=null||row.scorm_package_r2_prefix!=null)
      throw Error('DRAFT_CONTENT_OR_MAPPING_DRIFT_'+id);
  }
  for(const id of REVIEWED){
    const r=map.get(id);
    if(!r||Number(r.ativo)!==1||r.deleted_at!=null||r.qualification_deleted!=null
      ||String(r.categoria).toUpperCase()!=='EAD'||Number(r.published_courses)!==1
      ||r.condicao_id!=null||!['EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO'].includes(r.escopo)
      ||String(r.fundamento_tipo||'').toUpperCase()==='DESIGNACAO')
      throw Error('REVIEWED_RULE_SCOPE_DRIFT_'+id);
    if (r.modalidade_requerida!==null ||
        Number(r.auto_matricular_ead)!==(post?1:0))
      throw Error('REVIEWED_RULE_POLICY_DRIFT_'+id);
  }
  for(const id of ARCHIVED){
    const r=map.get(id);
    if(!r||r.qualification_deleted==null||r.deleted_at!=null||Number(r.ativo)!==(post?0:1))
      throw Error('ARCHIVED_RULE_DRIFT_'+id);
  }
  const special=[
    [104,'EAD',0,'EAD',0,0],[480,null,0,null,1,0],
    [668,null,1,null,1,0],[677,'EAD',0,'EAD',1,0],
    [678,'EAD',0,'EAD',1,0],[703,null,1,null,1,1],
  ];
  for(const [id,oldMode,oldAuto,newMode,newAuto,published] of special){
    const r=map.get(id);
    if(!r||r.deleted_at!=null||r.qualification_deleted!=null||Number(r.ativo)!==1
      ||Number(r.published_courses)!==published||String(r.categoria).toUpperCase()!=='EAD'
      ||r.modalidade_requerida!==(post?newMode:oldMode)
      ||Number(r.auto_matricular_ead)!==(post?newAuto:oldAuto))
      throw Error('SPECIAL_RULE_DRIFT_'+id);
  }
  // The examinador appointment is NOT obtained by taking an LMS course.
  const solo=map.get(104);
  if(solo.escopo!=='FUNCIONARIO')throw Error('EXAMINER_SCOPE_DRIFT');
  if(map.get(480).condicao_id!==12||map.get(668).condicao_id!==36)
    throw Error('DESIGNATION_SCOPE_DRIFT');
}
const before=readState();verify(before);
const beforeHash=sha({rules:before.rules,drafts:before.drafts});
if(MODE==='apply'){
  if(process.env.COMPLIANCE_2215_EXPECTED_HASH!==beforeHash)
    throw Error('REVIEWED_STATE_HASH_MISMATCH');
  const csv=REVIEWED.join(',');
  const updates=[
    [`UPDATE treinamento_requisitos SET auto_matricular_ead=1,updated_at=datetime('now')
       WHERE empresa_id=${TENANT} AND id IN (${csv}) AND ativo=1 AND deleted_at IS NULL
       AND modalidade_requerida IS NULL AND auto_matricular_ead=0`,124],
    [`UPDATE treinamento_requisitos SET auto_matricular_ead=1,updated_at=datetime('now')
       WHERE empresa_id=${TENANT} AND id=480 AND ativo=1 AND deleted_at IS NULL
       AND modalidade_requerida IS NULL AND auto_matricular_ead=0`,1],
    [`UPDATE treinamento_requisitos SET auto_matricular_ead=1,updated_at=datetime('now')
       WHERE empresa_id=${TENANT} AND id IN (677,678) AND ativo=1 AND deleted_at IS NULL
       AND modalidade_requerida='EAD' AND auto_matricular_ead=0`,2],
    [`UPDATE treinamento_requisitos SET ativo=0,updated_at=datetime('now')
       WHERE empresa_id=${TENANT} AND id IN (${ARCHIVED.join(',')}) AND ativo=1 AND deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM qualificacoes_tipos qt
          WHERE qt.id=treinamento_requisitos.qualificacao_tipo_id AND qt.empresa_id=${TENANT}
          AND qt.deleted_at IS NOT NULL)`,8],
  ];
  // Each update is guarded by the exact validated state. A failure stops
  // immediately; D1 Time Travel recovery is recorded by the official workflow.
  for(const [sql,expected] of updates){
    const result=d1(sql,true);
    if(result.changes!==expected)throw Error('UPDATE_COUNT_MISMATCH_'+expected+'_'+result.changes);
  }
  const after=readState();verify(after,true);
  // Explicitly audit each changed row (no employee identity or course completion).
  const reason=`{"source":"issue-2215","sha":"${process.env.GITHUB_SHA||'unknown'}","no_email":true,"no_certification":true}`;
  const audited=d1(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
    SELECT NULL,'COMPLIANCE_LMS_GOVERNED_ALIGNMENT','treinamento_requisitos',id,NULL,'${reason}',${TENANT},datetime('now')
      FROM treinamento_requisitos WHERE empresa_id=${TENANT}
      AND id IN (${ALL.filter(id=>![104,668,703].includes(id)).join(',')})`,true);
  if(audited.changes!==135)throw Error('AUDIT_COUNT_MISMATCH_'+audited.changes);
  console.log(JSON.stringify({mode:MODE,tenant:TENANT,source_sha:process.env.GITHUB_SHA,
    before_hash:beforeHash,reviewed_rule_updates:124,draft_rule_updates:3,
    archived_rule_retirements:8,audit_records:audited.changes,created_enrollments:0,
    emails_sent:0,content_published:0,certifications_created:0,postconditions_verified:true}));
}else{
  console.log(JSON.stringify({mode:MODE,tenant:TENANT,source_sha:process.env.GITHUB_SHA,
    before_hash:beforeHash,reviewed_rule_updates:124,draft_rule_updates:3,
    archived_rule_retirements:8,draft_course_ids:[75,80,81,82],
    examiner_credential_remains_manual:true,created_enrollments:0,
    emails_sent:0,content_published:0,certifications_created:0,mutation_executed:false}));
}
