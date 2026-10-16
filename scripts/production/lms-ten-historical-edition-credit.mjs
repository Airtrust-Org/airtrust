#!/usr/bin/env node
// source_reference: authenticated tenant-6 LMS99 administrative apply #38846270040; exactly ten LMS_NEW_EDITION_REQUIRED enrollments.
// operational_decision: training manager explicitly authorized historical-edition credit for the ten prior-edition completions; never claim new-edition SCORM pass.
// dry_run_required: official GitHub Actions main-SHA-pinned read-only cohort report and matching reviewed hash before any correction.
// rollback_plan_required: production D1 Time Travel recovery point and reviewed forward-only compensation if subsequent production writes prevent rewind.
// Production tenant6: 10 administrative credits for training attended in an older SCORM edition.
// Does not modify SCORM, exam grades, qualifications, package versions or issue certificates.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const SHA=String(process.env.EXPECTED_MAIN_SHA||''), WORKER=String(process.env.EXPECTED_PRODUCTION_SHA||'');
const MODE=String(process.env.HISTORIC_CREDIT_MODE||'dry-run');
const error=(c)=>{throw Error('HISTORIC_CREDIT_'+c)};
const require=(v,c)=>{if(!v)error(c)};
const hash=(v)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const PAIRS=Object.freeze([[2106,68],[384,34],[201,28],[608,43],[2139,68],
 [610,43],[544,7],[624,43],[700,55],[2052,68]]);
