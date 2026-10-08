/**
 * Historical FDM #13 -> #71/#72 administrative transfer domain.
 * Pure planning only. Never exports learner identifiers to CI artifacts.
 * Production writes belong to a separately reviewed, SHA-pinned executor.
 */
import { createHash } from 'node:crypto';

export const SOURCE=13;
export const TENANT=6;
export const DESTINATIONS=Object.freeze({tripulacao:71,manutencao:72});
const normalize=(v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
const assert=(v,code)=>{if(!v)throw new Error('FDM13_'+code)};
const int=(v)=>Number.isInteger(Number(v))&&Number(v)>0;

export function destinationForRole(role) {
 const r=normalize(role);
 if(r==='COMANDANTE'||r==='COPILOTO')return DESTINATIONS.tripulacao;
 if(['MECANICO','AUXILIAR DE MANUTENCAO','AUX MANUTENCAO'].includes(r))return DESTINATIONS.manutencao;
 return null; // Committee/Gatekeeper and other roles are never migrated automatically
}
export function buildTransferPlan(sourceRows,targetRows,opts={}) {
 assert(Array.isArray(sourceRows)&&Array.isArray(targetRows),'INPUT_INVALID');
 const rows=[],seen=new Set(),targets=new Map();
 const totals={source_canceled:0,tripulacao:0,manutencao:0,out_of_scope:0,credited_at_99:0,needs_fresh_training:0,already_transferred:0};
 for(const t of targetRows){
  assert(Number(t.empresa_id)===TENANT&&[71,72,73].includes(Number(t.curso_id))&&int(t.funcionario_id),'TARGET_SCOPE_INVALID');
  const key=Number(t.funcionario_id)+':'+Number(t.curso_id);
  assert(!targets.has(key),'TARGET_DUPLICATE');
  targets.set(key,t);
 }
 for(const s of sourceRows){
  assert(Number(s.empresa_id)===TENANT&&Number(s.curso_id)===SOURCE&&int(s.id)&&int(s.funcionario_id),'SOURCE_SCOPE_INVALID');
  assert(s.deleted_at==null&&normalize(s.status)==='CANCELADO','SOURCE_NOT_ACTIVE_CANCELLED');
  assert(Number(s.employee_active)===1,'SOURCE_EMPLOYEE_NOT_ACTIVE');
  assert(!seen.has(Number(s.funcionario_id)),'SOURCE_DUPLICATE_EMPLOYEE');
  seen.add(Number(s.funcionario_id));totals.source_canceled++;
  const dest=destinationForRole(s.funcao_nome);
  if(dest===null){totals.out_of_scope++;continue;}
  if(dest===71)totals.tripulacao++;else totals.manutencao++;
  const pct=Number(s.progresso_pct??0);
  assert(Number.isFinite(pct)&&pct>=0&&pct<=100,'PROGRESS_INVALID');
  const credit=pct>=99;
  const existing=targets.get(Number(s.funcionario_id)+':'+dest);
  if(existing){
   assert(existing.deleted_at==null&&String(existing.observacoes??'').includes('FDM13_ADMIN_TRANSFER_SOURCE_'+Number(s.id)),
    'TARGET_HISTORY_REQUIRES_REVIEW');
   assert(normalize(existing.status)===(credit?'CONCLUIDO':'NAO_INICIADO'),'TARGET_TRANSFER_STATUS_DRIFT');
   assert(Number(existing.has_current_cycle)===1,'TARGET_CYCLE_MISSING');
   if(credit)assert(Number(existing.has_administrative_qualification)===1,'TARGET_ADMIN_QUALIFICATION_MISSING');
   totals.already_transferred++;continue;
  }
  if(credit)totals.credited_at_99++;else totals.needs_fresh_training++;
  rows.push({source_id:Number(s.id),employee_id:Number(s.funcionario_id),course_id:dest,
   legacy_progress_pct:pct,administrative_equivalence:credit,
   target_status:credit?'CONCLUIDO':'NAO_INICIADO'});
 }
 // The known production cohort is a guard, not permission to backfill drifting data.
 if(opts.requireExactCohort!==false){
  assert(totals.source_canceled===27,'COHORT_SIZE_CHANGED');
  assert(totals.tripulacao===11,'TRIPULACAO_SIZE_CHANGED');
  assert(totals.manutencao===10,'MANUTENCAO_SIZE_CHANGED');
  assert(totals.out_of_scope===6,'EXCLUDED_SIZE_CHANGED');
  assert(Number(opts.softDeletedSourceCount)===5,'SOFT_DELETED_COUNT_CHANGED');
 }
 assert(totals.tripulacao+totals.manutencao+totals.out_of_scope===totals.source_canceled,'PARTITION_INVALID');
 assert(rows.length+totals.already_transferred===totals.tripulacao+totals.manutencao,'TRANSFER_PARTITION_INVALID');
 rows.sort((a,b)=>a.course_id-b.course_id||a.employee_id-b.employee_id);
 const candidate_hash=createHash('sha256').update(rows.map(r=>[
  r.source_id,r.employee_id,r.course_id,r.legacy_progress_pct,
  r.administrative_equivalence?1:0].join(':')).join('\n')).digest('hex');
 return {rows,summary:{empresa_id:TENANT,source_curso_id:SOURCE,destinations:[71,72],
  ...totals,candidates:rows.length,candidate_hash,write_count:0,
  administrative_not_scorm:true,committee_course_73_untouched:true}};
}
export function publicSummary(plan){
 const {rows,summary}=plan;
 assert(Array.isArray(rows)&&summary?.write_count===0,'SUMMARY_INVALID');
 return {...summary};
}
