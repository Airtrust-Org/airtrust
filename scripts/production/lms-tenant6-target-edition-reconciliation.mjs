#!/usr/bin/env node
// Only tenant-6 authenticated admin API. Named employee edition recovery.
// No production SQL writes, no SCORM forged completion, no PII in logs.
import {createHash,createHmac,createCipheriv,createPublicKey,publicEncrypt,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertAllowedProductionBaseUrl,extractAccessToken,fetchJson,login} from '../smoke-auth-common.mjs';

const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const MODE=String(process.env.LMS_EDITION_TARGET_MODE||'');
const PROD=String(process.env.EXPECTED_PRODUCTION_SHA||'');
const MAIN=String(process.env.EXPECTED_MAIN_SHA||'');
const fail=(ok,code)=>{if(!ok)throw Error('LMS_EDITION_TARGET_'+code)};
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
const targetNameSha=String(process.env.LMS_EDITION_TARGET_NAME_SHA256||'');
const isTarget=value=>{
 const parts=normalized(value).split(' ').filter(Boolean);
 return parts.length>=2 && createHash('sha256').update(parts[0]+'|'+parts[parts.length-1]).digest('hex')===targetNameSha;
};
const digest=value=>createHmac('sha256',String(process.env.PROD_PASSWORD||'')).update(JSON.stringify(value)).digest('hex');

