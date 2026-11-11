#!/usr/bin/env node
// source_reference: ANAC 1167/2026 private spreadsheet, read-only D1 reconciliation 2026-11-11
// operational_decision: owner approved all remaining 2026/2027 proposals, except inactive
// employee and non-renewal-only pilot support. Dual curricula are separated by qualification.
// dry_run_required: same SHA, immutable private manifest, no writes before read-only preflight.
// rollback_plan_required: D1 Time Travel recovery before apply, fail-closed readback.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { assertAllowedProductionBaseUrl, decodeJwtPayload, extractAccessToken, fetchJson, login, selectEmpresa } from '../smoke-auth-common.mjs';

const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const MODE=process.argv[2]||'dry-run';
const PRIVATE_SHA='81ca25f2872efe9b8c77b27bca24fb23c304c854ef2249d473766451f616e18b';
const CODES=['AW-S01','AW-S03','S76-S01','S76-S07','S76-S08','AW-F02','AW-F02-G1','AW-F03','AW-F03-G1','AW-F05','AW-F05-SEM','AW-F06','AW-F06-SEM','S76-F03','S76-F04','S76-F05','S76-F06','S76-F07','S76-F08','S76-F09'];
const QUAL=[30,30,38,38,38,106,33,106,33,33,106,33,106,40,40,40,40,40,40,40];
const EXPECTED={classes:20,participants:45,days:73,physical:16};
const allCodes=CODES.map(x=>"'"+x+"'").join(',');
const sha=s=>createHash('sha256').update(s).digest('hex');
const check=(condition,reason)=>{if(!condition)throw Error(reason)};
const delay=new Int32Array(new SharedArrayBuffer(4));
const digest=rows=>sha(JSON.stringify(rows));
export function reportJSON(obj){return JSON.stringify(obj,null,2)+String.fromCharCode(10);}
function result(obj){
 const data=reportJSON(obj);
 if(process.env.ANAC1167_RESULT_PATH)writeFileSync(process.env.ANAC1167_RESULT_PATH,data,{mode:0o600});
 else process.stdout.write(data);
}
export function manifestValid(raw){
 check(sha(raw)===PRIVATE_SHA,'PRIVATE_MANIFEST_SHA_CHANGED');
 const m=JSON.parse(raw);
 check(m.schema_version===1&&m.tenant_id===6&&m.operation==='CREATE_PLANNED_ONLY_AUTHENTICATED_API','MANIFEST_SCOPE_INVALID');
 check(m.training_groups?.length===EXPECTED.classes,'MANIFEST_CLASS_COUNT_CHANGED');
 check(m.training_groups.map(x=>x.code).join(',')===CODES.join(','),'MANIFEST_CODES_CHANGED');
 check(m.excluded_physical_classes.length===1&&m.excluded_physical_classes[0]==='AW-F04','FORMER_EMPLOYEE_EXCLUSION_CHANGED');
 let count=0,dayCount=0;
 const physical=new Set();
 for(let i=0;i<m.training_groups.length;i++){
  const g=m.training_groups[i],p=g.payload;
  check(p.codigo_turma===g.code&&p.qualificacao_tipo_id===QUAL[i]&&p.status==='PLANEJADO','QUALIFICATION_STATUS_INVALID');
  check((p.modalidade==='SALA')===/^(AW|S76)-S[0-9]/.test(p.codigo_turma),'MODALITY_MISMATCH');
  check(p.data_prevista===p.data_inicio&&p.data_inicio>'2026-11-11'&&p.data_fim<='2027-12-31'&&p.data_fim>=p.data_inicio,'DATE_OUTSIDE_SCOPE');
  check(Array.isArray(p.participante_ids)&&p.participante_ids.length===p.limite_participantes&&p.participante_ids.every(n=>Number.isSafeInteger(n)&&n>0&&n!==72),'PERSON_INVALID');
  check(new Set(p.participante_ids).size===p.participante_ids.length,'DUPLICATED_PERSON');
  check(Array.isArray(p.dias)&&p.dias.length>=2&&p.dias.length<=5,'DAYS_INVALID');
  check(new Set(p.dias.map(x=>x.data)).size===p.dias.length,'DUPLICATE_DAYS');
  check(p.dias.every(x=>x.data>=p.data_inicio&&x.data<=p.data_fim&&x.hora_inicio==='08:00'&&x.hora_fim==='17:00'),'PROVISIONAL_HOURS_CHANGED');
  check(!p.instrutor_id&&!p.programa_treinamento_id&&!p.instrutor_ids?.length,'UNAUTHORIZED_RESOURCES');
  check(/NAO CONFIRMADA/.test(p.observacoes)&&/Nao convocar/.test(p.observacoes),'PROVISIONAL_MARKERS_MISSING');
  physical.add(g.original_code);count+=p.participante_ids.length;dayCount+=p.dias.length;
 }
 check(physical.size===EXPECTED.physical&&count===EXPECTED.participants&&dayCount===EXPECTED.days,'MANIFEST_TOTALS_CHANGED');
 check(!physical.has('AW-F04'),'INACTIVE_PILOT_CLASS_NOT_EXCLUDED');
 return m;
}
function remoteRead(sql,label){
 check(/^\s*SELECT\b/i.test(sql)&&!/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sql),'D1_READ_ONLY_REQUIRED');
 for(let attempt=1;attempt<=6;attempt++){
  const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],{
   cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',env:process.env,timeout:80000,maxBuffer:15*1024*1024});
  let parsed=null;
  try{parsed=JSON.parse(r.stdout)}catch{}
  const response=Array.isArray(parsed)?parsed[0]:parsed;
  if(r.status===0&&response?.success&&Array.isArray(response.results)){
   check(!response.meta?.changed_db&&!response.meta?.rows_written,'D1_UNEXPECTED_WRITE_'+label);
   return response.results;
  }
  if(attempt===6||!/7429|too many resources|is overloaded/i.test((r.stderr||'')+' '+(r.stdout||'')))throw Error('D1_READ_FAILED_'+label);
  Atomics.wait(delay,0,0,attempt*2500);
 }
 throw Error('READ_RETRIES_EXHAUSTED_'+label);
}
export function matchedHistorical(m,rows){
 const desired=new Set(m.training_groups.flatMap(g=>g.payload.participante_ids.map(id=>id+'|'+g.payload.qualificacao_tipo_id+'|'+g.payload.data_inicio)));
 return rows.filter(x=>desired.has(x.funcionario_id+'|'+x.qualificacao_id+'|'+x.day));
}
function verifyState(m){
 const ids=[...new Set(m.training_groups.flatMap(g=>g.payload.participante_ids))].sort((a,b)=>a-b);
 const employee=remoteRead('SELECT id,COALESCE(ativo,1) ativo,COALESCE(status,\'ATIVO\') status FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND id IN ('+ids.join(',')+')','EMPLOYEE');
 check(employee.length===ids.length&&employee.every(x=>Number(x.ativo)===1&&String(x.status).toUpperCase()==='ATIVO'),'STAFF_INACTIVE_OR_MISSING');
 const qualifications=remoteRead('SELECT id,codigo,COALESCE(ativo,1) ativo FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL AND id IN (30,38,33,106,40)','QUALIFICATIONS');
 check(qualifications.length===5&&qualifications.every(q=>Number(q.ativo)===1),'QUALIFICATION_UNAVAILABLE');
 const existing=remoteRead('SELECT id,codigo_turma,status,data_inicio,data_fim,qualificacao_tipo_id FROM treinamentos_planejados WHERE empresa_id=6 AND deleted_at IS NULL AND codigo_turma IN ('+allCodes+') ORDER BY codigo_turma','CLASSES');
 check(new Set(existing.map(e=>e.codigo_turma)).size===existing.length,'DUPLICATE_EXISTING_CODES');
 const history=remoteRead("SELECT funcionario_id,qualificacao_id,date(data_conclusao) day,COALESCE(status,'') status,COUNT(*) n FROM qualificacoes_historico WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(renovada,0)=0 AND funcionario_id IN ("+ids.join(',')+") AND qualificacao_id IN (30,38,33,106,40) AND date(data_conclusao) BETWEEN '2026-12-01' AND '2027-12-31' GROUP BY funcionario_id,qualificacao_id,date(data_conclusao),COALESCE(status,'')",'HISTORIES');
 const overlapping=matchedHistorical(m,history);
 const monthly=remoteRead("SELECT ano,mes,COUNT(*) n FROM escalas_mensais WHERE empresa_id=6 AND deleted_at IS NULL AND ((ano=2026 AND mes=12) OR (ano=2027 AND mes BETWEEN 1 AND 12)) GROUP BY ano,mes ORDER BY ano,mes",'MONTHLY_SCALES');
 const footprint=digest({employee:employee.sort((a,b)=>a.id-b.id),qualifications:qualifications.sort((a,b)=>a.id-b.id),existing,overlapping,monthly});
 return {footprint,existing_count:existing.length,historical_collisions:overlapping.length,monthly_scales:monthly.length};
}
async function admin(){
 check(process.env.E2E_EMAIL&&process.env.E2E_PASSWORD,'PRODUCTION_ADMIN_SECRET_MISSING');
 const logged=await login(API,process.env.E2E_EMAIL,process.env.E2E_PASSWORD);
 let token=extractAccessToken(logged);
 check(typeof token==='string'&&token.length>20,'PRODUCTION_ACCESS_MISSING');
 if(Number(decodeJwtPayload(token)?.empresa_id)!==6){
  const s=await selectEmpresa(API,token,6);
  check(s.status===200,'TENANT_SELECTION_FAILED');
  token=extractAccessToken(s.json);
 }
 check(Number(decodeJwtPayload(token)?.empresa_id)===6,'CROSS_TENANT_BLOCKED');
 const me=await fetchJson(API+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});
 check(me.status===200&&me.json?.success===true&&['admin','administrador','manager','gestor'].includes(String(me.json.data?.role||'').toLowerCase()),'ADMIN_SESSION_REQUIRED');
 return token;
}
async function create(token,p){
 const r=await fetchJson(API+'/api/treinamentos/planejados',{method:'POST',headers:{
  Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(p)});
 check([200,201].includes(r.status)&&r.json?.success===true&&Number(r.json.data?.id)>0,'CREATION_FAILED_HTTP_'+r.status);
 return Number(r.json.data.id);
}
function readBack(m){
 const cls=remoteRead('SELECT id,codigo_turma,status,modalidade,qualificacao_tipo_id,data_inicio,data_fim FROM treinamentos_planejados WHERE empresa_id=6 AND deleted_at IS NULL AND codigo_turma IN ('+allCodes+') ORDER BY codigo_turma','RB_CLASS');
 check(cls.length===EXPECTED.classes,'READBACK_MISSING_CLASSES');
 const idlist=cls.map(x=>Number(x.id));
 check(idlist.every(x=>Number.isSafeInteger(x)&&x>0),'READBACK_INVALID_IDS');
 const ids=idlist.join(',');
 const ps=remoteRead('SELECT tp.treinamento_id,tp.funcionario_id,tp.confirmado,tp.resultado,tp.data_conclusao_efetiva,qh.status history_status FROM treinamentos_participantes tp LEFT JOIN qualificacoes_historico qh ON qh.id=tp.qualificacao_historico_id AND qh.empresa_id=6 AND qh.deleted_at IS NULL WHERE tp.treinamento_id IN ('+ids+') ORDER BY tp.treinamento_id,tp.funcionario_id','RB_ROSTER');
 const days=remoteRead('SELECT treinamento_id,data,hora_inicio,hora_fim,status FROM treinamentos_dias WHERE empresa_id=6 AND deleted_at IS NULL AND treinamento_id IN ('+ids+') ORDER BY treinamento_id,data','RB_DAYS');
 const events=remoteRead("SELECT COUNT(*) n FROM escala_eventos WHERE origem='treinamento' AND deleted_at IS NULL AND tripulacao_id IN ("+idlist.map(x=>"'treinamento:"+x+"'").join(',')+")",'RB_EVENTS');
 let rosterCount=0,dayCount=0;
 const createdIds=[];
 for(const g of m.training_groups){
  const p=g.payload,t=cls.find(x=>x.codigo_turma===g.code);
  check(t&&t.status==='PLANEJADO'&&t.qualificacao_tipo_id===p.qualificacao_tipo_id&&t.modalidade===p.modalidade&&t.data_inicio===p.data_inicio&&t.data_fim===p.data_fim,'RB_CLASS_MISMATCH');
  createdIds.push({code:g.code,id:t.id});
  const links=ps.filter(x=>Number(x.treinamento_id)===Number(t.id));
  check(links.length===p.participante_ids.length,'RB_ROSTER_SIZE');
  check(links.every(x=>p.participante_ids.includes(Number(x.funcionario_id))&&Number(x.confirmado||0)===0&&x.resultado==null&&x.data_conclusao_efetiva==null&&x.history_status==='PLANEJADA'),'RB_HISTORY_INVALID');
  rosterCount+=links.length;
  const dates=days.filter(x=>Number(x.treinamento_id)===Number(t.id));
  check(dates.length===p.dias.length&&dates.every(x=>p.dias.some(y=>x.data===y.data&&x.hora_inicio===y.hora_inicio&&x.hora_fim===y.hora_fim)&&x.status==='ATIVO'),'RB_DAYS_INVALID');
  dayCount+=dates.length;
 }
 check(rosterCount===EXPECTED.participants&&dayCount===EXPECTED.days,'RB_AGGREGATES_INVALID');
 return {ids:createdIds,planned_participations:rosterCount,planned_qualifications:rosterCount,day_records:dayCount,materialized_scale_events:Number(events[0]?.n||0),postconditions_verified:true};
}
export async function main(){
 check(['dry-run','apply'].includes(MODE),'INVALID_EXECUTION_MODE');
 const confirm=MODE==='dry-run'?'ANAC1167_REMAINING_DRYRUN_TENANT6':'ANAC1167_REMAINING_APPLY_TENANT6_PROVISIONAL';
 check(process.env.ANAC1167_CONFIRMATION===confirm,'SCOPE_CONFIRMATION_REQUIRED');
 check(process.env.ANAC1167_EXPECTED_MANIFEST_SHA===PRIVATE_SHA,'EXPECTED_SOURCE_MISMATCH');
 check(process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_SHA===process.env.ANAC1167_EXPECTED_SHA,'EXACT_MAIN_REQUIRED');
 const b64=process.env.ANAC1167_PRIVATE_MANIFEST_B64||'';
 check(b64.length>5000,'PRIVATE_MANIFEST_NOT_AVAILABLE');
 const m=manifestValid(gunzipSync(Buffer.from(b64,'base64'),{maxOutputLength:700000}).toString('utf8'));
 const token=await admin();
 const before=verifyState(m);
 const out={mode:MODE,sha:process.env.GITHUB_SHA,manifest_sha256:PRIVATE_SHA,company_id:6,
  proposal_count:EXPECTED.physical,technical_records:EXPECTED.classes,participants:EXPECTED.participants,
  expected_days:EXPECTED.days,preflight_state_hash:before.footprint,
  existing_count:before.existing_count,history_collisions:before.historical_collisions,
  monthly_scales:before.monthly_scales,mutated:false,convocations_sent:false,qualifications_completed:false};
 check(before.existing_count===0&&before.historical_collisions===0,'PREEXISTING_CLASS_OR_HISTORY');
 if(MODE==='dry-run'){result(out);return;}
 check(process.env.ANAC1167_REVIEWED_STATE_HASH===before.footprint,'PREFLIGHT_CHANGED_SINCE_DRYRUN');
 for(const g of m.training_groups){
  await create(token,g.payload);
  // Controlled D1 load: one training/qualification import at a time.
  Atomics.wait(delay,0,0,3000);
 }
 Object.assign(out,readBack(m),{mutated:true});
 result(out);
}
if(import.meta.url==='file://'+process.argv[1]){
 main().catch(e=>{console.error('ANAC1167_REMAINING_ERROR:'+String(e?.message||e).replace(/[^\w:-]/g,'_').slice(0,160));process.exitCode=1});
}
