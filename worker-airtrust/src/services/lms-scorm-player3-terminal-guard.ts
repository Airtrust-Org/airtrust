/** Server-enforced Score SCORM study-only terminal policy, shared by all LMS routes. */
import type {Env} from '../types';
import type {z} from 'zod';
import {ScormCommitSchema} from './lms-scorm-commit-schema';
import {resolveScormPlayer3Admission} from './lms-scorm-player3-admission';

export type ScormCourseScope={
  curso_id:number;scorm_versao:string|null;tipo_conteudo:string|null;
  scorm_package_r2_prefix:string|null;
};
type Inputs={env:Env;db:D1Database;empresaId:number;course:ScormCourseScope};
function requestParams({env,db,empresaId,course}:Inputs){
  return {env,db,bucket:env.BUCKET,tenant:empresaId,course:course.curso_id,
    scormVersion:course.scorm_versao,contentType:course.tipo_conteudo,
    activePrefix:course.scorm_package_r2_prefix,reviewedForProduction:false};
}

/** Candidate editions never qualify via SCORM status or a manual override. */
export async function scormStudyTerminalBlocked(input:Inputs):Promise<boolean>{
  if(String(input.course.tipo_conteudo??'scorm').toLowerCase()!=='scorm')
    return false;
  const admission=await resolveScormPlayer3Admission(requestParams(input));
  return admission.kind!=='LEGACY';
}

/** Returns an actionable 409 code without performing a single write. */
export async function checkScormStudyCommit(input:Inputs & {
  commit:z.infer<typeof ScormCommitSchema>;
}):Promise<{study:boolean;error?:string}> {
  const admission=await resolveScormPlayer3Admission(requestParams(input));
  if(admission.kind==='BLOCKED')
    return {study:false,error:'SCORM_PLAYER3_PROFILE_NOT_ADMITTED'};
  if(admission.kind==='LEGACY')return {study:false};
  const d=input.commit;
  if(!Number.isSafeInteger(d.ciclo_id)||!d.ciclo_id||d.ciclo_id<1)
    return {study:true,error:'SCORM_STUDY_CYCLE_REQUIRED'};
  if(d.suspend_data){
    let resume:unknown;
    try{resume=JSON.parse(d.suspend_data)}
    catch{return {study:true,error:'SCORM_STUDY_EDITION_MISMATCH'}}
    if(!resume||typeof resume!=='object'||Array.isArray(resume)||
      (resume as Record<string,unknown>).v!==1||
      (resume as Record<string,unknown>).p!==admission.packageVersion)
      return {study:true,error:'SCORM_STUDY_EDITION_MISMATCH'};
  }
  const valid=(s:string|null|undefined)=>s==null||s===''||
    ['incomplete','not attempted','unknown'].includes(s.toLowerCase());
  if(!valid(d.lesson_status)||!valid(d.completion_status)||
     !valid(d.success_status)||
     [d.score_raw,d.score_min,d.score_max,d.score_scaled].some(x=>x!=null)||
     d.completion_candidate===true)
    return {study:true,error:'SCORM_STUDY_CANNOT_CERTIFY'};
  return {study:true};
}
