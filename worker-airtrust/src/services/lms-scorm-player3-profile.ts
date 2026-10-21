/**
 * Player 3 SCORM 1.2 external-exam profile. Reuses the AirTrust authenticated
 * SCORM wrapper; does not convert Score ZIPs into Native documents.
 *
 * R2 manifest is a claim from an admin-uploaded package, not a student event.
 * We pin it to a SHA-256 from the ACTIVE version row and course R2 pointer.
 * No route in this file grades, certifies, or declares exam eligibility.
 */
import type {Env} from '../types';

export type ScormPlayer3Profile=Readonly<{
  packageSha256:string;
  packageVersion:string;
  packageCourseId:string;
  activePrefix:string;
  externalExam:true;
}>;
const SHA=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const YES=/^[1-9][0-9]*$/;
function exactList(raw:string|undefined,value:string):boolean{
  if(!raw||raw.includes('*'))return false;
  const items=raw.split(',').map(x=>x.trim());
  return items.every(x=>x.length>0)&&items.includes(value);
}
/** Explicit tenant + course + immutable ZIP + deployed source SHA. OFF by default. */
export function player3ScormEnabled(env:Env,tenant:number,course:number,sha:string):boolean{
  if(!Number.isSafeInteger(tenant)||tenant<1||!Number.isSafeInteger(course)||
     course<1||!SHA.test(sha)||!['staging','production'].includes(env.ENVIRONMENT))
    return false;
  const staging=env.ENVIRONMENT==='staging';
  const tenants=staging?env.SCORM_PLAYER3_STAGING_TENANTS:env.SCORM_PLAYER3_PRODUCTION_TENANTS;
  const courses=staging?env.SCORM_PLAYER3_STAGING_COURSES:env.SCORM_PLAYER3_PRODUCTION_COURSES;
  const packages=staging?env.SCORM_PLAYER3_STAGING_PACKAGES:env.SCORM_PLAYER3_PRODUCTION_PACKAGES;
  const release=staging?env.SCORM_PLAYER3_STAGING_RELEASE_SHA:env.SCORM_PLAYER3_PRODUCTION_RELEASE_SHA;
  return YES.test(String(tenant))&&YES.test(String(course))&&
    exactList(tenants,String(tenant))&&exactList(courses,String(course))&&
    exactList(packages,sha)&&!!env.AIRTRUST_SOURCE_SHA&&
    COMMIT.test(env.AIRTRUST_SOURCE_SHA)&&release===env.AIRTRUST_SOURCE_SHA;
}
/** This checks only the profile shape; never trust an iframe's mode flag. */
export function isExternalExamScormManifest(raw:unknown):raw is {
 courseId:string;packageVersion:string;engineId:string;release?:{reviewed?:boolean};
} {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const obj=raw as Record<string,unknown>;
  const content=obj.content as Record<string,unknown>|undefined;
  const assessment=obj.assessment as Record<string,unknown>|undefined;
  const completion=obj.completion as Record<string,unknown>|undefined;
  return obj.schemaVersion===1&&obj.scormVersion==='1.2'&&
    obj.engineId==='AIRTRUST_UNIFIED_SCORE_SCORM12_V1'&&
    typeof obj.courseId==='string'&&obj.courseId.length>0&&obj.courseId.length<130&&
    typeof obj.packageVersion==='string'&&obj.packageVersion.length>0&&obj.packageVersion.length<160&&
    !!content&&Array.isArray(content.requiredSlides)&&
    content.requiredSlides.length>0&&content.requiredSlides.length<=2000&&
    !!assessment&&assessment.mode==='EXTERNAL'&&
    assessment.scoringBySCORM===false&&Array.isArray(assessment.requiredInteractions)&&
    !!completion&&completion.passStatusFromSCORM===false&&
    completion.workerApprovalRequired===true;
}
export class ScormPlayer3ProfileUnavailable extends Error{
  constructor(){super('SCORM_PLAYER3_ACTIVE_PROFILE_UNVERIFIED');}
}
/**
 * Never infer the active ZIP from a request body or file name.
 * Missing/corrupt active candidate R2 evidence fails closed (throws).
 */
export async function readActiveScormPlayer3Profile(params:{
 db:D1Database;bucket:R2Bucket;tenant:number;course:number;
 activePrefix:string|null|undefined;
}):Promise<ScormPlayer3Profile|null>{
  const {db,bucket,tenant,course,activePrefix}=params;
  if(!Number.isSafeInteger(tenant)||tenant<1||
     !Number.isSafeInteger(course)||course<1||
     !activePrefix||!/^lms\/scorm\/[1-9][0-9]*\/[1-9][0-9]*\/_candidates\/[a-zA-Z0-9-]+\/$/.test(activePrefix))
    return null;
  if(!activePrefix.startsWith('lms/scorm/'+tenant+'/'+course+'/'))return null;
  const active=await db.prepare(
    'SELECT package_sha256,r2_prefix FROM lms_scorm_package_versions '+
    'WHERE empresa_id=? AND curso_id=? AND r2_prefix=? AND status=\'ACTIVE\' LIMIT 1'
  ).bind(tenant,course,activePrefix)
    .first<{package_sha256:string;r2_prefix:string}>();
  if(!active)return null;
  if(!SHA.test(active.package_sha256)||active.r2_prefix!==activePrefix)
    throw new ScormPlayer3ProfileUnavailable();
  const object=await bucket.get(activePrefix+'airtrust-completion-manifest.json');
  if(!object)throw new ScormPlayer3ProfileUnavailable();
  let manifest:unknown;
  try{
    manifest=JSON.parse(await object.text());
  }catch{throw new ScormPlayer3ProfileUnavailable();}
  if(!isExternalExamScormManifest(manifest))return null;
  return {
    packageSha256:active.package_sha256,packageVersion:manifest.packageVersion,
    packageCourseId:manifest.courseId,activePrefix,externalExam:true,
  };
}
/** Code may be live while individual courses remain unapproved/unpublished. */
export function scormPlayer3AdmissionAllowed(env:Env,tenant:number,course:number,
 profile:ScormPlayer3Profile,reviewed:boolean):boolean{
  return player3ScormEnabled(env,tenant,course,profile.packageSha256)&&
    (env.ENVIRONMENT==='staging'||reviewed);
}
