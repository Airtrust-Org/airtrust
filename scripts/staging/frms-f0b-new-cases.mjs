#!/usr/bin/env node
// FRMS F0: additive synthetic staging-only cases, independent of the eight legacy QA rows.
// Source: #1426 / #776, post-#1946 isolated SQL regression. No operational data imported.
// source_reference: issues #1426/#776; PR #1946 actual buscarAlertas SQL contract.
// operational_decision: staging tenant 999013, four NEW synthetic case/journey IDs only;
//   never change the eight historical QA rows, production or FRMS business rules.
// dry_run_required: default --inspect performs SELECT-only; --apply only from a
//   SHA-pinned staging workflow after D1 target UUID and Time Travel preflight.
// rollback_plan_required: --rollback deletes only untouched F0B QA rows after
//   explicit recovery guard; never restores the entire shared staging D1.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const TARGET=Object.freeze({db:'airtrust-db-staging-baseline-20260701',uuid:'bf9963f4-eb12-439b-a830-20bbf577ac22',tenant:999013});
const BLOCKED_PRODUCTION_DB_ID='7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const CONFIRM_STAGING_F0B=Object.freeze({
  apply:'AIRTRUST_STAGING_FRMS_F0B_APPLY',
  rollback:'AIRTRUST_STAGING_FRMS_F0B_ROLLBACK'
});
export const CASES=Object.freeze([
  {id:'qa-frms-f0b-case-1',journey:'qa-frms-f0b-j-1',date:'2026-11-04',crew:'QA-FRMS-UX-01',kind:'REPOUSO',level:'CRITICO',minutes:540,start:'07:00:00'},
  {id:'qa-frms-f0b-case-2',journey:'qa-frms-f0b-j-2',date:'2026-11-03',crew:'QA-FRMS-UX-02',kind:'FDP_DIARIO',level:'ATENCAO',minutes:690,start:'04:30:00'},
  {id:'qa-frms-f0b-case-3',journey:'qa-frms-f0b-j-3',date:'2026-11-02',crew:'QA-FRMS-UX-01',kind:'HV_7D',level:'AVISO',minutes:540,start:'07:00:00'},
  {id:'qa-frms-f0b-case-4',journey:'qa-frms-f0b-j-4',date:'2026-11-01',crew:'QA-FRMS-UX-02',kind:'REPOUSO',level:'CRITICO',minutes:540,start:'07:00:00'}
].map(x=>Object.freeze(x)));
const LEGACY=Object.freeze([1,2,3,4].map(i=>'qa-frms-ux-case-'+i));
const NOTE='CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL';
const MESSAGE='QA SINTETICO: revisar contexto e registrar providencia';
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const ids=rows=>rows.map(x=>q(x)).join(',');
export function buildApplySql(){
  const sql=[];
  for(const c of CASES){
    sql.push("INSERT INTO frms_jornada (id,tripulante_id,data,status,hora_apresentacao,hora_termino,duracao_jornada_minutos,horas_voo_minutos,registrado_por,origem,observacao,empresa_id,created_at,updated_at,deleted_at) "+
      "SELECT "+q(c.journey)+",f.id,"+q(c.date)+",'ES',"+q(c.start)+",'16:00:00',"+c.minutes+",270,'QA_FRMS_UX','SIGVOOS',"+q(NOTE)+","+TARGET.tenant+",datetime('now'),datetime('now'),NULL "+
      "FROM funcionarios f JOIN empresas e ON e.id=f.empresa_id "+
      "WHERE e.id="+TARGET.tenant+" AND e.codigo='qa_frms_ux_30d' AND e.ativo=1 AND e.deleted_at IS NULL "+
      "AND f.matricula="+q(c.crew)+" AND f.ativo=1 AND f.deleted_at IS NULL "+
      "AND NOT EXISTS(SELECT 1 FROM frms_jornada WHERE id="+q(c.journey)+")");
    sql.push("INSERT INTO frms_alerta (id,tripulante_id,jornada_id,tipo_limite,nivel,percentual_atingido,valor_atual_min,valor_limite_min,mensagem,visualizado,resolvido,created_at,updated_at,deleted_at) "+
      "SELECT "+q(c.id)+",f.id,j.id,"+q(c.kind)+","+q(c.level)+",112,j.duracao_jornada_minutos,480,"+q(MESSAGE)+",0,0,"+q(c.date+' 10:00:00')+",datetime('now'),NULL "+
      "FROM frms_jornada j JOIN funcionarios f ON f.id=j.tripulante_id AND f.empresa_id=j.empresa_id "+
      "WHERE j.id="+q(c.journey)+" AND j.empresa_id="+TARGET.tenant+" AND j.data="+q(c.date)+
      " AND j.origem='SIGVOOS' AND j.deleted_at IS NULL AND f.matricula="+q(c.crew)+
      " AND f.ativo=1 AND f.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM frms_alerta WHERE id="+q(c.id)+")");
  }
  return sql.join(';\n')+';\n';
}
export function buildRollbackSql(){
  const alertIds=ids(CASES.map(x=>x.id)), journeyIds=ids(CASES.map(x=>x.journey));
  return "DELETE FROM frms_alerta WHERE id IN ("+alertIds+") AND resolvido=0 AND visualizado=0 "+
    "AND notas_resolucao IS NULL AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id="+TARGET.tenant+");\n"+
    "DELETE FROM frms_jornada WHERE id IN ("+journeyIds+") AND empresa_id="+TARGET.tenant+
    " AND NOT EXISTS(SELECT 1 FROM frms_alerta WHERE jornada_id=frms_jornada.id);\n";
}
export function assertNewCases(rows){
  if(!Array.isArray(rows)||rows.length!==4)throw Error('QA_NEW_CASE_COUNT_NOT_FOUR');
  for(const c of CASES){
    const r=rows.find(x=>x.id===c.id);
    if(!r||r.journey!==c.journey||r.data!==c.date||r.matricula!==c.crew||
      r.tipo_limite!==c.kind||r.nivel!==c.level||String(r.origem).toUpperCase()!=='SIGVOOS'||
      r.observacao!==NOTE||r.mensagem!==MESSAGE||
      Number(r.empresa_id)!==TARGET.tenant||Number(r.resolvido)!==0||
      r.deleted_at!==null||r.jdeleted!==null||Number(r.valor_atual_min)!==Number(r.duracao_jornada_minutos))
      throw Error('QA_NEW_CASE_LINKAGE_OR_SCOPE_INVALID');
  }
  return true;
}
function remote(sql,{write=false}={}){
  const args=['wrangler','d1','execute',TARGET.db,'--remote','--json'];
  let dir;
  try{
    if(write){
      dir=mkdtempSync(join(tmpdir(),'airtrust-f0b-'));
      const file=join(dir,'qa-f0b.sql');
      writeFileSync(file,sql,{mode:0o600});
      args.push('--file',file);
    } else args.push('--command',sql);
    const res=spawnSync('npx',args,{cwd:join(process.cwd(),'worker-airtrust'),encoding:'utf8',maxBuffer:8*1024*1024});
    if(res.status!==0)throw Error(write?'STAGING_QA_FIXED_WRITE_FAILED':'STAGING_QA_FIXED_SELECT_FAILED');
    if(write)return;
    const data=JSON.parse(res.stdout);
    return (Array.isArray(data)?data[0]?.results:data.results)||[];
  }finally{if(dir)rmSync(dir,{recursive:true,force:true});}
}
const qaIds=ids(CASES.map(x=>x.id)), journeyIds=ids(CASES.map(x=>x.journey));
function inspect(){
  const state=remote("SELECT "+
    "(SELECT COUNT(*) FROM empresas WHERE id=999013 AND codigo='qa_frms_ux_30d' AND ativo=1 AND deleted_at IS NULL) AS tenant,"+
    "(SELECT COUNT(*) FROM funcionarios WHERE empresa_id=999013 AND matricula LIKE 'QA-FRMS-UX-%' AND ativo=1 AND deleted_at IS NULL) AS crew,"+
    "(SELECT COUNT(*) FROM funcionarios WHERE empresa_id=999013 AND matricula='QA-FRMS-UX-01' AND ativo=1 AND deleted_at IS NULL) AS crew1,"+
    "(SELECT COUNT(*) FROM funcionarios WHERE empresa_id=999013 AND matricula='QA-FRMS-UX-02' AND ativo=1 AND deleted_at IS NULL) AS crew2,"+
    "(SELECT COUNT(*) FROM frms_jornada j JOIN funcionarios f ON f.id=j.tripulante_id AND f.empresa_id=j.empresa_id WHERE j.empresa_id=999013 AND j.deleted_at IS NULL AND j.id NOT IN ("+journeyIds+") AND ("+ CASES.map(c=>"(f.matricula="+q(c.crew)+" AND j.data="+q(c.date)+")").join(" OR ")+")) AS date_conflicts,"+
    "(SELECT COUNT(*) FROM frms_alerta WHERE id IN ("+ids(LEGACY)+")) AS legacy,"+
    "(SELECT COUNT(*) FROM frms_alerta WHERE id IN ("+qaIds+")) AS cases,"+
    "(SELECT COUNT(*) FROM frms_jornada WHERE id IN ("+journeyIds+")) AS journeys")[0];
  if(!state||Number(state.tenant)!==1||Number(state.crew)!==14||Number(state.crew1)!==1||Number(state.crew2)!==1||Number(state.date_conflicts)!==0||Number(state.legacy)!==4)
    throw Error('QA_TENANT_OR_LEGACY_BASELINE_MISMATCH');
  const old=remote("SELECT id,tripulante_id,jornada_id,tipo_limite,nivel,created_at,updated_at,resolvido,deleted_at FROM frms_alerta WHERE id IN ("+ids(LEGACY)+") ORDER BY id");
  const oldJourneys=remote("SELECT id,tripulante_id,data,origem,observacao,updated_at,deleted_at FROM frms_jornada WHERE empresa_id=999013 AND id LIKE 'qa-frms-ux-j-%' ORDER BY id");
  const oldHash=createHash('sha256').update(JSON.stringify([old,oldJourneys])).digest('hex');
  const rows=remote("SELECT a.id,j.id AS journey,j.data,f.matricula,a.tipo_limite,a.nivel,j.origem,j.observacao,a.mensagem,j.empresa_id,a.resolvido,a.visualizado,a.notas_resolucao,a.deleted_at,j.deleted_at AS jdeleted,a.valor_atual_min,j.duracao_jornada_minutos "+
    "FROM frms_alerta a JOIN frms_jornada j ON j.id=a.jornada_id AND CAST(j.tripulante_id AS INTEGER)=CAST(a.tripulante_id AS INTEGER) "+
    "JOIN funcionarios f ON f.id=CAST(a.tripulante_id AS INTEGER) AND f.empresa_id=j.empresa_id WHERE a.id IN ("+qaIds+") ORDER BY a.id");
  const complete=Number(state.cases)===4&&Number(state.journeys)===4;
  if(complete)assertNewCases(rows);
  else if(Number(state.cases)!==0||Number(state.journeys)!==0||rows.length!==0)
    throw Error('QA_NEW_CASES_PARTIAL_STATE_STOP');
  return {complete,oldHash,rollbackSafe:complete&&rows.every(x=>Number(x.visualizado)===0&&x.notas_resolucao===null)};
}
function fixedEnvironment(){
  const e=process.env;
  if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!=='Airtrust-Org/airtrust'||
    e.GITHUB_REF!=='refs/heads/main'||e.FRMS_F0B_EXPECTED_MAIN_SHA!==e.GITHUB_SHA||
    !/^[0-9a-f]{40}$/.test(e.GITHUB_SHA||'')||
    e.STAGING_D1_NAME!==TARGET.db||e.STAGING_D1_ID!==TARGET.uuid||
    e.STAGING_D1_ID===BLOCKED_PRODUCTION_DB_ID||
    !e.CLOUDFLARE_API_TOKEN||!e.CLOUDFLARE_ACCOUNT_ID)
    throw Error('STAGING_ONLY_GOVERNED_SCOPE_REQUIRED');
}
// Testable orchestration with a strictly private CLI boundary: actual D1 calls
// still require fixedEnvironment() before this function is reached remotely.
export function runQaF0bMode(mode,{inspectFn=inspect,writeFn=remote,env=process.env}={}){
  if(!['--inspect','--apply','--rollback'].includes(mode))throw Error('QA_F0B_MODE_INVALID');
  const before=inspectFn();
  if(mode==='--inspect')
    return {result:before.complete?'INSPECT_4_OF_4_VALID':'INSPECT_FIXTURE_ABSENT',written:false};
  const normalized=mode.slice(2);
  if(env.FRMS_F0B_RECOVERY_VERIFIED!=='true'||
     env.FRMS_F0B_CONFIRM!==CONFIRM_STAGING_F0B[normalized])
    throw Error('QA_F0B_WRITE_CONFIRMATION_OR_RECOVERY_MISSING');
  if(mode==='--apply'&&!before.complete)writeFn(buildApplySql(),{write:true});
  if(mode==='--rollback'){
    if(!before.complete||!before.rollbackSafe)
      throw Error('QA_F0B_ROLLBACK_REQUIRES_COMPLETE_UNMODIFIED_FIXTURE');
    writeFn(buildRollbackSql(),{write:true});
  }
  const after=inspectFn();
  if(after.complete!==(mode==='--apply')||after.oldHash!==before.oldHash)
    throw Error('QA_F0B_POSTCONDITION_OR_LEGACY_HASH_MISMATCH');
  return {result:mode==='--apply'?'NEW_CASES_4_OF_4_VALID':'NEW_CASES_REMOVED',written:mode==='--rollback'||!before.complete};
}
async function main(){
  const mode=process.argv[2]||'--inspect';
  if(process.argv.length>3)throw Error('QA_F0B_MODE_INVALID');
  fixedEnvironment();
  const outcome=runQaF0bMode(mode);
  if(mode==='--inspect')
    console.log('FRMS_F0B_'+outcome.result+'; tenant=999013; production_writes=0');
  else
    console.log('FRMS_F0B_'+outcome.result+'; tenant=999013; legacy_hash_unchanged=true; production_writes=0');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error('FRMS_F0B_STOP:'+e.message);process.exitCode=1;});
