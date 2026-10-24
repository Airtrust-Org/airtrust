#!/usr/bin/env node
import {createHash,createCipheriv,createPublicKey,publicEncrypt,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertAllowedProductionBaseUrl,extractAccessToken,fetchJson,login} from '../smoke-auth-common.mjs';
const BASE=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
const MODE=String(process.env.LMS36_MODE||'');
const MAIN=String(process.env.EXPECTED_MAIN_SHA||'');
const PROD=String(process.env.EXPECTED_PRODUCTION_SHA||'');
const fail=(x,c)=>{if(!x)throw Error('LMS36_'+c);};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function call(token,path,method,body){
  fail(path.startsWith('/api/lms/')||path.startsWith('/api/auth/')||path==='/api/empresas/minha','PATH_SCOPE');
  return fetchJson(BASE+path,{method:method||'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
async function pin(){
 const r=await fetchJson(BASE+'/api/version');
 fail(r.status===200&&String((r.json?.data||r.json)?.sourceSha||'')===PROD,'PRODUCTION_SHA');
}
async function authorize(){
 const email=process.env.PROD_EMAIL,password=process.env.PROD_PASSWORD;
 fail(email&&password,'ADMIN_CREDS');
 let token=extractAccessToken(await login(BASE,email,password));fail(token,'AUTH');
 const companies=await call(token,'/api/auth/empresas');
 fail(companies.status===200&&companies.json?.data?.empresas?.some(x=>Number(x.id)===6),'TENANT');
 if(Number(companies.json?.data?.empresaAtualId)!==6){
  const selection=await call(token,'/api/auth/select-empresa','POST',{empresaId:6});
  fail(selection.status===200&&selection.json?.data?.accessToken,'SELECT_TENANT');
  token=selection.json.data.accessToken;
 }
 const [me,company]=await Promise.all([call(token,'/api/auth/me'),call(token,'/api/empresas/minha')]);
 fail(me.status===200&&['ADMIN','ADMINISTRADOR'].includes(String(me.json?.data?.role||'').toUpperCase()),'ADMIN_RBAC');
 fail(company.status===200&&Number(company.json?.data?.id)===6,'CURRENT_TENANT');
 return token;
}
async function enrollment(token){
 const r=await call(token,'/api/lms/matriculas/36');
 fail(r.status===200&&r.json?.success===true,'ENROLLMENT_READ');
 const x=r.json.data;
 fail(Number(x.id)===36&&Number(x.curso_id)===3,'ENROLLMENT_SCOPE');
 return x;
}
function preflight(x){
 const edition=x.edition_mismatch;
 fail(x.status==='EM_ANDAMENTO'&&Number(x.progresso_pct)===11,'STATE_CHANGED');
 fail(edition?.required===true&&Number(edition.previous_total)===84&&Number(edition.active_total)===70,'EDITION_CHANGED');
 fail(!x.qualificacao_historico_id&&!x.data_conclusao,'QUALIFICATION_EXISTS');
 const snapshot={id:36,course:3,status:x.status,progress:x.progresso_pct,previous:edition.previous_total,active:edition.active_total,reason:edition.reason||null,location:x.scorm?.lesson_location||x.lesson_location||null,updated_at:x.updated_at||null};
 return {schema_version:1,mode:'preflight',tenant:6,matricula_id:36,curso_id:3,old_total:84,new_total:70,main_sha:MAIN,production_sha:PROD,fingerprint:digest(snapshot),writes:0,personal_data:false};
}
async function pageAll(token,path){
 const result=[];
 for(let page=1;page<=100;page++){
  const q=path+(path.includes('?')?'&':'?')+'page='+page+'&limit=200';
  const r=await call(token,q);
  fail(r.status===200&&Array.isArray(r.json?.data),'LIST_HTTP');
  const total=Number(r.json?.pagination?.total);
  fail(Number.isSafeInteger(total)&&total>=0,'LIST_TOTAL');
  result.push(...r.json.data);
  fail(result.length<=20000,'LIST_BOUND');
  if(result.length>=total){fail(result.length===total,'LIST_DRIFT');return result;}
  fail(r.json.data.length>0,'LIST_STALLED');
 }
 throw Error('LMS36_PAGE_LIMIT');
}
async function encryptedRoster(token){
 const publicKey=process.env.LMS99_PUBLIC_KEY_DER_B64;
 fail(typeof publicKey==='string'&&publicKey.length>200,'ROSTER_PUBLIC_KEY');
 const courses=await pageAll(token,'/api/lms/cursos');
 const rows=[];
 for(const course of courses){
  if(!Number.isInteger(Number(course.id))||Number(course.id)<=0)continue;
  const list=await pageAll(token,'/api/lms/matriculas/curso/'+Number(course.id)+'?status=EM_ANDAMENTO');
  for(const e of list){
   const raw=Number(e.progresso_bruto??e.progresso_pct);
   const effective=Number(e.progresso_efetivo??Math.min(raw,99));
   if(e.status!=='EM_ANDAMENTO'||effective!==99||raw<99||raw>100)continue;
   fail(typeof e.funcionario_nome==='string'&&e.funcionario_nome.trim(),'STUDENT_NAME_MISSING');
   rows.push({aluno:e.funcionario_nome.trim(),curso:String(course.titulo||course.nome||'').trim(),matricula_id:Number(e.id),curso_id:Number(course.id),progresso_bruto:raw,progresso_exibido:99});
  }
 }
 rows.sort((a,b)=>a.aluno.localeCompare(b.aluno,'pt-BR')||a.curso.localeCompare(b.curso,'pt-BR'));
 const aes=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',aes,iv);
 const payload=Buffer.from(JSON.stringify({tenant:6,source_sha:PROD,generated_at:new Date().toISOString(),scope:'EM_ANDAMENTO, 99% efetivo, todos cursos visíveis, empresa 6',rows}));
 const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
 const publicObj=createPublicKey({key:Buffer.from(publicKey,'base64'),format:'der',type:'spki'});
 const envelope={version:1,key:publicEncrypt({key:publicObj,oaepHash:'sha256'},aes).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
 writeFileSync(process.env.RUNNER_TEMP+'/lms99-encrypted.json',JSON.stringify(envelope),{mode:0o600});
 return {total:rows.length,cursos:new Set(rows.map(x=>x.curso_id)).size,encrypted:true};
}
async function main(){
 fail(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','ACTIONS_MAIN_ONLY');
 fail(MAIN===process.env.GITHUB_SHA&&/^[a-f0-9]{40}$/.test(MAIN)&&/^[a-f0-9]{40}$/.test(PROD),'SHA_SCOPE');
 fail(['preflight','apply'].includes(MODE)&&process.env.LMS36_CONFIRMATION==='AIRTRUST_LMS36_'+MODE.toUpperCase(),'CONFIRM');
 await pin();const token=await authorize();const before=await enrollment(token),plan=preflight(before);
 if(MODE==='preflight'){
  const roster=await encryptedRoster(token);
  writeFileSync(process.env.RUNNER_TEMP+'/lms36-plan.json',JSON.stringify(plan),{mode:0o600});
  process.stdout.write(JSON.stringify({...plan,roster})+'\n');
  return;
 }
 fail(plan.fingerprint===process.env.REVIEWED_LMS36_FINGERPRINT,'REVIEWED_STATE_CHANGED');
 await pin();
 const res=await call(token,'/api/lms/matriculas/36/nova-edicao','POST',{reason:'Autorização expressa da Gerência de Treinamento em 16/10/2026. Matrícula 36, curso 3, edição anterior 84 unidades e nova edição 70. Preservar histórico e abrir ciclo auditado.'});
 fail(res.status===200&&res.json?.success===true&&res.json?.data?.new_edition===true,'API_RESTART_REJECTED');
 const after=await enrollment(token);
 fail(after.status==='NAO_INICIADO'&&Number(after.progresso_pct)===0&&!after.edition_mismatch&&!after.data_conclusao,'POSTCHECK');
 process.stdout.write(JSON.stringify({mode:'apply',tenant:6,matricula_id:36,curso_id:3,old_total:84,new_total:70,progress_new:0,status:'NAO_INICIADO',writes:1,personal_data:false})+'\n');
}
main().catch(e=>{console.error('LMS36_GOVERNED:'+String(e.message).slice(0,110));process.exitCode=1;});
