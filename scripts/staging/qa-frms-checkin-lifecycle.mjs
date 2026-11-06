#!/usr/bin/env node
// Staging-only synthetic tenant/crew lifecycle. Mutates only its own check-in
// through the normal authenticated FRMS API (never raw remote D1 SQL).
// A post-commit error is never retried; operator review is required.
import { pathToFileURL } from 'node:url';
import {
  login, extractAccessToken, fetchJson,
} from '../smoke-auth-common.mjs';
import { QA_EMAIL, TENANT_ID } from './provision-frms-ux-identity.mjs';

const API='https://airtrust-api-staging.airtrust.workers.dev';
export const CONFIRM='AIRTRUST_STAGING_FRMS_CHECKIN_QA';
// The active 60-second screen is NOT a validated 3-minute PVT-B.
export const ACTIVE_BRIEF_PROTOCOL='airtrust-brief-v1';

export function localReferenceDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function sampleTrials() {
  return Array.from({length:10},(_,i)=>{
    const t=(i+1)*5000;
    return {sequence:i+1, scheduledAtMs:t,stimulusAtMs:t+100,
      responseAtMs:t+380,reactionTimeMs:280,outcome:'response'};
  });
}

// Pre-presentation evidence requires a future local presentation time.
// Never backdate the submission clock or fabricate an earlier assessment.
export function syntheticPreflightSchedule(now=new Date()) {
  if(!Number.isFinite(now.getTime())) throw new Error('FRMS_QA_INVALID_SERVER_CLOCK');
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(now);
  const part=type=>Number(parts.find(p=>p.type===type)?.value);
  const hour=part('hour'),minute=part('minute');
  if(!Number.isInteger(hour)||!Number.isInteger(minute)||hour<0||hour>23||minute<0||minute>59)
    throw new Error('FRMS_QA_INVALID_LOCAL_CLOCK');
  const current=hour*60+minute;
  const presentation=current+25; // Keep headroom for PVT-B + network latency.
  if(presentation>1439)throw new Error('FRMS_QA_NO_SAME_DAY_PREFLIGHT_WINDOW');
  const asTime=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
  return {date:localReferenceDate(now),presentationTime:asTime(presentation),
    wakeTime:asTime(Math.max(0,current-90))};
}

export function checkinPayload(date, kssScore, readiness=false, schedule) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![3,4].includes(kssScore) ||
     schedule?.date!==date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule?.presentationTime||'') ||
     !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule?.wakeTime||''))
    throw new Error('QA_CHECKIN_PAYLOAD_INVALID');
  return {reference_date:date,wake_time:schedule.wakeTime,
    hora_apresentacao:schedule.presentationTime,
    horas_sono_24h:7,fit_for_duty:true,kss_score:kssScore,
    ...(readiness?{readiness:{duration_ms:60000,
      protocol_version:ACTIVE_BRIEF_PROTOCOL,trials:sampleTrials()}}:{})};
}

function assertScopedAuth(payload) {
  if(payload?.success!==true || Number(payload?.data?.empresaAtualId)!==TENANT_ID ||
      !Array.isArray(payload.data.empresas) || payload.data.empresas.length!==1 ||
      Number(payload.data.empresas[0]?.id)!==TENANT_ID ||
      !['admin','manager'].includes(String(payload.data.empresas[0]?.role||'').toLowerCase())) {
    throw new Error('FRMS_QA_LOGIN_TENANT_SCOPE_REJECTED');
  }
}

async function authGet(token,path) {
  return fetchJson(API+path,{headers:{Authorization:'Bearer '+token}});
}

async function authPost(token,path,body) {
  return fetchJson(API+path,{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body)});
}

async function main() {
  if(process.env.GITHUB_ACTIONS!=='true' ||
     process.env.CONFIRM_STAGING_FRMS_CHECKIN_QA!==CONFIRM ||
     process.env.EXPECTED_STAGING_SHA?.length!==40 ||
     process.env.STAGING_QA_RECOVERY_VERIFIED!=='true') throw new Error('FRMS_QA_GOVERNANCE_GUARD_MISSING');

  const password=String(process.env.STAGING_SMOKE_PASSWORD||'');
  if(!password)throw new Error('CENTRAL_STAGING_QA_PASSWORD_MISSING');
  const auth=await login(API,QA_EMAIL,password);
  const token=extractAccessToken(auth);
  const companies=await authGet(token,'/api/auth/empresas');
  if(companies.status!==200)throw new Error('FRMS_QA_COMPANIES_READ_FAILED');
  assertScopedAuth(companies.json);

  const schedule=syntheticPreflightSchedule();
  const date=schedule.date;
  const firstBefore=await authGet(token,'/api/frms/fadiga-checkin/me?date='+date);
  if(firstBefore.status!==200||firstBefore.json?.success!==true)
    throw new Error('FRMS_QA_CHECKIN_PRESTATE_UNAVAILABLE');

  const initial=await authPost(token,'/api/frms/fadiga-checkin',
    checkinPayload(date,3,true,schedule));
  if(initial.status!==200||initial.json?.success!==true) {
    // Never retry a submitted check-in when the response may represent a
    // successful D1 commit followed by a downstream failure.
    if(initial.json?.checkin_committed===true)throw new Error('FRMS_QA_COMMITTED_REQUIRES_REVIEW_NO_RETRY');
    throw new Error('FRMS_QA_INITIAL_SUBMISSION_FAILED_HTTP_'+initial.status);
  }
  const id=String(initial.json?.data?.checkin?.id||'');
  if(!id)throw new Error('FRMS_QA_CHECKIN_ID_MISSING');

  const readiness=await authGet(token,'/api/frms/readiness/today?date='+date);
  if(readiness.status!==200||readiness.json?.success!==true||
      readiness.json?.data?.protocol_version!==ACTIVE_BRIEF_PROTOCOL ||
      Number(readiness.json?.data?.valid_trials)<10) {
    throw new Error('FRMS_QA_PVTB_V2_PERSISTENCE_MISMATCH');
  }

  const updated=await authPost(token,'/api/frms/fadiga-checkin',
    checkinPayload(date,4,false,schedule));
  if(updated.status!==200||updated.json?.success!==true) {
    if(updated.json?.checkin_committed===true)throw new Error('FRMS_QA_UPDATE_COMMITTED_REQUIRES_REVIEW_NO_RETRY');
    throw new Error('FRMS_QA_UPDATE_FAILED_HTTP_'+updated.status);
  }
  if(String(updated.json?.data?.checkin?.id||'')!==id)
    throw new Error('FRMS_QA_UPDATE_CHANGED_CANONICAL_CHECKIN_ID');

  const after=await authGet(token,'/api/frms/fadiga-checkin/me?date='+date);
  if(after.status!==200||after.json?.success!==true ||
     String(after.json?.data?.id||'')!==id ||
     Number(after.json?.data?.kss_score)!==4)throw new Error('FRMS_QA_CANONICAL_READBACK_FAILED');
  console.log('FRMS_SYNTHETIC_CHECKIN_BRIEF_60S_KSS_API_PASS tenant=999013 trials=10 update=1 production_writes=0');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(err=>{console.error('FRMS_STAGING_QA_FAILED:'+err.message);process.exitCode=1;});
