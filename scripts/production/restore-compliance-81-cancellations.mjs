#!/usr/bin/env node
// source_reference: issue #1376, tenant-6 production D1 audit event 2026-10-10 19:10:05 UTC.
// operational_decision: restore exactly 81 mandatory LMS matriculas and original cycle statuses, preserving 15 other cancellations.
// dry_run_required: reviewed same-SHA, same-hash dry-run; confirmation and eight official gates.
// rollback_plan_required: D1 Time Travel recovery in official workflow, with no unrelated tenant changes.
// No course creation, new cycle, SCORM or history rewrite, notifications or email.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AUDIT_QUERY, LATER_AUDITS_QUERY, queryD1, evaluateAudit, candidateHash } from './audit-training-compliance-81-cancellations.mjs';

const PREFIX='COMPLIANCE_81_RESTORE_';
export const DRY_CONFIRM='AIRTRUST_PRODUCTION_COMPLIANCE_81_RESTORE_DRY_RUN';
export const APPLY_CONFIRM='AIRTRUST_PRODUCTION_COMPLIANCE_81_RESTORE_APPLY_NO_EMAIL';
const check=(condition,code)=>{if(!condition)throw new Error(PREFIX+code)};
const valid=new Set(['CONCLUIDO','EM_ANDAMENTO','NAO_INICIADO']);

export function buildRestoreSql(candidates,sha) {
  check(/^[0-9a-f]{40}$/.test(sha),'INVALID_SHA');
  check(Array.isArray(candidates)&&candidates.length===81,'INVALID_COUNT');
  check(new Set(candidates.map(r=>r.id)).size===81,'DUPLICATE_ID');
  for(const r of candidates){
    check(Number.isSafeInteger(r.id)&&r.id>0,'INVALID_ID');
    check(valid.has(r.originalStatus),'INVALID_OLD_STATUS');
    check(Number(r.mandatoryApplicable)===1,'NOT_MANDATORY');
    check(r.status==='CANCELADO'&&r.cycleStatus==='CANCELADO'&&r.cycleCount===1,'NOT_CANCELLED');
  }
  const rows=candidates.slice().sort((a,b)=>a.id-b.id);
  const ids=rows.map(r=>r.id).join(',');
  const cases=(column)=>'CASE '+column+' '+rows.map(r=>'WHEN '+r.id+" THEN '"+r.originalStatus+"'").join(' ')+" ELSE 'CANCELADO' END";
  const matCase=cases('id');
  const cycCase=cases('matricula_id');
  const source='('+AUDIT_QUERY.trim().replace(/;\s*$/,'')+')';
  const later='('+LATER_AUDITS_QUERY.trim().replace(/;\s*$/,'')+')';
  const guard=(condition,code)=>"SELECT json(CASE WHEN ("+condition+") THEN 'null' ELSE '"+PREFIX+code+"' END);";
  const pre=[
    '(SELECT COUNT(*) FROM '+source+')=96',
    '(SELECT COUNT(*) FROM '+source+" WHERE mandatory_applicable=1 AND id IN ("+ids+") AND status='CANCELADO' AND cycle_status='CANCELADO' AND cycle_count=1)=81",
    '(SELECT COUNT(*) FROM '+source+" WHERE mandatory_applicable=0 AND status='CANCELADO' AND cycle_status='CANCELADO' AND cycle_count=1)=15",
    '(SELECT COUNT(*) FROM '+source+" WHERE mandatory_applicable=1 AND id NOT IN ("+ids+'))=0',
    later+'=0',
  ].join(' AND ');
  const post=[
    '(SELECT COUNT(*) FROM '+source+')=96',
    '(SELECT COUNT(*) FROM '+source+" WHERE mandatory_applicable=1 AND id IN ("+ids+") AND status=original_status AND cycle_status=original_status AND cycle_count=1)=81",
    '(SELECT COUNT(*) FROM '+source+" WHERE mandatory_applicable=0 AND status='CANCELADO' AND cycle_status='CANCELADO' AND cycle_count=1)=15",
  ].join(' AND ');
  return [
    '-- Reviewed D1 batch: changes only 81 tenant-6 existing enrollment/cycle statuses and audit rows.',
    guard(pre,'PREFLIGHT_CHANGED'),
    "INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at) "+
     "SELECT NULL,'LMS_MATRICULA_RESTAURADA_20261010','lms_matriculas',id,json_object('status',status),"+
     "json_object('status',"+matCase+",'reviewed_commit','"+sha+"','source_event','2026-10-10 19:10:05'),6,datetime('now') "+
     "FROM lms_matriculas WHERE empresa_id=6 AND id IN ("+ids+") AND status='CANCELADO';",
    'UPDATE lms_matricula_ciclos SET status='+cycCase+",updated_at=datetime('now') WHERE empresa_id=6 AND matricula_id IN ("+ids+") AND ciclo_atual=1 AND deleted_at IS NULL AND status='CANCELADO';",
    'UPDATE lms_matriculas SET status='+matCase+",updated_at=datetime('now') WHERE empresa_id=6 AND id IN ("+ids+") AND deleted_at IS NULL AND status='CANCELADO';",
    guard(post,'POSTCONDITIONS_FAILED'),
  ].join('\n\n')+'\n';
}

