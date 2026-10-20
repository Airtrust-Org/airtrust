#!/usr/bin/env node
/**
 * Trusted-main Player3 synthetic staging grant gate.
 * Checks a current same-repo F4 PR HEAD, 8 official gates + PR Check,
 * and a recent, unedited, admin-authored exact phase grant on issue #776.
 * No staging credential or remote write is used here.
 */
import { pathToFileURL } from 'node:url';

export const REPO = 'Airtrust-Org/airtrust';
export const BRANCH = 'feat/lms-native-course-contract-v1-20261010';
export const DB_UUID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const LOCK = 'airtrust-staging-mutations-and-scorm-qa';
export const ARTIFACT_SHA = '0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f';
export const REQUIRED = Object.freeze([
  'lint','build-content-gates','worker-typecheck','frontend-coverage',
  'worker-tests-1','worker-tests-2','lms-smoke','public-e2e','🧪 Check PR'
]);
const hex40 = /^[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;
const positive = /^[1-9][0-9]{0,15}$/;

export function assertConfig(v) {
  if (v.repo !== REPO || v.ref !== 'refs/heads/main' ||
      v.event !== 'workflow_dispatch' ||
      v.confirmation !== 'AIRTRUST_PLAYER3_SYNTHETIC_STAGING' ||
      !hex40.test(v.sha ?? '') || !positive.test(v.grantId ?? '') ||
      !['bootstrap','publish','edition'].includes(v.phase)) {
    throw Error('PLAYER3_MAIN_CONFIRMED_EXACT_SHA_REQUIRED');
  }
  if ((v.phase === 'bootstrap' && (v.courseId !== '0' ||
       v.approverId !== '0' || v.planSha !== 'none' || !hex64.test(v.sqlSha ?? ''))) ||
      (v.phase === 'publish' && (!positive.test(v.courseId ?? '') ||
       v.approverId !== '0' || v.sqlSha !== 'none' || !hex64.test(v.planSha ?? ''))) ||
      (v.phase === 'edition' && (!positive.test(v.courseId ?? '') ||
       !positive.test(v.approverId ?? '') || !hex64.test(v.sqlSha ?? '') ||
       !hex64.test(v.planSha ?? '')))) {
    throw Error('PLAYER3_PHASE_IDENTITIES_AND_APPROVED_HASHES_REQUIRED');
  }
}

export function expectedGrant(v) {
  return {
    schema:'AIRTRUST_PLAYER3_QA_GRANT_V1',
    repository:REPO,
    pr:1389,
    release_sha:v.sha,
    phase:v.phase,
    tenant_id:999006,
    db_uuid:DB_UUID,
    r2_bucket:'airtrust-storage-staging',
    pages_project:'qa-player3-staging',
    artifact_sha256:ARTIFACT_SHA,
    sql_sha256:v.sqlSha,
    publication_plan_sha256:v.planSha,
    course_id:Number(v.courseId),
    approver_user_id:Number(v.approverId),
    environment:'staging',
    lock:LOCK,
    recovery:'D1_TIME_TRAVEL_REQUIRED',
    cleanup:'IMMUTABLE_QA_RETENTION_REVIEW'
  };
}

export function checkGrantBody(body,v) {
  if (typeof body !== 'string' ||
      !body.startsWith('AIRTRUST_PLAYER3_QA_GRANT_V1\n')) {
    throw Error('PLAYER3_EXACT_F0_GRANT_MARKER_REQUIRED');
  }
  let parsed;
  try { parsed=JSON.parse(body.slice('AIRTRUST_PLAYER3_QA_GRANT_V1\n'.length)); }
  catch { throw Error('PLAYER3_F0_GRANT_JSON_INVALID'); }
  const expected=expectedGrant(v);
  if (!parsed || typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join('|') !== Object.keys(expected).sort().join('|') ||
      Object.entries(expected).some(([key,value])=>parsed[key]!==value)) {
    throw Error('PLAYER3_F0_GRANT_SCOPE_OR_SHA_MISMATCH');
  }
}

export function checkChecks(runs,sha) {
  if (!Array.isArray(runs)) throw Error('PLAYER3_EIGHT_GATES_UNAVAILABLE');
  const verified=new Set(runs.filter(x=>x.status==='completed' &&
    x.conclusion==='success' && x.head_sha===sha).map(x=>x.name));
  if (!REQUIRED.every(x=>verified.has(x))) throw Error('PLAYER3_EIGHT_GATES_AND_PR_CHECK_NOT_GREEN');
}

export async function verify(v, token, get, now=Date.now()) {
  assertConfig(v);
  if (!token) throw Error('PLAYER3_GITHUB_READ_TOKEN_REQUIRED');
  const pr=await get('pulls/1389');
  if (pr.state!=='open' || pr.base?.ref!=='main' ||
      pr.head?.ref!==BRANCH || pr.head?.sha!==v.sha ||
      pr.head?.repo?.full_name!==REPO || pr.head?.repo?.fork===true) {
    throw Error('PLAYER3_F4_PR_HEAD_CHANGED_OR_FORKED');
  }
  const checkResponse=await get('commits/'+v.sha+'/check-runs?per_page=100');
  checkChecks(checkResponse.check_runs,v.sha);
  const grant=await get('issues/comments/'+v.grantId);
  if (grant.issue_url!=='https://api.github.com/repos/'+REPO+'/issues/776' ||
      grant.created_at!==grant.updated_at) {
    throw Error('PLAYER3_F0_GRANT_EDITED_OR_WRONG_ISSUE');
  }
  const age=now-Date.parse(grant.created_at);
  if (!Number.isFinite(age) || age<0 || age>12*3600000) {
    throw Error('PLAYER3_F0_GRANT_EXPIRED');
  }
  checkGrantBody(grant.body,v);
  const author=grant.user?.login;
  if (!author || !v.actor) throw Error('PLAYER3_F0_GRANT_ADMIN_NOT_IDENTIFIED');
  for (const login of new Set([author,v.actor])) {
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(login)) throw Error('PLAYER3_ADMIN_LOGIN_INVALID');
    const p=await get('collaborators/'+login+'/permission');
    if (p.permission!=='admin') throw Error('PLAYER3_ADMIN_PERMISSION_REQUIRED');
  }
  return true;
}

async function main() {
  const e=process.env;
  const v={
    repo:e.GITHUB_REPOSITORY,ref:e.GITHUB_REF,event:e.GITHUB_EVENT_NAME,
    actor:e.GITHUB_ACTOR,confirmation:e.QA_CONFIRMATION,sha:e.QA_RELEASE_SHA,
    phase:e.QA_PHASE,grantId:e.QA_GRANT_ID,courseId:e.QA_COURSE_ID,
    approverId:e.QA_APPROVER_ID,sqlSha:e.QA_SQL_SHA,
    planSha:e.QA_PLAN_SHA
  };
  const token=e.GITHUB_TOKEN;
  const get=async path=>{
    const response=await fetch('https://api.github.com/repos/'+REPO+'/'+path,{
      headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json',
               'x-github-api-version':'2022-11-28'},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw Error('PLAYER3_GITHUB_API_ACCESS_DENIED');
    return response.json();
  };
  await verify(v,token,get);
  console.log('PLAYER3_F4_SHA_GATES_ADMIN_F0_GRANT_VERIFIED');
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(err=>{console.error(err?.message?.startsWith('PLAYER3_')?
    err.message:'PLAYER3_GUARD_FAILED_CLOSED');process.exitCode=1;});
}
