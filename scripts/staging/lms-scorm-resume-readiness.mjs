#!/usr/bin/env node
// Staging-only, READ-ONLY readiness check for physical SCORM resume QA.
import fs from 'node:fs';
import { assertAllowedStagingBaseUrl, extractAccessToken, fetchJson, login } from '../smoke-auth-common.mjs';
const API=assertAllowedStagingBaseUrl('https://airtrust-api-staging.airtrust.workers.dev');
const SHA=String(process.env.RELEASE_SHA||'').toLowerCase();
const assert=(ok,code)=>{if(!ok) throw Error(code);};
const get=(route,token)=>fetchJson(API+route,{
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
async function run(){
  assert(/^[0-9a-f]{40}$/.test(SHA),'SCORM_QA_INVALID_SHA');
  const live=await fetchJson(API+'/api/version');
  assert(live.status===200 && live.json?.data?.environment==='staging' &&
    String(live.json?.data?.sourceSha||'').toLowerCase()===SHA,'SCORM_QA_SHA_MISMATCH');
  const email=process.env.QA_EXAMINER_ADMIN_EMAIL||'qa-examiner-admin@staging.airtrust.invalid';
  const password=process.env.QA_EXAMINER_ADMIN_PASSWORD||'';
  assert(password.length>0,'SCORM_QA_SECRET_MISSING');
  let token=extractAccessToken(await login(API,email,password));
  const companies=await get('/api/auth/empresas',token);
  assert(companies.status===200,'SCORM_QA_TENANT_LOOKUP_FAILED');
  const company=(companies.json?.data?.empresas||[]).find(x=>x.codigo==='qa_examiner_training');
  assert(Number(company?.id)>0,'SCORM_QA_TENANT_MISSING');
  if(Number(companies.json?.data?.empresaAtualId)!==Number(company.id)){
    const selected=await fetchJson(API+'/api/auth/select-empresa',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({empresaId:Number(company.id)})});
    assert(selected.status===200,'SCORM_QA_TENANT_SWITCH_FAILED');
    token=selected.json?.data?.accessToken;
    assert(typeof token==='string'&&token.length>0,'SCORM_QA_TOKEN_MISSING');
  }
  const mine=await get('/api/empresas/minha',token);
  assert(mine.status===200 && Number(mine.json?.data?.id)===Number(company.id),
    'SCORM_QA_TENANT_MISMATCH');
  const catalog=await get('/api/lms/cursos?publicados=1',token);
  assert(catalog.status===200 && catalog.json?.success===true,
    'SCORM_QA_CATALOG_UNAVAILABLE');
  const courses=Array.isArray(catalog.json?.data)?catalog.json.data:
    Array.isArray(catalog.json?.data?.cursos)?catalog.json.data.cursos:null;
  assert(Array.isArray(courses),'SCORM_QA_CATALOG_SHAPE_UNKNOWN');
  const candidates=courses.filter(x=>/^QA SCORM /i.test(String(x.titulo||'')));
  let active=0;
  for(const item of candidates){
    const id=Number(item.id);
    if(!Number.isSafeInteger(id)||id<=0) continue;
    const detail=await get('/api/lms/cursos/'+id,token);
    const course=detail.json?.data;
    if(detail.status!==200||!course||!/^QA SCORM /i.test(String(course.titulo||''))||
      String(course.tipo_conteudo)!=='scorm'||Number(course.publicado)!==1||
      Number(course.ativo)!==1||!course.scorm_launch_file||
      !course.scorm_package_r2_prefix) continue;
    const v=await get('/api/lms/cursos/'+id+'/scorm-package-versions',token);
    assert(v.status===200&&Array.isArray(v.json?.data),'SCORM_QA_VERSION_LIST_FAILED');
    if(v.json.data.some(p=>String(p.status).toUpperCase()==='ACTIVE'&&
      (p.r2Prefix??p.r2_prefix)===course.scorm_package_r2_prefix&&
      /^[a-f0-9]{64}$/i.test(String(p.packageSha256??p.package_sha256??''))))
      active++;
  }
  assert(active===1,active===0?'BLOCKED_NO_ACTIVE_QA_SCORM_PACKAGE':
    'BLOCKED_AMBIGUOUS_QA_SCORM_PACKAGE');
  const result={ready:true,synthetic_active_courses:active,
    learner:'QA-PARTICIPANTE-ALFA',sha:SHA,staging_only:true,remote_data_writes:0,
    next:'SCOPED_ENROLLMENT_LAUNCH_COMMIT_RESUME_AND_CLEANUP'};
  fs.mkdirSync('qa-state/staging-lms-scorm',{recursive:true});
  fs.writeFileSync('qa-state/staging-lms-scorm/resume-readiness.json',
    JSON.stringify(result)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
}
run().catch(e=>{
  const message=String(e?.message||'');
  console.error(/^(SCORM_QA_|BLOCKED_)/.test(message)?message:'SCORM_QA_UNCLASSIFIED');
  process.exitCode=1;
});