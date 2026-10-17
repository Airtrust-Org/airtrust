#!/usr/bin/env node
// source_reference: tenant-6 matrícula 384 PT6C-67C cancellation and reenrollment;
// governed readonly historic evidence; never print learner identity, CMI or suspend_data.
// dry_run_required: readonly only (no apply mode).
// rollback_plan_required: any future D1 repair requires separately reviewed apply/recovery.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const must=(ok,code)=>{if(!ok)throw Error('LMS384_'+code)};
const source=String(process.env.EXPECTED_MAIN_SHA||'');
const production=String(process.env.EXPECTED_PRODUCTION_SHA||'');
const hash=(v)=>createHash('sha256').update(String(v)).digest('hex');
function d1(sql,label){
 must(/^SELECT\b/i.test(sql.trim()) && !/;|\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(sql),'READONLY_SQL_'+label);
 const r=spawnSync('npx',['--no-install','wrangler','d1','execute','airtrust-db',
  '--env','production','--remote','--json','--command',sql],
  {cwd:new URL('../../worker-airtrust/',import.meta.url),encoding:'utf8',
   maxBuffer:10*1024*1024,timeout:90_000,env:process.env});
 must(r.status===0,'D1_SELECT_FAILED_'+label);
 let j;try{j=JSON.parse(r.stdout)}catch{throw Error('LMS384_D1_JSON_'+label)}
 const rows=(Array.isArray(j)?j[0]:j)?.results;
 must(Array.isArray(rows),'D1_ROWS_'+label);
 return rows;
}
const safeInt=(v)=>v==null?null:Number.isFinite(Number(v))?Number(v):null;
const safeStamp=(v)=>typeof v==='string'&&/^\d{4}-\d\d-\d\d/.test(v)?v.slice(0,19):null;
const state=(x)=>String(x??'').toUpperCase().slice(0,26);
const parse=(x)=>{try{return JSON.parse(String(x))}catch{return null}};
const location=(cmi)=>{const obj=parse(cmi);const l=obj?.['cmi.location']??obj?.['cmi.core.lesson_location'];return typeof l==='string'&&/^\d{1,4}(?:\/\d{1,4})?$/.test(l)?l:null};
const summaryScorm=(v)=>({score_raw:safeInt(v?.score_raw),lesson_status:state(v?.lesson_status),
  location:location(v?.cmi_json)||null,cmi_present:Boolean(v?.cmi_json),cmi_hash:v?.cmi_json?hash(v.cmi_json):null,
  suspend_present:Boolean(v?.suspend_data),suspend_hash:v?.suspend_data?hash(v.suspend_data):null});
async function main(){
 must(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REF==='refs/heads/main' &&
  source===process.env.GITHUB_SHA && /^[a-f0-9]{40}$/.test(source) &&
  /^[a-f0-9]{40}$/.test(production),'EXACT_MAIN');
 must(process.env.CONFIRMATION==='AIRTRUST_LMS384_READONLY_EVIDENCE','CONFIRMATION');
 const response=await fetch('https://api.airtrust.online/api/version');
 must(response.ok,'VERSION_HTTP');
 const v=await response.json();
 must(v?.data?.sourceSha===production,'PRODUCTION_CHANGED');
 const cur=d1(`SELECT m.id,m.empresa_id,m.curso_id,m.status,m.deleted_at,m.progresso_pct,m.ultimo_slide,m.updated_at,m.data_inicio,
  p.lesson_status,p.lesson_location,p.score_raw,p.cmi_json,p.suspend_data
  FROM lms_matriculas m LEFT JOIN lms_progresso_scorm p
   ON p.matricula_id=m.id AND p.empresa_id=m.empresa_id
  WHERE m.empresa_id=6 AND m.id=384 AND m.curso_id=34 LIMIT 1`,'current');
 must(cur.length===1&&Number(cur[0].id)===384&&Number(cur[0].empresa_id)===6&&Number(cur[0].curso_id)===34,'IDENTITY');
 const cycles=d1(`SELECT numero_ciclo,status,progresso_pct,score_final,origem,ciclo_atual,created_at,updated_at
 FROM lms_matricula_ciclos WHERE empresa_id=6 AND matricula_id=384 AND curso_id=34
 ORDER BY numero_ciclo DESC LIMIT 12`,'cycles');
 const logs=d1(`SELECT action,created_at,old_values,new_values FROM audit_logs
 WHERE empresa_id=6 AND entity_type='lms_matriculas' AND entity_id=384
 ORDER BY id DESC LIMIT 40`,'audit');
 const audit=logs.map(l=>{
  const old=parse(l.old_values);const next=parse(l.new_values);
  const sc=old?.scorm_progress??old?.scorm??null;
  return {action:String(l.action||'').slice(0,75),at:safeStamp(l.created_at),
   previous_status:state(old?.status),previous_progress:safeInt(old?.progresso_pct??old?.progress),
   prior_scorm:summaryScorm(sc),
   new_status:state(next?.status),new_progress:safeInt(next?.progresso_pct??next?.progress),
   old_state_hash:l.old_values?hash(l.old_values):null};
 });
 const c=cur[0];
 const report={schema_version:1,main_sha:source,production_sha:production,
  tenant:6,enrollment:384,course:34,mode:'read-only',writes:0,
  current:{status:state(c.status),progress:safeInt(c.progresso_pct),
   slide:safeInt(c.ultimo_slide),location:typeof c.lesson_location==='string'?c.lesson_location.slice(0,32):null,
   updated_at:safeStamp(c.updated_at),started_at:safeStamp(c.data_inicio),
   ...summaryScorm(c)},
  cycles:cycles.map(x=>({number:safeInt(x.numero_ciclo),status:state(x.status),
   progress:safeInt(x.progresso_pct),score:safeInt(x.score_final),
   origin:String(x.origem||'').slice(0,40),current:Number(x.ciclo_atual)===1,
   created_at:safeStamp(x.created_at),updated_at:safeStamp(x.updated_at)})),
  audit,contains_recoverable_prior_scorm:audit.some(x=>x.prior_scorm.cmi_present),
  max_historic_cycle_progress:Math.max(0,...cycles.map(x=>Number(x.progresso_pct)||0)),
  personal_data:false};
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
main().catch(e=>{console.error(String(e?.message||'LMS384_READONLY_FAILED').replace(/[^A-Z0-9_:.\-]/gi,'').slice(0,110));process.exitCode=1});
