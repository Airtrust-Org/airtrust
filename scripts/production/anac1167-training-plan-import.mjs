#!/usr/bin/env node
// One-off governed import through the authenticated production API; no PII in source or logs.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { assertAllowedProductionBaseUrl, decodeJwtPayload, extractAccessToken, fetchJson, login, selectEmpresa } from '../smoke-auth-common.mjs';

const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const CODES=['AW-S02','AW-S04','S76-S02','S76-S03','S76-S04','S76-S05','S76-S06'];
const PRIVATE_SHA='431779174371b68ba70314c556c11b0937442eeb9220e264bf379660e1af9712';
const SOURCE_SHA='96b7fba05c856fd3471d66cf9b23e7b9553198bef42f610baabbcad8119f2392';
const MODE=process.argv[2]||'dry-run';
const digest=v=>createHash('sha256').update(v).digest('hex');
const check=(cond,code)=>{if(!cond)throw Error(code)};
const qstr=v=>"'"+String(v).replace(/'/g,"''")+"'";
const sqlCodes=CODES.map(qstr).join(',');
const output=v=>{
 const txt=JSON.stringify(v,null,2)+'\n';
 if(process.env.ANAC1167_RESULT_PATH)writeFileSync(process.env.ANAC1167_RESULT_PATH,txt,{mode:0o600});
 else process.stdout.write(txt);
};
export function validateManifest(raw){
 check(digest(raw)===PRIVATE_SHA,'MANIFEST_DIGEST_MISMATCH');
 const m=JSON.parse(raw);
 check(m.tenant_id===6&&m.source_sha256===SOURCE_SHA,'MANIFEST_SOURCE_MISMATCH');
 check(m.candidates?.length===7&&m.candidates.map(x=>x.code).join(',')===CODES.join(','),'CANDIDATE_CODES_CHANGED');
 let people=0,days=0;
 for(const entry of m.candidates){
  const p=entry.payload;
  check(p.codigo_turma===entry.code&&p.status==='PLANEJADO','STATUS_OR_CODE_CHANGED');
  check(p.modalidade==='SALA'&&p.qualificacao_tipo_id===(entry.code.startsWith('AW-')?30:38),'QUALIFICATION_CHANGED');
  check(p.data_inicio===p.data_prevista&&p.data_inicio>'2026-11-11'&&p.data_fim<='2027-12-31'&&p.data_fim>=p.data_inicio,'DATE_CHANGED');
  check(p.participante_ids.length===p.limite_participantes&&p.participante_ids.every(n=>Number.isSafeInteger(n)&&n>0),'PARTICIPANTS_INVALID');
  check(new Set(p.participante_ids).size===p.participante_ids.length,'PARTICIPANT_DUPLICATE');
  check(p.dias.length>=2&&p.dias.length<=5&&p.dias.every(d=>d.hora_inicio==='08:00'&&d.hora_fim==='17:00'&&d.data>=p.data_inicio&&d.data<=p.data_fim),'DAY_OUTSIDE_APPROVAL');
  check(new Set(p.dias.map(x=>x.data)).size===p.dias.length,'DUPLICATE_DAY');
  check(!p.instrutor_id&&!p.programa_treinamento_id&&!p.instrutor_ids?.length,'ADDITIONAL_ASSIGNMENT_DENIED');
  people+=p.participante_ids.length;days+=p.dias.length;
 }
 check(people===16&&days===23,'APPROVED_TOTALS_CHANGED');
 return m;
}
// Detect any history the canonical API could reuse on the same qualification/date,
// including CONCLUIDA and CANCELADA. A completed history must never be re-linked.
export function matchingHistoryRows(manifest, rows) {
 const expected = new Set(manifest.candidates.flatMap(c =>
  c.payload.participante_ids.map(id => id+'|'+c.payload.qualificacao_tipo_id+'|'+c.payload.data_inicio)));
 return rows.filter(x => expected.has(x.funcionario_id+'|'+x.qualificacao_id+'|'+x.dia));
}
function readD1(sql,label){
 check(/^\s*SELECT\b/i.test(sql)&&!/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sql),'D1_READONLY_ONLY');
 const pause=new Int32Array(new SharedArrayBuffer(4));
 for(let attempt=1;attempt<=5;attempt++){
  const r=spawnSync('npx',['wrangler','d1','execute','airtrust-db','--env','production','--remote','--json','--command',sql],{
   cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',env:process.env,timeout:60000,maxBuffer:10*1024*1024});
  let data=null;
  try{data=JSON.parse(r.stdout)}catch{}
  const x=Array.isArray(data)?data[0]:data;
  if(r.status===0&&x?.success&&Array.isArray(x.results)){
   check(!x.meta?.changed_db&&!x.meta?.rows_written,'D1_QUERY_UNSAFE_'+label);
   return x.results;
  }
  const failure=(r.stderr||'')+' '+(r.stdout||'');
  if(attempt===5||!/\b7429\b|D1 DB is overloaded|too many resources/i.test(failure))
   throw Error('D1_READ_FAILED_'+label);
  // Strictly read-only retry, never replay an authenticated create operation.
  Atomics.wait(pause,0,0,attempt*2500);
 }
 throw Error('D1_READ_RETRY_EXHAUSTED_'+label);
}
function state(m){
 const ids=[...new Set(m.candidates.flatMap(c=>c.payload.participante_ids))].sort((a,b)=>a-b);
 const people=readD1('SELECT id,COALESCE(ativo,1) ativo,COALESCE(status,\'ATIVO\') status FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND id IN ('+ids.join(',')+')','PEOPLE');
 check(people.length===ids.length&&people.every(p=>Number(p.ativo)===1&&String(p.status).toUpperCase()==='ATIVO'),'INACTIVE_OR_MISSING_EMPLOYEE');
 const types=readD1('SELECT id,codigo,COALESCE(ativo,1) ativo FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL AND id IN (30,38)','TYPES');
 check(types.length===2&&types.every(t=>Number(t.ativo)===1),'TRAINING_MODEL_INACTIVE');
 const existing=readD1('SELECT id,codigo_turma,status,data_inicio,data_fim,qualificacao_tipo_id FROM treinamentos_planejados WHERE empresa_id=6 AND deleted_at IS NULL AND codigo_turma IN ('+sqlCodes+') ORDER BY codigo_turma,id','EXISTING');
 check(new Set(existing.map(r=>r.codigo_turma)).size===existing.length,'DUPLICATE_CODE_PRODUCTION');
 const collisions=readD1("SELECT funcionario_id,qualificacao_id,date(data_conclusao) dia,COALESCE(status,'') qualification_status,COUNT(*) n FROM qualificacoes_historico WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(renovada,0)=0 AND funcionario_id IN ("+ids.join(',')+") AND qualificacao_id IN (30,38) AND date(data_conclusao) BETWEEN '2027-01-01' AND '2027-12-31' GROUP BY funcionario_id,qualificacao_id,date(data_conclusao),COALESCE(status,'')",'HISTORIES');
 const same=matchingHistoryRows(m,collisions);
 const months=readD1('SELECT ano,mes,COUNT(*) n FROM escalas_mensais WHERE empresa_id=6 AND deleted_at IS NULL AND ano=2027 AND mes IN (1,3,4,5,6,8) GROUP BY ano,mes ORDER BY mes','ESCALAS');
 const hash=digest(JSON.stringify({people:people.sort((a,b)=>a.id-b.id),types:types.sort((a,b)=>a.id-b.id),existing,same,months}));
 return {hash,existing_count:existing.length,planned_collision_count:same.length,escalas_months_count:months.length};
}
async function adminToken(){
 check(process.env.E2E_EMAIL&&process.env.E2E_PASSWORD,'ADMIN_CREDENTIALS_MISSING');
 const logged=await login(API,process.env.E2E_EMAIL,process.env.E2E_PASSWORD);
 let token=extractAccessToken(logged);
 check(token.length>20,'TOKEN_MISSING');
 if(Number(decodeJwtPayload(token)?.empresa_id)!==6){
  const sel=await selectEmpresa(API,token,6);
  check(sel.status===200,'TENANT_SELECTION_FAILED');
  token=extractAccessToken(sel.json);
 }
 check(Number(decodeJwtPayload(token)?.empresa_id)===6,'TENANT_MISMATCH');
 const me=await fetchJson(API+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});
 check(me.status===200&&me.json?.success===true,'USER_SESSION_INVALID');
 check(['admin','administrador','manager','gestor'].includes(String(me.json.data?.role||'').toLowerCase()),'ROLE_DENIED');
 return token;
}
async function create(token,payload){
 const res=await fetchJson(API+'/api/treinamentos/planejados',{method:'POST',headers:{
  'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify(payload)});
 check([200,201].includes(res.status)&&res.json?.success===true&&Number(res.json.data?.id)>0,
  'CREATE_API_FAILED_HTTP_'+res.status+'_CODE_'+String(res.json?.code||'NONE').replace(/[^\w]/g,'').slice(0,35));
 return Number(res.json.data.id);
}
function verify(m){
 const rows=readD1('SELECT id,codigo_turma,status,data_inicio,data_fim,qualificacao_tipo_id,modalidade FROM treinamentos_planejados WHERE empresa_id=6 AND deleted_at IS NULL AND codigo_turma IN ('+sqlCodes+') ORDER BY codigo_turma','VERIFY_CLASSES');
 check(rows.length===7,'READBACK_CLASS_COUNT');
 const numericIds=rows.map(r=>Number(r.id));
 check(numericIds.every(x=>Number.isSafeInteger(x)&&x>0),'READBACK_ID_INVALID');
 const idSql=numericIds.join(',');
 const allPeople=readD1('SELECT tp.treinamento_id,tp.funcionario_id,tp.confirmado,tp.resultado,tp.data_conclusao_efetiva,tp.qualificacao_historico_id,qh.status q_status FROM treinamentos_participantes tp LEFT JOIN qualificacoes_historico qh ON qh.id=tp.qualificacao_historico_id AND qh.empresa_id=6 AND qh.deleted_at IS NULL WHERE tp.treinamento_id IN ('+idSql+') ORDER BY tp.treinamento_id,tp.funcionario_id','VERIFY_PARTICIPANTS');
 const allDays=readD1('SELECT treinamento_id,data,hora_inicio,hora_fim,status FROM treinamentos_dias WHERE empresa_id=6 AND deleted_at IS NULL AND treinamento_id IN ('+idSql+') ORDER BY treinamento_id,data','VERIFY_DAYS');
 const eventLinks=numericIds.map(id=>qstr('treinamento:'+id)).join(',');
 const allEvents=readD1("SELECT tripulacao_id,COUNT(*) n FROM escala_eventos WHERE origem='treinamento' AND tripulacao_id IN ("+eventLinks+") AND deleted_at IS NULL AND status='pendente' GROUP BY tripulacao_id",'VERIFY_EVENTS');
 let people=0,qual=0,days=0;
 const ids=[];
 for(const c of m.candidates){
  const t=rows.find(x=>x.codigo_turma===c.code);
  check(t&&t.status==='PLANEJADO'&&t.data_inicio===c.payload.data_inicio&&t.data_fim===c.payload.data_fim&&t.qualificacao_tipo_id===c.payload.qualificacao_tipo_id&&t.modalidade==='SALA','CLASS_DATA_MISMATCH');
  ids.push({code:c.code,id:t.id});
  const p=allPeople.filter(x=>Number(x.treinamento_id)===Number(t.id));
  check(p.length===c.payload.participante_ids.length,'PARTICIPANTS_COUNT_MISMATCH');
  check(p.every(x=>c.payload.participante_ids.includes(Number(x.funcionario_id))&&Number(x.confirmado||0)===0&&x.resultado==null&&x.data_conclusao_efetiva==null&&x.q_status==='PLANEJADA'),'HISTORIES_NOT_PLANNED');
  people+=p.length;qual+=p.filter(x=>x.q_status==='PLANEJADA').length;
  const dd=allDays.filter(x=>Number(x.treinamento_id)===Number(t.id));
  check(dd.length===c.payload.dias.length&&dd.every(x=>c.payload.dias.some(y=>y.data===x.data&&y.hora_inicio===x.hora_inicio&&y.hora_fim===x.hora_fim)&&x.status==='ATIVO'),'DAYS_NOT_MATCHING');
  days+=dd.length;
 }
 check(people===16&&qual===16&&days===23,'FINAL_TOTAL_MISMATCH');
 const events=allEvents.reduce((sum,x)=>sum+Number(x.n||0),0);
 return {ids,participation_count:people,planned_qualifications:qual,effective_days:days,materialized_escala_events:events,postconditions_verified:true};
}
export async function main(){
 check(['dry-run','apply'].includes(MODE),'MODE_INVALID');
 const expected=MODE==='dry-run'?'ANAC1167_DRYRUN_SEVEN_TURMAS_TENANT6':'ANAC1167_APPLY_SEVEN_TURMAS_TENANT6_NO_EMAIL';
 check(process.env.ANAC1167_CONFIRMATION===expected,'CONFIRMATION_MISMATCH');
 check(process.env.ANAC1167_EXPECTED_MANIFEST_SHA===PRIVATE_SHA,'HASH_NOT_APPROVED');
 check(process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_SHA===process.env.ANAC1167_EXPECTED_SHA,'SHA_NOT_EXACT_MAIN');
 const encoded=process.env.ANAC1167_PRIVATE_MANIFEST_B64||'';
 check(encoded.length>3000,'PRIVATE_SECRET_MISSING');
 const m=validateManifest(Buffer.from(encoded,'base64').toString('utf8'));
 const token=await adminToken();
 const before=state(m);
 const result={mode:MODE,main_sha:process.env.GITHUB_SHA,source_sha256:SOURCE_SHA,manifest_sha256:PRIVATE_SHA,
  tenant_id:6,class_count:7,participants:16,preflight_state_hash:before.hash,
  existing_count:before.existing_count,planned_collisions:before.planned_collision_count,
  escalas_months_count:before.escalas_months_count,mutated:false,email_sent:false,pii_emitted:false};
 check(before.existing_count===0&&before.planned_collision_count===0,'BASELINE_CHANGED');
 if(MODE==='dry-run'){output(result);return;}
 check(process.env.ANAC1167_REVIEWED_STATE_HASH===before.hash,'REVIEWED_STATE_HASH_CHANGED');
 for(const c of m.candidates)await create(token,c.payload);
 Object.assign(result,verify(m),{mutated:true});
 output(result);
}
if(import.meta.url==='file://'+process.argv[1]){
 main().catch(e=>{console.error('ANAC1167_ERROR:'+String(e?.message||e).replace(/[^\w:-]/g,'_').slice(0,150));process.exitCode=1});
}
