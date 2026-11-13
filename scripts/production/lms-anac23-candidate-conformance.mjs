import fs from 'node:fs';
import path from 'node:path';
import {
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

/** Immutable, tenant-scoped candidate IDs from production D1 readback. */
export const ANAC23_CANDIDATES = Object.freeze([
  { id: '863d66ce-d06a-411e-bca9-a6be5b98a08c', shaPrefix:'57171676a06882d2' },
  { id: '2a494f17-e787-4243-95de-db420bcfd6ee', shaPrefix:'ce76ee1a85353d27' },
  { id: '5afeba00-3408-499a-acf6-7e0f7f89e6b5', shaPrefix:'a7e36d7a586c6d55' },
]);
export const ANAC23_TENANT = 6;
export const ANAC23_COURSE = 23;

function assert(condition, code) { if (!condition) throw new Error(code); }
function isSha(v) { return /^[a-f0-9]{64}$/.test(String(v ?? '')); }

export function validatePinnedCandidateList(rows) {
  assert(Array.isArray(rows), 'CANDIDATE_LIST_INVALID');
  const selected = ANAC23_CANDIDATES.map(({ id, shaPrefix }) => {
    const same = rows.filter(row => row?.packageId === id);
    assert(same.length === 1, 'CANDIDATE_ID_MISMATCH');
    const row = same[0];
    assert(isSha(row.packageSha256) && row.packageSha256.startsWith(shaPrefix),
      'CANDIDATE_SHA_MISMATCH');
    assert(row.status === 'VALIDATED', 'CANDIDATE_STATUS_CHANGED');
    assert(row.r2Prefix === `lms/scorm/6/23/_candidates/${id}/`,
      'CANDIDATE_R2_SCOPE_MISMATCH');
    assert(typeof row.launchFile === 'string' &&
      /^[\w./-]+\.html?$/i.test(row.launchFile) && !row.launchFile.includes('..'),
      'CANDIDATE_LAUNCH_INVALID');
    assert(row.empresaId === 6 && row.cursoId === 23, 'CANDIDATE_TENANT_MISMATCH');
    return { id, shaPrefix, sha:row.packageSha256 };
  });
  return selected;
}

export function summarizeConformance(data, selected) {
  assert(data && typeof data === 'object', 'CONFORMANCE_RESPONSE_MISSING');
  const runtime = data.runtime;
  assert(runtime?.candidateSha256 === selected.sha, 'CONFORMANCE_SHA_MISMATCH');
  const status = String(runtime.status ?? '');
  assert(['PASS','FAIL','ERROR'].includes(status), 'CONFORMANCE_STATUS_INVALID');
  const reasons = Array.isArray(runtime.errors)
    ? runtime.errors.filter(v => typeof v === 'string').map(v => v.slice(0,120)).slice(0,5)
    : [];
  return {
    id:selected.id, shaPrefix:selected.shaPrefix, status,
    initialized:runtime.initializeObserved === true,
    committed:runtime.commitObserved === true,
    finished:runtime.finishObserved === true,
    // Browser protocol conformance does not certify assessment/mastery or
    // authorize activation; independent functional attestation is required.
    publishable:data.publishable === true,
    reasons,
  };
}

async function authJson(base,token,route,method='GET',body) {
  return fetchJson(`${base}${route}`, {
    method, headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function main(env=process.env) {
  const mode=String(env.ANAC23_MODE||'').trim();
  assert(mode==='inspect'||mode==='apply','INVALID_MODE');
  assert(env.ANAC23_CONFIRMATION === (mode==='inspect'
    ? 'AIRTRUST_ANAC23_CONFORMANCE_INSPECT'
    : 'AIRTRUST_ANAC23_CONFORMANCE_APPLY'), 'CONFIRMATION_INVALID');
  const api=assertAllowedProductionBaseUrl(
    String(env.PROD_API_BASE_URL||'https://api.airtrust.online'));
  const email=String(env.PROD_EMAIL||''),password=String(env.PROD_PASSWORD||'');
  assert(email&&password,'PROD_QA_CREDENTIALS_MISSING');
  const logged=await login(api,email,password);
  let token=extractAccessToken(logged);
  assert(token,'PROD_TOKEN_MISSING');
  const companies=await authJson(api,token,'/api/auth/empresas');
  assert(companies.status===200,'TENANT_LIST_FAILED');
  const entries=companies.json?.data?.empresas;
  assert(Array.isArray(entries)&&entries.some(c=>Number(c.id)===ANAC23_TENANT),
    'TENANT_NOT_AUTHORIZED');
  if(Number(companies.json?.data?.empresaAtualId||0)!==ANAC23_TENANT) {
    const selection=await authJson(api,token,'/api/auth/select-empresa',
      'POST',{empresaId:ANAC23_TENANT});
    assert(selection.status===200,'TENANT_SELECT_FAILED');
    token=String(selection.json?.data?.accessToken||'');
    assert(token,'TENANT_SELECT_TOKEN_MISSING');
  }
  const current=await authJson(api,token,'/api/empresas/minha');
  assert(current.status===200&&Number(current.json?.data?.id)===ANAC23_TENANT,
    'TENANT_CONTEXT_MISMATCH');
  const listing=await authJson(api,token,
    '/api/lms/cursos/23/scorm-package-versions');
  assert(listing.status===200&&listing.json?.success===true,'PACKAGE_LIST_FAILED');
  const selected=validatePinnedCandidateList(listing.json.data);
  const report={schemaVersion:1,mode,tenant:6,course:23,
    candidates:[],writes:0,activationPerformed:false};
  for(const item of selected) {
    if(mode==='inspect') {
      report.candidates.push({id:item.id,shaPrefix:item.shaPrefix,status:'VALIDATED'});
      continue;
    }
    const outcome=await authJson(api,token,
      `/api/lms/cursos/23/scorm-package-versions/${item.id}/conformance`,'POST');
    assert(outcome.status===200&&outcome.json?.success===true,
      'CANDIDATE_CONFORMANCE_HTTP_FAILURE');
    report.candidates.push(summarizeConformance(outcome.json.data,item));
    report.writes++;
  }
  const output=String(env.ANAC23_REPORT_PATH||'qa-state/anac23-conformance.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
  assert(mode==='inspect'||report.candidates.every(c=>c.status==='PASS'),
    'CANDIDATE_CONFORMANCE_NOT_ALL_PASS');
  return report;
}
if(process.argv[1]?.endsWith('lms-anac23-candidate-conformance.mjs')) {
  main().catch(e=>{
    console.error('ANAC23_QA_FAILURE:',
      /^[A-Z][A-Z0-9_]+$/.test(String(e.message||''))?e.message:'SCOPED_QA_FAILURE');
    process.exitCode=1;
  });
}
