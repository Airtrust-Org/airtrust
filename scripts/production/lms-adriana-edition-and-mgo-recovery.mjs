#!/usr/bin/env node
/** Governed tenant-6 canonical API recovery. No direct D1 writes or fabricated completion. */
import assert from 'node:assert/strict';
import { assertAllowedProductionBaseUrl, decodeJwtPayload, extractAccessToken, fetchJson, login, selectEmpresa } from '../smoke-auth-common.mjs';

const TENANT = 6;
export const CASES = Object.freeze([
  { id:1022, employee:1, course:21, progress:100, action:'scorm-missing-interactions-recover', kind:'missing_decisions' },
  { id:2044, employee:1, course:68, progress:3, action:'scorm-edition-handoff', kind:'edition' },
  { id:2057, employee:35, course:68, progress:5, action:'scorm-edition-handoff', kind:'edition' },
  { id:2092, employee:98, course:68, progress:5, action:'scorm-edition-handoff', kind:'edition' },
  { id:2114, employee:145, course:68, progress:7, action:'scorm-edition-handoff', kind:'edition' },
  { id:2123, employee:154, course:68, progress:5, action:'scorm-edition-handoff', kind:'edition' },
  { id:2141, employee:172, course:68, progress:5, action:'scorm-edition-handoff', kind:'edition' },
]);
const ALLOWED_IDS = new Set(CASES.map(c=>String(c.id)));
export function selectCases(raw) {
  const ids=String(raw||'').split(',').map(s=>s.trim());
  assert(ids.length && ids.length<=CASES.length && ids.every(s=>ALLOWED_IDS.has(s)) &&
    new Set(ids).size===ids.length,'ADRIANA_COHORT_SELECTION_INVALID');
  return ids.map(id=>CASES.find(c=>c.id===Number(id)));
}
export function checkPreflight(row,entry) {
  assert(row && Number(row.id)===entry.id && Number(row.empresa_id)===TENANT &&
    Number(row.funcionario_id)===entry.employee && Number(row.curso_id)===entry.course,
    `ADRIANA_COHORT_IDENTITY_MISMATCH_${entry.id}`);
  assert(row.status==='EM_ANDAMENTO' && Number(row.progresso_pct)===entry.progress &&
    row.qualificacao_historico_id==null,
    `ADRIANA_COHORT_LIVE_STATE_MISMATCH_${entry.id}`);
  if(entry.kind==='edition') {
    assert(row.edition_mismatch?.required===true &&
      Number(row.edition_mismatch?.previous_total)===61 &&
      Number(row.edition_mismatch?.active_total)===59 &&
      row.scorm_handoff_available===true &&
      row.active_resume_proposal?.reviewRequired===true &&
      Number(row.active_resume_proposal?.activeTotal)===59 &&
      Number.isSafeInteger(row.active_resume_proposal?.targetPosition) &&
      row.active_resume_proposal.targetPosition>=1 &&
      row.active_resume_proposal.targetPosition<=59 &&
      row.active_resume_proposal.canMarkComplete===false,
      `ADRIANA_COHORT_EDITION_NOT_SAFE_${entry.id}`);
  } else {
    assert(row.closure_readiness?.code==='PROGRESS_EVIDENCE_MISSING' &&
      row.closure_readiness.missing?.includes('manifest_required_units') &&
      row.closure_readiness.last_step_reached===true &&
      row.completion_diagnostic?.can_finalize!==true,
      `ADRIANA_MGO_MISSING_INTERACTION_PROOF_${entry.id}`);
  }
}
const sha=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
const mode=String(process.env.ADRIANA_RECOVERY_MODE||'inspect');
const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL||'https://api.airtrust.online');
async function req(path, token,method='GET') {
  return fetchJson(API+path,{method,timeoutMs:30_000,
    headers:{Authorization:`Bearer ${token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},
    body:method==='POST'?'{}':undefined});
}
async function adminToken(){
  assert(process.env.PROD_SMOKE_EMAIL && process.env.PROD_SMOKE_PASSWORD,
    'ADRIANA_ADMIN_QA_CREDENTIALS_UNAVAILABLE');
  let token=extractAccessToken(await login(API,process.env.PROD_SMOKE_EMAIL,process.env.PROD_SMOKE_PASSWORD));
  const memberships=await req('/api/auth/empresas',token);
  assert(memberships.status===200 && memberships.json?.data?.empresas?.some(e=>Number(e.id)===TENANT),
    'ADRIANA_TENANT_MEMBERSHIP_MISSING');
  if(Number(memberships.json?.data?.empresaAtualId)!==TENANT) {
    const selection=await selectEmpresa(API,token,TENANT);
    assert(selection.status===200 && selection.json?.success===true,'ADRIANA_TENANT_SELECTION_FAILED');
    token=extractAccessToken(selection.json);
  }
  const claims=decodeJwtPayload(token);
  assert(Number(claims?.empresa_id)===TENANT &&
    ['ADMIN','ADMINISTRADOR'].includes(String(claims?.role||'').toUpperCase()),
    'ADRIANA_TENANT_ADMIN_REQUIRED');
  return token;
}
export async function execute(){
  assert(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REF==='refs/heads/main',
    'ADRIANA_TRUSTED_MAIN_REQUIRED');
  assert(/^[a-f0-9]{40}$/.test(sha) && sha===process.env.RELEASE_SHA,
    'ADRIANA_RELEASE_SHA_INVALID');
  assert(['inspect','apply'].includes(mode) && process.env.ADRIANA_RECOVERY_CONFIRMATION===
    (mode==='apply'?'AIRTRUST_ADRIANA_COHORT_APPLY':'AIRTRUST_ADRIANA_COHORT_INSPECT'),
    'ADRIANA_CONFIRMATION_INVALID');
  const version=await fetchJson(`${API}/api/version`);
  assert(version.status===200 && version.json?.data?.sourceSha===sha,
    'ADRIANA_PRODUCTION_VERSION_DRIFT');
  const selected=selectCases(process.env.ADRIANA_RECOVERY_IDS||CASES.map(c=>c.id).join(','));
  const token=await adminToken();
  const ready=[];
  for (const entry of selected){
    const r=await req(`/api/lms/matriculas/${entry.id}`,token);
    assert(r.status===200,`ADRIANA_PREFLIGHT_HTTP_${entry.id}_${r.status}`);
    checkPreflight(r.json?.data,entry);
    ready.push({id:entry.id,course:entry.course,action:entry.action,
      suggested_position:entry.kind==='edition'?r.json.data.active_resume_proposal.targetPosition:null,
      preflight:'PASS'});
  }
  if(mode==='inspect')return {mode,sha,tenant:TENANT,preflight:ready,writes:0};
  const applied=[];
  for(const entry of selected){
    const r=await req(`/api/lms/matriculas/${entry.id}/${entry.action}`,token,'POST');
    assert(r.status===200 && r.json?.success===true,
      `ADRIANA_CANONICAL_RECOVERY_FAILED_${entry.id}_HTTP_${r.status}`);
    const after=await req(`/api/lms/matriculas/${entry.id}`,token);
    assert(after.status===200 && Number(after.json?.data?.id)===entry.id &&
      Number(after.json?.data?.funcionario_id)===entry.employee &&
      Number(after.json?.data?.curso_id)===entry.course &&
      after.json?.data?.status==='EM_ANDAMENTO' &&
      after.json?.data?.qualificacao_historico_id==null,
      `ADRIANA_READBACK_SCOPE_FAILED_${entry.id}`);
    if(entry.kind==='edition')assert(after.json.data.edition_mismatch?.required!==true &&
      Number(after.json.data.active_scorm_handoff_id)>0,
      `ADRIANA_HANDOFF_READBACK_MISSING_${entry.id}`);
    else assert(Number(after.json.data.ultimo_slide)<42 &&
      Number(r.json?.data?.missing_scenarios)>0,
      'ADRIANA_MGO_RECOVERY_READBACK_INVALID');
    applied.push({id:entry.id,action:entry.action,status:'EM_ANDAMENTO',
      no_automatic_approval:true,post:'PASS'});
  }
  return {mode,sha,tenant:TENANT,preflight:ready,applied,writes:applied.length,
    fabricated_grade_or_completion_or_certificate:false};
}
if(import.meta.url===`file://${process.argv[1]}`){
  execute().then(r=>console.log('ADRIANA_COHORT_RECOVERY_REPORT',JSON.stringify(r)))
    .catch(e=>{console.error('ADRIANA_COHORT_RECOVERY_ERROR',String(e?.message||e).replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]'));process.exitCode=1;});
}
