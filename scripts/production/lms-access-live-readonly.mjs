#!/usr/bin/env node
/** LMS incident: strictly read-only production diagnostic. No PII, JWT or response bodies logged. */
import { performance } from 'node:perf_hooks';
import { assertAllowedProductionBaseUrl, decodeJwtPayload, extractAccessToken, login, selectEmpresa } from '../smoke-auth-common.mjs';

const BASE = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const expected = String(process.env.EXPECTED_PRODUCTION_SHA || '').toLowerCase();
if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error('PINNED_SHA_INVALID');
const record = {};
const request = async (label, path, token, timeoutMs=28000) => {
  if (!/^\/api\/(?:lms\/(?:cursos\/stats|matriculas\/minhas(?:-ead)?(?:\?.*)?)|admin\/usuarios|funcionarios(?:\?.*)?|empresas\/usuarios\/\d+\/acessos|admin\/usuarios\/\d+\/permissoes|version)$/.test(path)) throw new Error('UNALLOWLISTED_READ');
  const start = performance.now();
  try {
    const r = await fetch(BASE+path, {method:'GET',headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},signal:AbortSignal.timeout(timeoutMs)});
    const body = await r.json().catch(() => null);
    const data = body?.data;
    record[label] = {http:r.status,ms:Math.round(performance.now()-start),success:body?.success === true,rows:Array.isArray(data)?data.length:null, total:Number.isFinite(Number(body?.pagination?.total))?Number(body.pagination.total):null};
    return {status:r.status, data,body};
  } catch(e) {
    record[label]={http:null,ms:Math.round(performance.now()-start),error:e?.name==='TimeoutError'||e?.name==='AbortError'?'TIMEOUT':'TRANSPORT_FAILURE'};
    return null;
  }
};
const version=await request('version','/api/version');
if(version?.status!==200||version.body?.data?.sourceSha!==expected) throw new Error('PRODUCTION_SHA_DRIFT');
const email=process.env.PROD_SMOKE_EMAIL, password=process.env.PROD_SMOKE_PASSWORD;
if(!email||!password)throw new Error('ADMIN_QA_CREDENTIALS_MISSING');
let token=extractAccessToken(await login(BASE,email,password));let claims=decodeJwtPayload(token);
if(Number(claims?.empresa_id)!==6){const s=await selectEmpresa(BASE,token,6);if(s.status!==200||s.json?.success!==true)throw new Error('TENANT_SELECTION_FAILED');token=extractAccessToken(s.json);claims=decodeJwtPayload(token)}
if(Number(claims?.empresa_id)!==6||!['ADMIN','ADMINISTRADOR'].includes(String(claims?.role).toUpperCase()))throw new Error('QA_ADMIN_TENANT6_REQUIRED');
record.admin_role='ADMIN';
await request('admin_stats','/api/lms/cursos/stats',token);
await request('admin_own_ead','/api/lms/matriculas/minhas-ead',token);
const users=await request('admin_user_roster','/api/admin/usuarios',token);
if(users?.status===200&&Array.isArray(users.data)){
 const normalize=n=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const hits=users.data.filter(u=>Number(u.empresa_id)===6&&normalize(u.nome).includes('WILSON')&&normalize(u.nome).includes('NERY'));
 record.wilson_matches=hits.length;
 if(hits.length===1){
  const u=hits[0]; record.wilson_active=Number(u.active)===1; record.wilson_has_employee_link=Number(u.funcionario_id)>0; record.wilson_declared_role=normalize(u.perfil||u.role).slice(0,24)||'UNSPECIFIED';
  if(Number.isSafeInteger(Number(u.id))&&Number(u.id)>0){
   const role=await request('wilson_tenant_access',`/api/empresas/usuarios/${u.id}/acessos`,token);
   const access=role?.data?.acessos?.filter(a=>Number(a.empresa_id)===6)||[];
   record.wilson_tenant_access_count=access.length;
   record.wilson_tenant_roles=access.map(a=>String(a.role||'').toUpperCase().slice(0,24));
   const p=await request('wilson_permission_overrides',`/api/admin/usuarios/${u.id}/permissoes`,token);
   if(Array.isArray(p?.data))record.wilson_lms_overrides=p.data.filter(x=>String(x.permissao).startsWith('lms.')).map(x=>String(x.permissao).slice(0,35)+':'+String(x.tipo).slice(0,6));
  }
 }
 const active=users.data.filter(u=>Number(u.empresa_id)===6&&Number(u.active)===1);
 record.tenant6_active_users=active.length;
 record.tenant6_users_without_employee_link=active.filter(u=>!(Number(u.funcionario_id)>0)).length;
}
if(process.env.QA_LEARNER_PASSWORD){
 try {
  let learner=extractAccessToken(await login(BASE,'qa.lms.202611@airtrust.online',process.env.QA_LEARNER_PASSWORD));
  let lc=decodeJwtPayload(learner);
  if(Number(lc?.empresa_id)!==6){const s=await selectEmpresa(BASE,learner,6);if(s.status!==200||s.json?.success!==true)throw Error('QA_TENANT_FAILED');learner=extractAccessToken(s.json);lc=decodeJwtPayload(learner)}
  if(Number(lc?.empresa_id)!==6)throw Error('QA_TENANT_FAILED');
  record.learner_role=String(lc.role||'').toUpperCase().slice(0,25);
  await request('learner_own_ead','/api/lms/matriculas/minhas-ead',learner);
  await request('learner_own_basic','/api/lms/matriculas/minhas?strict_link=1&page=1&limit=200',learner);
  await request('learner_stats_expected_denial','/api/lms/cursos/stats',learner);
 } catch(e){record.learner_diagnostic_error=/TENANT/.test(String(e?.message))?'TENANT_MISMATCH':'LOGIN_OR_SETUP_FAILED'}
}else record.learner_diagnostic_error='QA_LEARNER_SECRET_MISSING';
console.log('LMS_ACCESS_READONLY='+JSON.stringify({deployed_sha:expected,mode:'read-only',tenant:6,pii_emitted:false,...record}));
if(record.admin_stats?.http!==200 || (record.learner_own_ead?.http!==200 && record.learner_own_basic?.http!==200)) process.exitCode=2;
