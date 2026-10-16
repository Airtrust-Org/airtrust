#!/usr/bin/env node
// Administrative reconciliation for training COMPLETED according to the
// Training Manager: canonical tenant-scoped API, never raw SQL or forged SCORM.
import process from 'node:process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertAllowedProductionBaseUrl, extractAccessToken, fetchJson, login } from '../smoke-auth-common.mjs';
const API=assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const MODE=process.env.LMS_HIST_ATOMIC_MODE;
const MAIN=String(process.env.EXPECTED_MAIN_SHA||'').toLowerCase();
const PROD=String(process.env.EXPECTED_PRODUCTION_SHA||'').toLowerCase();
const TENANT=Number(process.env.TARGET_COMPANY_ID);
const REASON='AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016: Reconhecimento administrativo autorizado da realizacao do curso na edicao SCORM anterior em 16/10/2026. Gerencia de Treinamento atesta conclusao, sem afirmar aprovacao da nova edicao; gerar qualificacao pelo mecanismo canonico com trilha de auditoria.';
const PAIRS=new Map([[2106,68],[384,34],[201,28],[608,43],[2139,68],[610,43],[544,7],[624,43],[700,55],[2052,68]]);
const valid=(v,code)=>{if(!v)throw Error('LMS_HIST_ATOMIC_'+code);};
const upper=x=>String(x??'').trim().toUpperCase();
const progress=x=>Number(x?.progresso_bruto??x?.progresso_pct??-1);
export function plan(courses, authorizedIds = null){
  if(authorizedIds !== null)valid(authorizedIds instanceof Set&&authorizedIds.size===10,'AUTHORIZED_IDS_INVALID');
  const rows=[],alreadyCompleted=[],pendingReview=[],excluded={cancelled:0,reproved:0,other:0},seen=new Set();
  const order=authorizedIds===null?new Map():new Map([...authorizedIds].map((id,i)=>[id,i+1]));
  for(const course of courses)for(const row of course.enrollments){
    const s=upper(row.status),p=progress(row),id=Number(row.id),cid=Number(course.id);
    if(authorizedIds!==null&&!authorizedIds.has(id))continue;
    if(authorizedIds!==null && PAIRS.get(id)!==cid){
      valid(!seen.has(id),'DUPLICATE_ENROLLMENT');
      seen.add(id);
      pendingReview.push({ordinal:order.get(id),curso_id:cid,status:'COURSE_MISMATCH',progresso_bruto:p});
      continue;
    }
    if(authorizedIds!==null){
      valid(Number.isInteger(id)&&id>0&&Number.isInteger(cid)&&cid>0&&!seen.has(id),'IDENTITY_INVALID');
      seen.add(id);
      if(s==='CONCLUIDO'&&p===100){alreadyCompleted.push({id,cid,status:s,p});continue;}
      if(s==='EM_ANDAMENTO'&&p>=99&&p<=100){rows.push({id,cid,status:s,p});continue;}
      pendingReview.push({ordinal:order.get(id),curso_id:cid,status:s,progresso_bruto:p});
      continue;
    }
    if(s==='CONCLUIDO'||p<99)continue;
    if(s==='CANCELADO'){excluded.cancelled++;continue;}
    if(s==='REPROVADO'){excluded.reproved++;continue;}
    if(!['EM_ANDAMENTO','NAO_INICIADO'].includes(s)){excluded.other++;continue;}
    valid(p===100,'AMBIGUOUS_PROGRESS');
    valid(Number.isInteger(id)&&id>0&&Number.isInteger(cid)&&cid>0&&!seen.has(id),'IDENTITY_INVALID');
    seen.add(id);rows.push({id,cid,status:s,p});
  }
  if(authorizedIds!==null)for(const [id,ordinal] of order){
    if(!seen.has(id))pendingReview.push({ordinal,curso_id:null,status:'NOT_FOUND',progresso_bruto:null});
  }
  rows.sort((a,b)=>a.cid-b.cid||a.id-b.id);
  alreadyCompleted.sort((a,b)=>a.cid-b.cid||a.id-b.id);
  pendingReview.sort((a,b)=>a.ordinal-b.ordinal);
  valid(rows.length<=100,'COHORT_LIMIT');
  const payload=authorizedIds===null?rows:{rows,alreadyCompleted,pendingReview};
  return {rows,alreadyCompleted,pendingReview,excluded,
    hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
async function get(token,route){
  valid(route.startsWith('/api/lms/')||['/api/auth/empresas','/api/auth/me','/api/empresas/minha'].includes(route),'PATH_BLOCKED');
  // Only GET is retryable: never repeat an administrative PATCH after a network error.
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{return await fetchJson(API+route,{headers:{Authorization:'Bearer '+token}});}
    catch(error){last=error;}
  }
  throw Error('READ_NETWORK_FAILED:'+route.split('?')[0]+':'+String(last?.message||'network').slice(0,30));
}
export function isVerifiedCompletedCredit(row){
  return Number(row?.empresa_id)===6 &&
    PAIRS.get(Number(row?.id))===Number(row?.curso_id) &&
    upper(row?.status)==='CONCLUIDO' && progress(row)===100 &&
    Boolean(String(row?.data_conclusao||'').trim()) &&
    Boolean(row?.qualificacao_historico_id);
}
async function pin(){
  const r=await fetchJson(API+'/api/version');
  valid(r.status===200,'VERSION_HTTP');
  const d=r.json?.data&&typeof r.json.data==='object'?r.json.data:r.json;
  valid(String(d?.sourceSha||d?.source_sha||'').toLowerCase()===PROD,'VERSION_MISMATCH');
}
async function authorize(){
  const email=process.env.PROD_SMOKE_EMAIL,password=process.env.PROD_SMOKE_PASSWORD;
  valid(email&&password,'CREDENTIAL_MISSING');
  let token=extractAccessToken(await login(API,email,password));valid(token,'TOKEN_MISSING');
  const r=await get(token,'/api/auth/empresas');
  valid(r.status===200&&r.json?.data?.empresas?.some(c=>Number(c.id)===TENANT),'TENANT_ACCESS_DENIED');
  if(Number(r.json?.data?.empresaAtualId)!==TENANT){
    const c=await fetchJson(API+'/api/auth/select-empresa',{method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({empresaId:TENANT})});
    valid(c.status===200,'TENANT_SELECT_FAILED');
    token=c.json?.data?.accessToken;valid(token,'TENANT_TOKEN_MISSING');
  }
  const me=await get(token,'/api/auth/me'),company=await get(token,'/api/empresas/minha');
  valid(me.status===200&&['ADMIN','ADMINISTRADOR'].includes(upper(me.json?.data?.role)),'ADMIN_REQUIRED');
  valid(company.status===200&&Number(company.json?.data?.id)===TENANT,'TENANT_MISMATCH');
  return token;
}
export function authorizedEnrollmentIds(){
  const raw=String(process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS||'').trim().split(',');
  valid(raw.length===10 && raw.every(x=>/^[1-9][0-9]{0,8}$/.test(x.trim())),'AUTHORIZED_INPUT');
  const ids=raw.map(x=>Number(x.trim()));
  valid(new Set(ids).size===10,'AUTHORIZED_DUPLICATES');
  return new Set(ids);
}
function authorizedIdsHash(ids){
  return createHash('sha256').update(JSON.stringify([...ids].sort((a,b)=>a-b))).digest('hex');
}
async function collect(token,ids){
  // Address the exact authorized IDs. Course rosters may hide concluded rows,
  // so an all-courses scan cannot safely resume after a partial production write.
  const cohort=[];
  const assessmentByOrdinal=[];
  let ordinal=0;
  for(const id of ids){
    ordinal++;
    const response=await get(token,'/api/lms/matriculas/'+id);
    valid(response.status===200&&response.json?.success===true,'ENROLLMENT_READ_FAILED');
    const row=response.json?.data;
    valid(row&&Number(row.id)===id&&Number(row.empresa_id)===TENANT,'ENROLLMENT_TENANT_OR_IDENTITY');
    const course=Number(row.curso_id);
    valid(PAIRS.get(id)===course,'ENROLLMENT_COURSE_DRIFT');
    if(upper(row.status)==='CONCLUIDO'){
      // Refuse to treat bare status/progress as evidence of canonical qualification.
      valid(isVerifiedCompletedCredit(row),'COMPLETED_WITHOUT_LINKED_QUALIFICATION');
    } else {
      valid(row.edition_mismatch?.required===true,'HISTORIC_EDITION_NOT_PROVEN');
    }
    const assessed=classifyHistoricAssessment(row);
    assessmentByOrdinal.push({ordinal,curso_id:course,
      enrollment_status:upper(row.status),qualification_linked:Boolean(row.qualificacao_historico_id),
      ...assessed});
    cohort.push({id:course,enrollments:[row]});
  }
  return {...plan(cohort,ids),assessmentByOrdinal};
}


/**
 * Read-only historical evidence triage. Identifies what the CURRENT strict
 * canonical scorer would see, without turning administrative attestation into
 * a SCORM pass. No CMI, learner identity, notes or credentials in the report.
 */
export function classifyHistoricAssessment(row){
  const scorm=row?.scorm_progresso;
  const policy=upper(row?.scorm_assessment_policy);
  const mastery=row?.scorm_mastery_score;
  const requiresAssessment=policy!=='FORMATIVE' &&
    (Number(row?.gerar_qualificacao_ao_concluir)===1 || mastery!=null);
  const isNumber=x=>typeof x==='number'&&Number.isFinite(x);
  const raw=scorm?.score_raw, scaled=scorm?.score_scaled;
  const min=scorm?.score_min, max=scorm?.score_max;
  const lesson=String(scorm?.lesson_status??'').trim().toLowerCase();
  const success=String(scorm?.success_status??'').trim().toLowerCase();
  const completion=String(scorm?.completion_status??'').trim().toLowerCase();
  let scorePct=null,scoreIssue=null;
  if(scaled!=null){
    if(!isNumber(scaled)||scaled<0||scaled>1)scoreIssue='INVALID';
    else scorePct=scaled*100;
  }else if(raw!=null){
    if(!isNumber(raw))scoreIssue='INVALID';
    else if(max!=null){
      const minimum=min==null?0:min;
      if(!isNumber(max)||!isNumber(minimum)||max<=minimum||raw<minimum||raw>max)scoreIssue='INVALID';
      else scorePct=(raw-minimum)/(max-minimum)*100;
    }else if(raw<0||raw>100)scoreIssue='INVALID';
    else scorePct=raw;
  }
  const normalizedMastery=isNumber(mastery)?mastery:null;
  const explicitFailure=lesson==='failed'||success==='failed';
  const explicitTerminal=['passed','completed','complete'].includes(lesson)||
    success==='passed'||['completed','complete'].includes(completion);
  let category;
  if(explicitFailure)category='EXPLICIT_FAILURE';
  else if(!scorm)category='SCORM_EVIDENCE_MISSING';
  else if(!requiresAssessment)category='NOT_SCORED_POLICY_NEEDS_REVIEW';
  else if(!isNumber(mastery)||mastery<=0||mastery>100)category='MASTERY_INVALID_OR_MISSING';
  else if(scoreIssue)category='SCORE_INVALID';
  else if(scorePct==null)category='SCORE_MISSING';
  else if(scorePct<mastery)category='SCORE_BELOW_MASTERY';
  else category='SCORE_AT_OR_ABOVE_MASTERY';
  return {category,score_pct:scorePct===null?null:Number(scorePct.toFixed(4)),
    mastery_score:normalizedMastery,assessment_required:requiresAssessment,
    terminal_status_present:explicitTerminal,explicit_failure:explicitFailure,
    edition_mismatch_required:row?.edition_mismatch?.required===true};
}

function report(p,results,ids){
  const by_course={};
  for(const row of p.rows)by_course[row.cid]=(by_course[row.cid]||0)+1;
  return {schema_version:1,repo_sha:MAIN,production_sha:PROD,tenant:TENANT,
    mode:MODE,administrator_attestation:'TRAINING_MANAGEMENT_PRIOR_EDITION_CREDIT_2026_10_16',
    candidates:p.rows.length,already_completed:p.alreadyCompleted.length,
    pending_review_count:p.pendingReview.length,pending_review:p.pendingReview,
    raw_99_candidates:p.rows.filter(r=>r.p===99).length,
    candidate_hash:p.hash,authorized_count:ids.size,authorized_ids_hash:authorizedIdsHash(ids),by_course,excluded:p.excluded,
    assessment_by_ordinal:p.assessmentByOrdinal??[],
    writes:results.completed||0,results,scorm_cmi_changed:false,personal_data:false,
    completion_date_rule:'CANONICAL_SERVER_DATE',historical_training_date_not_fabricated:true};
}
export function administrativeObservations(existing){
  const prior=String(existing??'').trim();
  return prior?REASON+'\n\n'+prior:REASON;
}
export function isOnlyReviewedException(plan){
  return plan.pendingReview.length===1 &&
    plan.pendingReview[0].ordinal===3 &&
    plan.pendingReview[0].curso_id===43 &&
    plan.pendingReview[0].status==='EM_ANDAMENTO' &&
    plan.pendingReview[0].progresso_bruto===4;
}
async function main(){
  valid(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main','GITHUB_MAIN_REQUIRED');
  valid(/^[a-f0-9]{40}$/.test(MAIN)&&process.env.GITHUB_SHA===MAIN,'SOURCE_SHA_CHANGED');
  valid(/^[a-f0-9]{40}$/.test(PROD)&&TENANT===6,'PRODUCTION_SCOPE_INVALID');
  valid(['dry-run','apply'].includes(MODE),'MODE_INVALID');
  valid(process.env.LMS_HIST_ATOMIC_CONFIRMATION===('AIRTRUST_LMS_HIST_ATOMIC_'+(MODE==='apply'?'APPLY':'DRY_RUN')),'CONFIRMATION_MISSING');
  const ids=authorizedEnrollmentIds();
  await pin();const token=await authorize();const cohort=await collect(token,ids);
  if(MODE==='dry-run'){process.stdout.write(JSON.stringify(report(cohort,{completed:0},ids),null,2));return;}
  valid(cohort.pendingReview.length===0 &&
    cohort.rows.length+cohort.alreadyCompleted.length===10,'TEN_PRECONDITIONS_CHANGED');
  valid(cohort.hash===process.env.REVIEWED_COHORT_HASH,'REVIEWED_COHORT_CHANGED');
  const results={completed:0,already_completed:0,review_required:0,rejected_409:0,rejected_403:0,other_error:0,qualification_linked:0,detail:[]};
  const ordinalById=new Map([...ids].map((id,i)=>[id,i+1]));
  for(const row of cohort.alreadyCompleted){
    const response=await get(token,'/api/lms/matriculas/'+row.id);
    valid(response.status===200,'ALREADY_COMPLETED_READ_FAILED');
    const d=response.json?.data||{};
    valid(isVerifiedCompletedCredit(d),'ALREADY_COMPLETED_STATE_CHANGED');
    results.already_completed++;
    results.qualification_linked++;
    results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,
      outcome:'ALREADY_CONCLUIDO',qualification_linked:true});
  }
  for(const row of cohort.rows){
    await pin();
    const before=await get(token,'/api/lms/matriculas/'+row.id);
    valid(before.status===200,'ROW_READ_FAILED');
    const data=before.json?.data||{};
    if(upper(data.status)==='CONCLUIDO'){
      valid(isVerifiedCompletedCredit(data),'COMPLETED_CONCURRENTLY_INVALID');
      results.already_completed++;
      results.qualification_linked++;
      results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,
        outcome:'ALREADY_CONCLUIDO',qualification_linked:true});
      continue;
    }
    valid(upper(data.status)===row.status&&Number(data.curso_id)===row.cid&&progress(data)===row.p,'ROW_DRIFT');
    valid(data.edition_mismatch?.required===true,'HISTORIC_EDITION_NOT_PROVEN');
    let res;
    try{
      res=await fetchJson(API+'/api/lms/matriculas/'+row.id+'/status',{
        method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({status:'CONCLUIDO',observacoes:administrativeObservations(data.observacoes)})});
    }catch(error){
      // A lost HTTP response does not prove the server rolled back. Never send
      // the PATCH again; verify the exact same row and qualification by GET.
      const observed=await get(token,'/api/lms/matriculas/'+row.id);
      const current=observed.json?.data;
      if(observed.status===200&&isVerifiedCompletedCredit(current)&&
          String(current.observacoes||'').includes('AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016:')){
        results.completed++;
        results.qualification_linked++;
        results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,
          outcome:'HTTP_UNCERTAIN_VERIFIED_CANONICAL',qualification_linked:true});
        continue;
      }
      throw Error('PATCH_UNCERTAIN_NO_SAFE_RETRY:'+row.id+':'+String(error?.message||'network').slice(0,32));
    }
    if(res.status===409){results.rejected_409++;results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,outcome:'REJECTED_409',reason_code:String(res.json?.code||'UNSPECIFIED').slice(0,64)});break;}
    if(res.status===403){results.rejected_403++;results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,outcome:'REJECTED_403',reason_code:String(res.json?.code||'UNSPECIFIED').slice(0,64)});break;}
    if(res.status!==200||res.json?.success!==true){results.other_error++;results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,outcome:'ERROR'});break;}
    const after=await get(token,'/api/lms/matriculas/'+row.id);
    valid(after.status===200&&upper(after.json?.data?.status)==='CONCLUIDO'&&
      Number(after.json?.data?.progresso_pct)===100&&
      Boolean(String(after.json?.data?.data_conclusao||'').trim()),'POSTCHECK_FAILED');
    valid(Boolean(after.json?.data?.qualificacao_historico_id),'QUALIFICATION_NOT_LINKED');
    results.qualification_linked++;
    results.detail.push({ordinal:ordinalById.get(row.id),course_id:row.cid,outcome:'CONCLUIDO',qualification_linked:Boolean(after.json?.data?.qualificacao_historico_id)});
    results.completed++;
  }
  process.stdout.write(JSON.stringify(report(cohort,results,ids),null,2));
  valid(results.other_error===0&&results.rejected_409===0&&results.rejected_403===0,'RECONCILIATION_PARTIAL_REVIEW_REQUIRED');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('LMS_HIST_ATOMIC_GOVERNED_FAILED:'+String(e.message).slice(0,90));process.exitCode=1;});