async function req(token,path,method,body){
 fail(path.startsWith('/api/lms/')||path.startsWith('/api/auth/')||path==='/api/empresas/minha','PATH');
 return fetchJson(API+path,{method:method||'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
async function pin(){
 const r=await fetchJson(API+'/api/version');const d=r.json?.data||r.json;
 fail(r.status===200&&String(d?.sourceSha||'').toLowerCase()===PROD,'PRODUCTION_SHA_CHANGED');
}
async function authenticate(){
 const email=String(process.env.PROD_EMAIL||'').trim(),password=String(process.env.PROD_PASSWORD||'');
 fail(email&&password,'ADMIN_CREDENTIAL_MISSING');
 let token=extractAccessToken(await login(API,email,password));fail(token,'AUTH');
 const r=await req(token,'/api/auth/empresas');
 fail(r.status===200&&r.json?.data?.empresas?.some(x=>Number(x.id)===6),'TENANT_NOT_ALLOWED');
 if(Number(r.json?.data?.empresaAtualId)!==6){
  const s=await req(token,'/api/auth/select-empresa','POST',{empresaId:6});
  fail(s.status===200&&s.json?.data?.accessToken,'TENANT_SWITCH');
  token=s.json.data.accessToken;
 }
 const [me,company]=await Promise.all([req(token,'/api/auth/me'),req(token,'/api/empresas/minha')]);
 fail(me.status===200&&['ADMIN','ADMINISTRADOR'].includes(normalized(me.json?.data?.role)),'ADMIN_REQUIRED');
 fail(company.status===200&&Number(company.json?.data?.id)===6,'TENANT_CONTEXT');
 return token;
}
async function all(token,path){
 const result=[];let known=null;
 for(let page=1;page<=100;page++){
  const u=path+(path.includes('?')?'&':'?')+'page='+page+'&limit=200';
  const r=await req(token,u);
  fail(r.status===200&&Array.isArray(r.json?.data),'PAGINATION_HTTP');
  const total=Number(r.json?.pagination?.total);
  fail(Number.isSafeInteger(total)&&total>=0,'PAGINATION_TOTAL');
  if(known!==null)fail(known===total,'PAGINATION_DRIFT');else known=total;
  result.push(...r.json.data);
  fail(result.length<=30000,'ROWS_LIMIT');
  if(result.length>=total){fail(result.length===total,'ROWS_DRIFT');return result;}
  fail(r.json.data.length>0,'PAGINATION_STALLED');
 }
 throw Error('LMS_EDITION_TARGET_PAGE_LIMIT');
}
function summary(row,course,detail){
 const e=detail.edition_mismatch||null;
 const eligible=detail.status==='EM_ANDAMENTO' && e?.required===true &&
  !detail.qualificacao_historico_id && !detail.data_conclusao && Number(e.active_total)>0 &&
  Number(e.previous_total)>0;
 return {
  id:Number(row.id),funcionario_id:Number(row.funcionario_id),course_id:Number(course.id),
  course_title:String(course.titulo||course.nome||'').trim(),status:String(detail.status),
  progress:Number(detail.progresso_pct),lesson_location:detail.scorm?.lesson_location||detail.lesson_location||null,
  old_total:e?.previous_total??null,new_total:e?.active_total??null,
  reason:e?.reason||null,updated_at:detail.updated_at||null,
  eligible,
 };
}
function fingerprint(x) {
 // A named enrollment's title is not a proof of edition; identity, CMI location,
 // server-calculated edition mismatch and last update are.
 return digest([x.id,x.funcionario_id,x.course_id,x.status,x.progress,x.lesson_location,
   x.old_total,x.new_total,x.reason,x.updated_at,x.eligible]);
}
async function scan(token){
 const courses=await all(token,'/api/lms/cursos'),rows=[];let employeeId=null;
 for(const c of courses){
  if(!Number.isInteger(Number(c.id))||Number(c.id)<=0)continue;
  const enrollments=await all(token,'/api/lms/matriculas/curso/'+Number(c.id)+'?status=EM_ANDAMENTO');
  for(const row of enrollments){
   if(!isTarget(row.funcionario_nome))continue;
   const eid=Number(row.funcionario_id),id=Number(row.id);
   fail(Number.isInteger(eid)&&eid>0&&Number.isInteger(id)&&id>0,'EMPLOYEE_ID');
   if(employeeId!==null)fail(eid===employeeId,'EMPLOYEE_AMBIGUOUS');else employeeId=eid;
   const d=await req(token,'/api/lms/matriculas/'+id);
   fail(d.status===200&&d.json?.success===true,'DETAIL_HTTP');
   const detail=d.json.data;
   fail(Number(detail.id)===id&&Number(detail.curso_id)===Number(c.id) &&
     Number(detail.funcionario_id)===eid,'DETAIL_CROSS_TENANT');
   rows.push(summary(row,c,detail));
  }
 }
 fail(employeeId!==null,'EMPLOYEE_NOT_FOUND');
 rows.sort((a,b)=>a.id-b.id);
 fail(rows.every((x,i)=>i===0||rows[i-1].id!==x.id),'DUPLICATE_ENROLLMENT');
 return {employeeId,rows,eligible:rows.filter(r=>r.eligible)};
}
function plan(scanned){
 const candidates=scanned.eligible.map(x=>({id:x.id,proof:fingerprint(x)}));
 return {schema_version:1,mode:'preflight',tenant:6,main_sha:MAIN,production_sha:PROD,
   scanned_count:scanned.rows.length,blocked_count:candidates.length,
   cohort_proof:digest([scanned.employeeId,candidates]),writes:0,personal_data:false};
}
function encrypt(scanned){
 const der=String(process.env.LMS_EDITION_TARGET_PUBLIC_KEY_DER_B64||'');
 fail(der.length>200,'PUBLIC_KEY_MISSING');
 const publicKey=createPublicKey({key:Buffer.from(der,'base64'),format:'der',type:'spki'});
 const aes=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',aes,iv);
 const payload=Buffer.from(JSON.stringify({tenant:6,source_sha:PROD,generated_at:new Date().toISOString(),
   employee_match:'two-token-name-match',enrollments:scanned.rows}));
 const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
 const envelope={v:1,alg:'RSA-OAEP-SHA256+AES-256-GCM',
   key:publicEncrypt({key:publicKey,oaepHash:'sha256'},aes).toString('base64'),
   iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
   data:encrypted.toString('base64')};
 writeFileSync(process.env.RUNNER_TEMP+'/lms-employee-private.json',JSON.stringify(envelope),{mode:0o600});
}
function targets(){
 const parts=String(process.env.LMS_EDITION_TARGET_TARGET_IDS||'').trim().split(',').map(x=>x.trim());
 fail(parts.length>=1&&parts.length<=3,'TARGET_COUNT');
 const ids=parts.map(x=>{fail(/^[1-9]\d{0,7}$/.test(x),'TARGET_FORMAT');return Number(x)});
 fail(new Set(ids).size===ids.length,'TARGET_DUPLICATE');
 return ids;
}
async function main(){
 fail(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','MAIN_ONLY');
 fail(MAIN===process.env.GITHUB_SHA&&/^[a-f0-9]{40}$/.test(MAIN)&&/^[a-f0-9]{40}$/.test(PROD),'SHA_PIN');
 fail(['preflight','apply'].includes(MODE),'MODE');
 fail(/^[0-9a-f]{64}$/.test(targetNameSha),'TARGET_HASH');
 fail(process.env.LMS_EDITION_TARGET_CONFIRMATION==='AIRTRUST_LMS_EDITION_TARGET_'+MODE.toUpperCase(),'CONFIRMATION');
 await pin();
 const token=await authenticate(),scanned=await scan(token),pre=plan(scanned);
 if(MODE==='preflight'){
  encrypt(scanned);
  writeFileSync(process.env.RUNNER_TEMP+'/lms-employee-plan.json',JSON.stringify(pre),{mode:0o600});
  process.stdout.write(JSON.stringify(pre)+'\n');
  return;
 }
 fail(pre.cohort_proof===process.env.REVIEWED_LMS_EDITION_TARGET_PROOF,'COHORT_CHANGED');
 const selected=targets();
 fail(selected.every(id=>scanned.eligible.some(x=>x.id===id)),'TARGET_NOT_ELIGIBLE');
 const completed=[];
 for(const id of selected){
  await pin();
  const before=await req(token,'/api/lms/matriculas/'+id);
  fail(before.status===200,'ROW_READ_FAILED');
  const previous=scanned.eligible.find(x=>x.id===id);
  const observed=summary({id,funcionario_id:scanned.employeeId}, {id:previous.course_id,titulo:previous.course_title}, before.json?.data||{});
  fail(fingerprint(observed)===fingerprint(previous),'ROW_CHANGED');
  const reason='Autorização da Gerência de Treinamento para o funcionário funcionário designado: nova edição SCORM incompatível; preservar evidências da edição anterior. Matrícula '+id+', curso '+previous.course_id+', unidades '+previous.old_total+' para '+previous.new_total+'.';
  const result=await req(token,'/api/lms/matriculas/'+id+'/nova-edicao','POST',{reason});
  fail(result.status===200&&result.json?.success===true&&result.json?.data?.new_edition===true,'CANONICAL_RESET_REJECTED');
  const after=await req(token,'/api/lms/matriculas/'+id);
  fail(after.status===200&&after.json?.data?.status==='NAO_INICIADO'&&
    Number(after.json.data.progresso_pct)===0&&!after.json.data.edition_mismatch,'POSTCHECK');
  completed.push({id,course_id:previous.course_id,old_total:previous.old_total,new_total:previous.new_total});
 }
 process.stdout.write(JSON.stringify({schema_version:1,mode:'apply',tenant:6,production_sha:PROD,
   applied:completed,write_count:completed.length,personal_data:false})+'\n');
}
main().catch(e=>{console.error('LMS_EDITION_TARGET_GOVERNED_'+String(e.message).slice(0,90));process.exitCode=1;});
