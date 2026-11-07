#!/usr/bin/env node
// source_reference: #1426, FRMS case treatment/efficacy closure; F0B synthetic QA.
 // operational_decision: isolated new F0C case only in staging tenant 999013.
 // dry_run_required: default --inspect runs SELECT-only; --apply requires reviewed main workflow.
 // rollback_plan_required: D1 Time Travel recovery point before seed, leave audited
 //   resolved F0C case intact; cleanup requires separate reviewed scoped operation.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {login,extractAccessToken,fetchJson} from '../smoke-auth-common.mjs';

export const TARGET=Object.freeze({
  db:'airtrust-db-staging-baseline-20260701',
  uuid:'bf9963f4-eb12-439b-a830-20bbf577ac22',
  tenant:999013,
  crew:'QA-FRMS-UX-01',
  day:'2026-11-05',
  journey:'qa-frms-f0c-j-1',
  alert:'qa-frms-f0c-case-1',
  origin:'SIGVOOS',
});
export const CONFIRM='AIRTRUST_STAGING_FRMS_F0C_LIFECYCLE';
const API='https://airtrust-api-staging.airtrust.workers.dev';
const EMAIL='qa-frms-ux@staging.airtrust.invalid';
const NOTE='CENARIO SINTETICO F0C: TRATAMENTO SEM VALIDADE OPERACIONAL';
const MESSAGE='QA F0C SINTETICO: tratamento e eficacia com auditoria';
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
function requireEnvironment(mode){
  const e=process.env;
  if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!=='Airtrust-Org/airtrust'||
    e.GITHUB_REF!=='refs/heads/main'||!(/^[0-9a-f]{40}$/).test(e.GITHUB_SHA||'')||
    !(/^[0-9a-f]{40}$/).test(e.FRMS_F0C_DEPLOYED_SHA||'')||
    e.STAGING_D1_NAME!==TARGET.db||e.STAGING_D1_ID!==TARGET.uuid||
    e.STAGING_D1_ID==='7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae'||
    !e.CLOUDFLARE_API_TOKEN||!e.CLOUDFLARE_ACCOUNT_ID)
    throw Error('FRMS_F0C_STAGING_ONLY_GOVERNANCE_REQUIRED');
  if(mode==='--apply'&&(e.FRMS_F0C_CONFIRM!==CONFIRM||
    e.FRMS_F0C_RECOVERY_VERIFIED!=='true'||!e.STAGING_SMOKE_PASSWORD))
    throw Error('FRMS_F0C_WRITE_CONFIRMATION_OR_RECOVERY_MISSING');
}
function d1(sql,write=false){
  const args=['wrangler','d1','execute',TARGET.db,'--remote','--json'];
  let dir;
  try{
    if(write){
      dir=mkdtempSync(join(tmpdir(),'frms-f0c-'));
      const file=join(dir,'seed.sql');
      writeFileSync(file,sql,{mode:0o600});
      args.push('--file',file);
    }else args.push('--command',sql);
    const r=spawnSync('npx',args,{cwd:join(process.cwd(),'worker-airtrust'),encoding:'utf8',maxBuffer:4*1024*1024});
    if(r.status!==0)throw Error(write?'FRMS_F0C_STAGING_SEED_REJECTED':'FRMS_F0C_READ_REJECTED');
    // Wrangler --file output may include human-readable status despite --json.
    // Never confuse a successful committed seed with a failed JSON parse.
    if(write)return [];
    const payload=JSON.parse(r.stdout);
    return (Array.isArray(payload)?payload[0]?.results:payload.results)??[];
  }finally{if(dir)rmSync(dir,{recursive:true,force:true});}
}
export function seedSql(){
  return [
    'INSERT INTO frms_jornada (id,tripulante_id,data,status,hora_apresentacao,hora_termino,duracao_jornada_minutos,horas_voo_minutos,registrado_por,origem,observacao,empresa_id,created_at,updated_at,deleted_at) '+
      'SELECT '+q(TARGET.journey)+',f.id,'+q(TARGET.day)+",'ES','07:00:00','16:00:00',540,270,'QA_FRMS_F0C',"+q(TARGET.origin)+','+q(NOTE)+
      ',999013,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL FROM funcionarios f JOIN empresas e ON e.id=f.empresa_id '+
      'WHERE e.id=999013 AND e.codigo='+q('qa_frms_ux_30d')+' AND e.ativo=1 AND e.deleted_at IS NULL '+
      'AND f.matricula='+q(TARGET.crew)+' AND f.ativo=1 AND f.deleted_at IS NULL '+
      'AND NOT EXISTS(SELECT 1 FROM frms_jornada WHERE id='+q(TARGET.journey)+')',
    'INSERT INTO frms_alerta (id,tripulante_id,jornada_id,tipo_limite,nivel,percentual_atingido,valor_atual_min,valor_limite_min,mensagem,visualizado,resolvido,created_at,updated_at,deleted_at) '+
      'SELECT '+q(TARGET.alert)+',f.id,j.id,'+q('REPOUSO')+','+q('CRITICO')+',112,540,480,'+q(MESSAGE)+
      ',0,0,'+q(TARGET.day+' 10:00:00')+',CURRENT_TIMESTAMP,NULL FROM frms_jornada j '+
      'JOIN funcionarios f ON f.id=j.tripulante_id AND f.empresa_id=j.empresa_id '+
      'WHERE j.id='+q(TARGET.journey)+' AND j.empresa_id=999013 AND j.data='+q(TARGET.day)+
      " AND j.origem='SIGVOOS' AND f.matricula="+q(TARGET.crew)+
      ' AND NOT EXISTS(SELECT 1 FROM frms_alerta WHERE id='+q(TARGET.alert)+')',
  ].join(';\n')+';\n';
}
function legacyHash(){
  const rows=d1("SELECT a.id,a.tripulante_id,a.jornada_id,a.resolvido,a.visualizado,a.notas_resolucao,a.updated_at,a.deleted_at,j.data,j.origem,j.updated_at AS jupdated "+
    "FROM frms_alerta a LEFT JOIN frms_jornada j ON j.id=a.jornada_id "+
    "WHERE a.id IN ('qa-frms-ux-case-1','qa-frms-ux-case-2','qa-frms-ux-case-3','qa-frms-ux-case-4',"+
    "'qa-frms-f0b-case-1','qa-frms-f0b-case-2','qa-frms-f0b-case-3','qa-frms-f0b-case-4') ORDER BY a.id");
  if(rows.length!==8)throw Error('FRMS_F0C_BASELINE_8_CASES_MISSING');
  const f0b=rows.filter(x=>String(x.id).startsWith('qa-frms-f0b-'));
  if(f0b.length!==4||f0b.some(x=>Number(x.resolvido)!==0))
    throw Error('FRMS_F0C_BASELINE_4_OPEN_CASES_NOT_INTACT');
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function inspectNew(){
  const rows=d1('SELECT a.id,a.visualizado,a.resolvido,a.resolvido_por,a.notas_resolucao,j.id AS journey,j.empresa_id,j.data,j.origem,j.observacao,f.matricula '+
    'FROM frms_alerta a JOIN frms_jornada j ON j.id=a.jornada_id AND j.tripulante_id=a.tripulante_id '+
    'JOIN funcionarios f ON f.id=a.tripulante_id AND f.empresa_id=j.empresa_id '+
    'WHERE a.id='+q(TARGET.alert));
  const journeyCount=d1('SELECT COUNT(*) AS n FROM frms_jornada WHERE id='+q(TARGET.journey))[0]?.n;
  const audits=d1('SELECT acao FROM auditoria_avancada_v2 WHERE tabela='+q('frms_alerta')+' AND registro_id='+q(TARGET.alert)+' ORDER BY rowid');
  return {rows,journeyCount:Number(journeyCount),audits};
}
function preflight(){
  const row=d1("SELECT "+
    "(SELECT COUNT(*) FROM empresas WHERE id=999013 AND codigo='qa_frms_ux_30d' AND ativo=1 AND deleted_at IS NULL) AS tenant,"+
    "(SELECT COUNT(*) FROM funcionarios WHERE empresa_id=999013 AND matricula="+q(TARGET.crew)+" AND ativo=1 AND deleted_at IS NULL) AS crew,"+
    "(SELECT COUNT(*) FROM frms_jornada j JOIN funcionarios f ON f.id=j.tripulante_id AND f.empresa_id=j.empresa_id WHERE f.matricula="+q(TARGET.crew)+" AND j.data="+q(TARGET.day)+" AND j.deleted_at IS NULL) AS day_conflicts")[0];
  if(Number(row?.tenant)!==1||Number(row?.crew)!==1||Number(row?.day_conflicts)!==0)
    throw Error('FRMS_F0C_TENANT_OR_JOURNEY_DAY_CONFLICT');
  const n=inspectNew();
  if(n.rows.length!==0||n.journeyCount!==0||n.audits.length!==0)
    throw Error('FRMS_F0C_REPLAY_OR_PARTIAL_SEED_REQUIRES_REVIEW');
}
async function authorizedSession(){
  const pwd=String(process.env.STAGING_SMOKE_PASSWORD||'');
  const auth=await login(API,EMAIL,pwd);
  const token=extractAccessToken(auth);
  const companies=await fetchJson(API+'/api/auth/empresas',{headers:{Authorization:'Bearer '+token}});
  const data=companies.json?.data;
  if(companies.status!==200||companies.json?.success!==true||
    Number(data?.empresaAtualId)!==TARGET.tenant||
    !Array.isArray(data.empresas)||data.empresas.length!==1||
    Number(data.empresas[0]?.id)!==TARGET.tenant||
    !['admin','manager'].includes(String(data.empresas[0]?.role||'').toLowerCase()))
    throw Error('FRMS_F0C_AUTH_SCOPE_REJECTED');
  return token;
}
async function put(token,endpoint,data){
  const result=await fetchJson(API+endpoint,{method:'PUT',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(data)});
  return {status:result.status,success:result.json?.success,code:result.json?.code};
}
async function get(token,endpoint){
  const r=await fetchJson(API+endpoint,{headers:{Authorization:'Bearer '+token}});
  if(r.status!==200||r.json?.success!==true)throw Error('FRMS_F0C_AUTH_READ_FAILED');
  return r.json;
}
export function validTreatment(){
  return {responsavel:'Coordenação de QA FRMS',prazo:'2026-11-20',
    acao_mitigacao:'Reposicionar jornada sintética e confirmar repouso antes do retorno.',
    justificativa:'Ensaio autorizado para comprovar rastreabilidade do ciclo de mitigação.',
    evidencia_referencia:'QA-FRMS-F0C-SYNTHETIC'};
}
export const efficacy='Conferência controlada da medida sintética com evidências arquivadas para QA.';
async function lifecycle(token){
  const id=TARGET.alert;
  const listed=await get(token,'/api/frms/alertas?resolvido=false&limit=50');
  if(!listed.data?.some(x=>x.id===id))throw Error('FRMS_F0C_NEW_CASE_NOT_VISIBLE');
  const premature=await put(token,'/api/frms/alertas/'+id+'/resolver',{avaliacao_eficacia:efficacy});
  if(premature.status!==409||premature.code!=='FRMS_CASE_TREATMENT_REQUIRED')
    throw Error('FRMS_F0C_PREMATURE_CLOSURE_NOT_REJECTED');
  const invalid=await put(token,'/api/frms/alertas/'+id+'/tratamento',{responsavel:'x'});
  if(invalid.status!==400||invalid.code!=='FRMS_CASE_TREATMENT_INCOMPLETE')
    throw Error('FRMS_F0C_INCOMPLETE_TREATMENT_NOT_REJECTED');
  const view=await put(token,'/api/frms/alertas/'+id+'/visualizar',{});
  if(view.status!==200||view.success!==true)throw Error('FRMS_F0C_VIEW_COMMIT_UNCONFIRMED');
  const treated=await put(token,'/api/frms/alertas/'+id+'/tratamento',validTreatment());
  if(treated.status!==200||treated.success!==true)
    throw Error('FRMS_F0C_TREATMENT_COMMIT_UNCONFIRMED');
  const afterTreatment=inspectNew().rows[0];
  if(afterTreatment?.resolvido!==0||afterTreatment?.visualizado!==1||
    JSON.parse(String(afterTreatment.notas_resolucao||'null')).schema!=='FRMS_CASE_TREATMENT_V1')
    throw Error('FRMS_F0C_TREATMENT_D1_READBACK_MISMATCH');
  const missingEfficacy=await put(token,'/api/frms/alertas/'+id+'/resolver',{avaliacao_eficacia:'curta'});
  if(missingEfficacy.status!==400||missingEfficacy.code!=='FRMS_CASE_EFFECTIVENESS_REQUIRED')
    throw Error('FRMS_F0C_MISSING_EFFECTIVENESS_NOT_REJECTED');
  const closed=await put(token,'/api/frms/alertas/'+id+'/resolver',{avaliacao_eficacia:efficacy});
  if(closed.status!==200||closed.success!==true)throw Error('FRMS_F0C_CLOSURE_COMMIT_UNCONFIRMED');
  const resolved=await get(token,'/api/frms/alertas?resolvido=true&limit=100');
  if(!resolved.data?.some(x=>x.id===id))throw Error('FRMS_F0C_RESOLVED_READBACK_NOT_VISIBLE');
  const reopen=await put(token,'/api/frms/alertas/'+id+'/resolver',{avaliacao_eficacia:efficacy});
  if(reopen.status!==409||reopen.code!=='FRMS_CASE_TREATMENT_REQUIRED')
    throw Error('FRMS_F0C_REPEAT_CLOSURE_NOT_REJECTED');
}
function afterState(){
  const n=inspectNew();
  const row=n.rows[0];
  if(n.rows.length!==1||n.journeyCount!==1||row?.id!==TARGET.alert||row?.journey!==TARGET.journey||
    Number(row.empresa_id)!==TARGET.tenant||row.matricula!==TARGET.crew||row.data!==TARGET.day||
    row.origem!==TARGET.origin||row.observacao!==NOTE||
    Number(row.visualizado)!==1||Number(row.resolvido)!==1||!row.resolvido_por)
    throw Error('FRMS_F0C_FINAL_LINKAGE_INVALID');
  const notes=JSON.parse(String(row.notas_resolucao||'null'));
  if(notes?.schema!=='FRMS_CASE_RESOLUTION_V1'||notes?.avaliacao_eficacia!==efficacy||
    notes?.responsavel!==validTreatment().responsavel)
    throw Error('FRMS_F0C_FINAL_EFFICACY_NOT_PROVEN');
  if(n.audits.map(x=>x.acao).join(',')!=='VISUALIZADO,TRATAMENTO_REGISTRADO,RESOLVIDO')
    throw Error('FRMS_F0C_AUDIT_TRAIL_INCOMPLETE');
}
async function main(){
  const mode=process.argv[2]||'--inspect';
  if(!['--inspect','--apply'].includes(mode)||process.argv.length>3)throw Error('FRMS_F0C_MODE_INVALID');
  requireEnvironment(mode);
  const before=legacyHash();
  if(mode==='--inspect'){
    preflight();
    console.log('FRMS_F0C_INSPECT_PASS; writes=0; tenant=999013');
    return;
  }
  // Authenticate and verify tenant/permission before any D1 write.
  const token=await authorizedSession();
  preflight();
  d1(seedSql(),true);
  const seeded=inspectNew();
  if(seeded.rows.length!==1||seeded.journeyCount!==1||Number(seeded.rows[0].empresa_id)!==999013||
    seeded.rows[0].origem!=='SIGVOOS'||Number(seeded.rows[0].resolvido)!==0)
    throw Error('FRMS_F0C_SEED_POSTCONDITION_FAILED_STOP_NO_RETRY');
  if(legacyHash()!==before)throw Error('FRMS_F0C_LEGACY_CHANGED_STOP_NO_RETRY');
  // Each PUT is committed at most once; never retry an ambiguous response.
  await lifecycle(token);
  afterState();
  if(legacyHash()!==before)throw Error('FRMS_F0C_LEGACY_CHANGED_AFTER_LIFECYCLE');
  console.log('FRMS_F0C_REAL_API_LIFECYCLE_PASS tenant=999013 view=1 treatment=1 efficacy=1 closed=1 audit=3 baseline_unchanged=true production_writes=0');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error('FRMS_F0C_STOP:'+e.message);process.exitCode=1;});