export function allowedStatusTrigger(t) {
  if(t?.name!=='trg_lms_matriculas_updated_at'||t?.tbl_name!=='lms_matriculas')return false;
  const canonical=String(t.sql||'').replace(/\s+/g,' ').trim().toUpperCase();
  return /^CREATE TRIGGER (?:IF NOT EXISTS )?TRG_LMS_MATRICULAS_UPDATED_AT AFTER UPDATE ON LMS_MATRICULAS FOR EACH ROW BEGIN UPDATE LMS_MATRICULAS SET UPDATED_AT = DATETIME\('NOW'\) WHERE ID = NEW\.ID; END;?$/.test(canonical);
}
function verifyStatusTriggers() {
  const triggers=queryD1("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('lms_matriculas','lms_matricula_ciclos')");
  check(triggers.every(allowedStatusTrigger),'UNREVIEWED_STATUS_TRIGGER');
}

function readCandidates() {
  const rows=queryD1(AUDIT_QUERY).map(r=>({
    id:Number(r.id),originalStatus:r.original_status,status:r.status,
    cycleCount:Number(r.cycle_count),cycleStatus:r.cycle_status,
    code:r.code,mandatoryApplicable:Number(r.mandatory_applicable),
  }));
  const later=Number(queryD1(LATER_AUDITS_QUERY)[0]?.count);
  check(Number.isSafeInteger(later)&&later>=0,'AUDIT_COUNT_INVALID');
  return {report:evaluateAudit(rows,later),candidates:rows.filter(r=>r.mandatoryApplicable===1)};
}
function privateBatch(sql) {
  check(process.env.COMPLIANCE_81_RECOVERY_READY==='yes','RECOVERY_NOT_READY');
  const dir=mkdtempSync(join(tmpdir(),'airtrust-compliance81-'));
  try {
    const path=join(dir,'restore.sql');
    writeFileSync(path,sql,{mode:0o600,flag:'wx'});
    const p=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--file',path,'--yes'],
      {cwd:resolve('worker-airtrust'),env:process.env,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
    check(p.status===0,'D1_BATCH_FAILED');
  } finally {rmSync(dir,{recursive:true,force:true});}
}
async function main(){
  const mode=process.argv[2],sha=process.env.EXPECTED_MAIN_SHA||'';
  check(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','GITHUB_MAIN_ONLY');
  check(/^[0-9a-f]{40}$/.test(sha)&&sha===process.env.GITHUB_SHA,'SHA_MISMATCH');
  check(process.env.TARGET_COMPANY_ID==='6','TENANT_MISMATCH');
  check(['dry-run','apply'].includes(mode),'INVALID_MODE');
  check(process.env.COMPLIANCE_81_CONFIRMATION===(mode==='apply'?APPLY_CONFIRM:DRY_CONFIRM),'CONFIRMATION_INVALID');
  check(Boolean(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID),'CREDENTIALS_MISSING');
  verifyStatusTriggers();
  const {report,candidates}=readCandidates();
  check(report.candidate_sha256===candidateHash(candidates),'DIGEST_MISMATCH');
  if(mode==='dry-run'){
    process.stdout.write(JSON.stringify({...report,source_sha:sha})+'\n');
    return;
  }
  check(process.env.COMPLIANCE_81_REVIEWED_CANDIDATE_SHA256===report.candidate_sha256,'REVIEWED_SHA256_MISMATCH');
  check(process.env.COMPLIANCE_81_REVIEWED_CANDIDATE_COUNT==='81','REVIEWED_COUNT_MISMATCH');
  privateBatch(buildRestoreSql(candidates,sha));
  const after=queryD1(AUDIT_QUERY);
  check(after.length===96,'POST_EVENT_COUNT');
  check(after.filter(r=>r.mandatory_applicable===1&&r.status===r.original_status&&r.cycle_status===r.original_status&&Number(r.cycle_count)===1).length===81,'POST_RESTORE_FAILED');
  check(after.filter(r=>r.mandatory_applicable===0&&r.status==='CANCELADO'&&r.cycle_status==='CANCELADO').length===15,'POST_OTHER_STATES_CHANGED');
  process.stdout.write(JSON.stringify({mode:'apply',source_sha:sha,restored_enrollments:81,restored_existing_cycles:81,
    reviewed_candidate_sha256:report.candidate_sha256,completed_in_review:5,unstarted_unrequired_preserved:10,
    postconditions_verified:true,email_sent:false,new_cycles_created:false,pii_emitted:false})+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error(String(e?.message||'').startsWith(PREFIX)?e.message:PREFIX+'OPERATION_FAILED');process.exitCode=1;});
}