const IDS=PAIRS.map(p=>p[0]).join(','), MARKER='ADMIN_HISTORICAL_EDITION_20261016_';
function d1Select(sql,label){
 require(/^SELECT\b/i.test(sql.trim())&&!/\b(UPDATE|DELETE|INSERT|CREATE|ALTER|DROP|REPLACE)\b/i.test(sql),'READONLY_'+label);
 const p=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production',
  '--remote','--json','--command',sql],{cwd:new URL('../../worker-airtrust/',import.meta.url),
  env:process.env,encoding:'utf8',maxBuffer:12*1024*1024});
 require(p.status===0,'D1_SELECT_'+label);
 let v;try{v=JSON.parse(p.stdout)}catch{error('D1_JSON_'+label)}
 const rows=(Array.isArray(v)?v[0]:v)?.results;
 require(Array.isArray(rows),'D1_ROWS_'+label);return rows;
}
function snapshot(){
 const sql="SELECT m.id,m.curso_id,m.empresa_id,m.funcionario_id,m.status,m.progresso_pct,"+
 "m.data_conclusao,m.qualificacao_historico_id,m.deleted_at,m.updated_at,m.observacoes,"+
 "c.gerar_qualificacao_ao_concluir,c.qualificacao_tipo_id,"+
 "p.lesson_status,p.success_status,p.score_raw,p.score_max,"+
 "lc.id AS cycle_id,lc.status AS cycle_status,lc.progresso_pct AS cycle_progress,"+
 "lc.data_conclusao AS cycle_completed,lc.updated_at AS cycle_updated_at,"+
 "(SELECT COUNT(*) FROM lms_matricula_ciclos x WHERE x.empresa_id=m.empresa_id"+
 " AND x.matricula_id=m.id AND x.deleted_at IS NULL AND x.ciclo_atual=1) AS cycle_count,"+
 "(SELECT COUNT(*) FROM lms_progresso_scorm s WHERE s.empresa_id=m.empresa_id"+
 " AND s.matricula_id=m.id) AS scorm_count"+
 " FROM lms_matriculas m JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id"+
 " LEFT JOIN lms_progresso_scorm p ON p.matricula_id=m.id AND p.empresa_id=m.empresa_id"+
 " LEFT JOIN lms_matricula_ciclos lc ON lc.matricula_id=m.id"+
 " AND lc.empresa_id=m.empresa_id AND lc.ciclo_atual=1 AND lc.deleted_at IS NULL"+
 " WHERE m.empresa_id=6 AND m.id IN ("+IDS+") ORDER BY m.id";
 return d1Select(sql,'BASELINE');
}
export function plan(rows){
 require(Array.isArray(rows),'PLAN_ROWS');
 const target=new Map(PAIRS),seen=new Set(),allowed=[],blocked=[],qualifications=[];
 for(const r of rows){
  const id=Number(r.id),course=Number(r.curso_id),cycle=Number(r.cycle_id);
  require(target.get(id)===course&&!seen.has(id),'PLAN_IDENTITY');
  seen.add(id);
  const reasons=[];
  if(Number(r.empresa_id)!==6||r.deleted_at!==null)reasons.push('TENANT_OR_DELETED');
  if(r.status!=='EM_ANDAMENTO'||Number(r.progresso_pct)!==100||r.data_conclusao!==null)
   reasons.push('NO_ACTIVE_100_PERCENT');
  if(!Number.isSafeInteger(Number(r.funcionario_id))||Number(r.funcionario_id)<=0)reasons.push('STAFF');
  if(Number(r.cycle_count)!==1||!Number.isSafeInteger(cycle)||cycle<=0||
     !['EM_ANDAMENTO','NAO_INICIADO'].includes(String(r.cycle_status))||
     r.cycle_completed!==null)reasons.push('CYCLE');
  if(r.qualificacao_historico_id!==null)reasons.push('PREEXISTING_QUALIFICATION');
  if(Number(r.scorm_count)!==1)reasons.push('SCORM_ROW_MISSING');
  if(String(r.lesson_status||'').toLowerCase()==='failed'||
    String(r.success_status||'').toLowerCase()==='failed')reasons.push('EXPLICIT_FAILURE');
  if(reasons.length)blocked.push({id,course,reasons});
  else {
   allowed.push({id,course,staff:Number(r.funcionario_id),cycle,cycleStatus:r.cycle_status,
    scoreRaw:r.score_raw,scoreMax:r.score_max,lesson:r.lesson_status,success:r.success_status,
    updated:r.updated_at,cycleUpdated:r.cycle_updated_at,
    obsHash:hash(String(r.observacoes||''))});
   if(Number(r.gerar_qualificacao_ao_concluir)===1||r.qualificacao_tipo_id!==null)
     qualifications.push({id,course});
  }
 }
 for(const [id,course] of PAIRS)if(!seen.has(id))blocked.push({id,course,reasons:['NOT_FOUND']});
 require(allowed.length+blocked.length===10,'PLAN_COUNT');
 allowed.sort((a,b)=>a.id-b.id);blocked.sort((a,b)=>a.id-b.id);
 return {allowed,blocked,qualifications,hash:hash({allowed,blocked,qualifications})};
}
async function pinWorker(){
 const r=await fetch('https://api.airtrust.online/api/version');
 require(r.ok,'WORKER_VERSION_HTTP');
 const data=await r.json();
 require(String(data?.data?.sourceSha||'')===WORKER,'WORKER_SHA_MISMATCH');
}
function statements(rows){
 const sql=[];
 for(const row of rows){
  const {id,course,staff,cycle}=row;
  require([id,course,staff,cycle].every(x=>Number.isSafeInteger(x)&&x>0),'SQL_IDS');
  const marker=MARKER+id;
  const note="Credito administrativo autorizado pela Gerencia de Treinamento em 16/10/2026: "+
   "treinamento concluido na edicao anterior. Nao comprova a nova edicao SCORM ou nova avaliacao. "+marker;
  require(!note.includes("'"),'QUOTE_IN_NOTE');
  sql.push("UPDATE lms_matriculas SET status='CONCLUIDO',data_conclusao=date('now'),"+
   "observacoes=TRIM(COALESCE(observacoes,'')||' | "+note+"'),updated_at=datetime('now')"+
   " WHERE id="+id+" AND empresa_id=6 AND curso_id="+course+" AND funcionario_id="+staff+
   " AND status='EM_ANDAMENTO' AND progresso_pct=100 AND data_conclusao IS NULL"+
   " AND deleted_at IS NULL AND qualificacao_historico_id IS NULL");
  sql.push("UPDATE lms_matricula_ciclos SET status='CONCLUIDO',progresso_pct=100,"+
   "data_conclusao=date('now'),updated_at=datetime('now') WHERE id="+cycle+
   " AND empresa_id=6 AND matricula_id="+id+" AND curso_id="+course+
   " AND ciclo_atual=1 AND deleted_at IS NULL AND data_conclusao IS NULL"+
   " AND status IN ('EM_ANDAMENTO','NAO_INICIADO')");
  sql.push("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,old_values,new_values,"+
   "empresa_id,created_at) SELECT NULL,'LMS_HISTORICAL_EDITION_MANAGER_CREDIT',"+
   "'lms_matriculas',"+id+",json_object('status','EM_ANDAMENTO','progress',100),"+
   "json_object('administrative_credit',1,'historical_edition',1,'current_scorm_pass',0,"+
   "'score_edited',0,'qualifications_issued',0,'course',"+course+",'sha','"+SHA+
   "','marker','"+marker+"'),6,datetime('now') FROM lms_matriculas WHERE id="+id+
   " AND empresa_id=6 AND status='CONCLUIDO' AND observacoes LIKE '%"+marker+"%'");
 }
 return sql.join(';\n')+';\n';
}
async function main(){
 require(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','GITHUB_MAIN_ONLY');
 require(SHA===process.env.GITHUB_SHA&&/^[0-9a-f]{40}$/.test(SHA)&&
  /^[0-9a-f]{40}$/.test(WORKER),'SHA');
 require(process.env.TARGET_COMPANY_ID==='6','TENANT');
 require(['dry-run','apply'].includes(MODE),'MODE');
 require(process.env.HISTORIC_CREDIT_CONFIRMATION==='AIRTRUST_HISTORIC_EDITION_'+MODE.toUpperCase(),'CONFIRM');
 require(Boolean(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID),'D1_SECRETS');
 await pinWorker();
 const p=plan(snapshot());
 const report={mode:MODE,tenant:6,source_sha:SHA,worker_sha:WORKER,targets:10,
  candidates:p.allowed.length,blocked:p.blocked,qualification_scope:p.qualifications,
  hash:p.hash,writes:0,scorm_written:false,certificates_issued:false,
  administrative_credit_only:true,personal_data:false};
 if(MODE==='apply'){
  require(p.allowed.length===10&&p.blocked.length===0,'PRECONDITIONS_NOT_MET');
  require(process.env.HISTORIC_CREDIT_RECOVERY_READY==='yes','RECOVERY');
  require(process.env.HISTORIC_CREDIT_REVIEWED_HASH===p.hash,'REVIEWED_COHORT_DRIFT');
  await pinWorker();
  const dir=mkdtempSync(join(tmpdir(),'airtrust-historic-credit-'));
  try {
   const path=join(dir,'governed-credit.sql');
   writeFileSync(path,statements(p.allowed),{mode:0o600});
   const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production',
    '--remote','--file',path],{cwd:new URL('../../worker-airtrust/',import.meta.url),
    env:process.env,encoding:'utf8',maxBuffer:12*1024*1024});
   require(r.status===0,'GOVERNED_SQL_FAILED');
  }finally{rmSync(dir,{recursive:true,force:true})}
  const after=d1Select("SELECT m.id,m.curso_id,m.status,m.progresso_pct,m.data_conclusao,"+
    "m.qualificacao_historico_id,m.observacoes,lc.status AS cycle_status,"+
    "lc.progresso_pct AS cycle_progress,lc.data_conclusao AS cycle_completed"+
    " FROM lms_matriculas m JOIN lms_matricula_ciclos lc"+
    " ON lc.matricula_id=m.id AND lc.empresa_id=m.empresa_id AND lc.ciclo_atual=1"+
    " WHERE m.empresa_id=6 AND m.id IN ("+IDS+") ORDER BY m.id",'POST');
  require(after.length===10,'POST_COUNT');
  for(const [id,course] of PAIRS){
   const row=after.find(x=>Number(x.id)===id);
   require(row&&Number(row.curso_id)===course&&row.status==='CONCLUIDO'&&
    Number(row.progresso_pct)===100&&Boolean(row.data_conclusao)&&
    row.cycle_status==='CONCLUIDO'&&Number(row.cycle_progress)===100&&
    Boolean(row.cycle_completed)&&row.qualificacao_historico_id===null&&
    String(row.observacoes||'').includes(MARKER+id),'POST_'+id);
  }
  const audit=d1Select("SELECT COUNT(*) AS total FROM audit_logs WHERE empresa_id=6"+
   " AND action='LMS_HISTORICAL_EDITION_MANAGER_CREDIT'"+
   " AND entity_id IN ("+IDS+")"+
   " AND json_extract(new_values,'$.sha')='"+SHA+"'",'AUDIT');
  require(Number(audit[0]?.total)===10,'POST_AUDIT_COUNT');
  report.writes=10;report.postconditions_verified=true;
  report.completed_ids=PAIRS.map(x=>x[0]);
 }
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('HISTORIC_CREDIT_FAILED:'+e.message);process.exitCode=1});
}
