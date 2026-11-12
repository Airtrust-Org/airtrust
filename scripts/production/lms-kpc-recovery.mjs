#!/usr/bin/env node
// Three-case, tenant-pinned administrative SCORM recovery through CANONICAL API.
// No direct D1 writes, no status/score/qualification spoofing and no PII output.
import assert from 'node:assert/strict';
import {
  assertAllowedProductionBaseUrl, decodeJwtPayload, extractAccessToken,
  fetchJson, login, selectEmpresa,
} from '../smoke-auth-common.mjs';

export const CASES = Object.freeze([
  { id:2058, employee:37, course:68, progress:100, recover:'scorm-missing-interactions-recover', expectedPosition:8 },
  { id:1223, employee:22, course:8, progress:100, recover:'scorm-missing-interactions-recover', expectedPosition:15 },
  { id:681, employee:67, course:39, progress:51, recover:'scorm-edition-handoff', expectedPosition:26 },
]);
export function parsePinnedCaseSelection(raw) {
  const ids = String(raw || '').split(',').map(x => x.trim());
  assert(ids.length > 0 && ids.length <= CASES.length, 'KPC_CASE_SELECTION_INVALID');
  assert(ids.every(x => /^(2058|1223|681)$/.test(x)), 'KPC_CASE_NOT_AUTHORIZED');
  assert(new Set(ids).size === ids.length, 'KPC_DUPLICATE_CASE');
  return ids.map(id => CASES.find(entry => entry.id === Number(id)));
}
const TENANT=6;
const mode=process.env.LMS_KPC_MODE || 'inspect';
const sha=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');

export function validateCaseState(row, entry) {
  assert(row && Number(row.id) === entry.id && Number(row.empresa_id) === TENANT &&
    Number(row.curso_id) === entry.course && Number(row.funcionario_id) === entry.employee,
    `KPC_IDENTITY_MISMATCH_${entry.id}`);
  assert(String(row.status).toUpperCase() === 'EM_ANDAMENTO' &&
    Number(row.progresso_pct) === entry.progress && row.qualificacao_historico_id == null,
    `KPC_STATE_MISMATCH_${entry.id}`);
  if (entry.recover === 'scorm-edition-handoff') {
    assert(row.edition_mismatch?.required === true &&
      Number(row.active_resume_proposal?.targetPosition) === entry.expectedPosition &&
      Number(row.active_resume_proposal?.activeTotal) === 49,
      'KPC_S76_EDITION_PROPOSAL_MISMATCH');
  } else {
    assert(row.closure_readiness?.code === 'PROGRESS_EVIDENCE_MISSING',
      `KPC_MANIFEST_NOT_MISSING_${entry.id}`);
  }
}
async function request(path, token, opts = {}) {
  const result=await fetchJson(`${API}${path}`, {
    method:opts.method || 'GET', timeoutMs:30_000,
    headers:{Authorization:`Bearer ${token}`,...(opts.body?{'Content-Type':'application/json'}:{})},
    body:opts.body ? JSON.stringify(opts.body):undefined,
  });
  return result;
}
async function adminToken() {
  const email=String(process.env.PROD_SMOKE_EMAIL||'').trim();
  const password=String(process.env.PROD_SMOKE_PASSWORD||'');
  assert(email && password,'KPC_ADMIN_CREDENTIALS_MISSING');
  let token=extractAccessToken(await login(API,email,password));
  const memberships=await request('/api/auth/empresas',token);
  assert(memberships.status===200 &&
    memberships.json?.data?.empresas?.some(x=>Number(x.id)===TENANT),
    'KPC_TENANT_ACCESS_MISSING');
  if(Number(memberships.json?.data?.empresaAtualId)!==TENANT) {
    const selected=await selectEmpresa(API,token,TENANT);
    assert(selected.status===200 && selected.json?.success===true,'KPC_TENANT_SELECT_FAILED');
    token=extractAccessToken(selected.json);
  }
  const claims=decodeJwtPayload(token);
  assert(Number(claims?.empresa_id)===TENANT &&
    ['ADMIN','ADMINISTRADOR'].includes(String(claims?.role||'').toUpperCase()),
    'KPC_TENANT_ADMIN_REQUIRED');
  return token;
}
export async function executeRecovery() {
  assert(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REF==='refs/heads/main',
    'KPC_GITHUB_MAIN_REQUIRED');
  assert(/^[0-9a-f]{40}$/.test(sha) && sha===process.env.RELEASE_SHA,
    'KPC_RELEASE_PIN_INVALID');
  assert(['inspect','apply'].includes(mode),'KPC_MODE_INVALID');
  assert(process.env.LMS_KPC_CONFIRMATION ===
    (mode==='apply' ? 'AIRTRUST_LMS_KPC_APPLY' : 'AIRTRUST_LMS_KPC_INSPECT'),
    'KPC_CONFIRMATION_INVALID');
  const version=await fetchJson(`${API}/api/version`);
  assert(version.status===200 &&
    String(version.json?.data?.sourceSha||'').toLowerCase()===sha,
    'KPC_PRODUCTION_SHA_MISMATCH');

  const selected = parsePinnedCaseSelection(process.env.LMS_KPC_CASE_IDS || '2058,1223,681');
  const token=await adminToken();
  const preflight=[];
  for(const entry of selected) {
    const response=await request(`/api/lms/matriculas/${entry.id}`,token);
    assert(response.status===200, `KPC_DETAIL_HTTP_${entry.id}_${response.status}`);
    validateCaseState(response.json?.data,entry);
    preflight.push({id:entry.id,course:entry.course,action:entry.recover,preflight:'PASS'});
  }
  if(mode==='inspect') return {version:1,mode,sha,tenant:TENANT,preflight,writes:0};

  const applied=[];
  for(const entry of selected) {
    const response=await request(
      `/api/lms/matriculas/${entry.id}/${entry.recover}`,token,
      {method:'POST',body:{}},
    );
    assert(response.status===200 && response.json?.success===true,
      `KPC_RECOVERY_FAILED_${entry.id}_HTTP_${response.status}`);
    const after=await request(`/api/lms/matriculas/${entry.id}`,token);
    assert(after.status===200 &&
      Number(after.json?.data?.id)===entry.id &&
      Number(after.json?.data?.curso_id)===entry.course &&
      Number(after.json?.data?.funcionario_id)===entry.employee &&
      after.json?.data?.status==='EM_ANDAMENTO' &&
      after.json?.data?.qualificacao_historico_id==null,
      `KPC_READBACK_MISMATCH_${entry.id}`);
    applied.push({id:entry.id,course:entry.course,post:'PASS',
      status:'EM_ANDAMENTO',qualification_granted:false,
      resumePosition:entry.expectedPosition});
  }
  return {version:1,mode,sha,tenant:TENANT,preflight,applied,writes:applied.length,
    credit_or_certificate_fabricated:false};
}
if(import.meta.url===`file://${process.argv[1]}`) {
  executeRecovery().then(data=>console.log('KPC_RECOVERY_REPORT',JSON.stringify(data)))
    .catch(e=>{console.error('KPC_RECOVERY_ERROR',String(e.message||e).replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]'));process.exitCode=1;});
}
