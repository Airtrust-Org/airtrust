import {describe,it,expect,vi} from 'vitest';
import {
 player3ScormEnabled,isExternalExamScormManifest,
 readActiveScormPlayer3Profile,scormPlayer3AdmissionAllowed,
} from '../../services/lms-scorm-player3-profile';
import type {Env} from '../../types';
const sha='a'.repeat(64),release='b'.repeat(40);
const pref='lms/scorm/6/9/_candidates/6cd7e7f3-1234/';
const good={schemaVersion:1,scormVersion:'1.2',
 courseId:'costa-do-sol-cultura-justa',packageVersion:'SCORE-F5-V3',
 engineId:'AIRTRUST_UNIFIED_SCORE_SCORM12_V1',
 content:{requiredSlides:['slide01','slide02']},
 assessment:{mode:'EXTERNAL',requiredInteractions:[],scoringBySCORM:false},
 completion:{passStatusFromSCORM:false,workerApprovalRequired:true}};
function env(extra:Record<string,unknown>={}):Env{
 return {ENVIRONMENT:'staging',AIRTRUST_SOURCE_SHA:release,
   SCORM_PLAYER3_STAGING_TENANTS:'6',SCORM_PLAYER3_STAGING_COURSES:'9',
   SCORM_PLAYER3_STAGING_PACKAGES:sha,
   SCORM_PLAYER3_STAGING_RELEASE_SHA:release,...extra} as unknown as Env;
}
function db(row:{package_sha256:string;r2_prefix:string}|null){
 return {prepare:vi.fn(()=>({bind:vi.fn(()=>({
  first:vi.fn(async()=>row),
 }))}))} as unknown as D1Database;
}
function bucket(obj:unknown){
 return {get:vi.fn(async()=>obj===null?null:{
  text:async()=>JSON.stringify(obj),
 })} as unknown as R2Bucket;
}
describe('Player 3 SCORM external-exam authorization is fail-closed',()=>{
 it('is off by default and never permits wildcard, another course or release',()=>{
   expect(player3ScormEnabled({ENVIRONMENT:'production'} as Env,6,9,sha)).toBe(false);
   expect(player3ScormEnabled(env(),6,9,sha)).toBe(true);
   expect(player3ScormEnabled(env(),6,10,sha)).toBe(false);
   expect(player3ScormEnabled(env({SCORM_PLAYER3_STAGING_COURSES:'*'}),6,9,sha)).toBe(false);
   expect(player3ScormEnabled(env({AIRTRUST_SOURCE_SHA:'c'.repeat(40)}),6,9,sha)).toBe(false);
   expect(player3ScormEnabled(env({SCORM_PLAYER3_STAGING_PACKAGES:'c'.repeat(64)}),6,9,sha)).toBe(false);
 });
 it('does not classify legacy scored SCORM or forged completion as external exam',()=>{
   expect(isExternalExamScormManifest(good)).toBe(true);
   expect(isExternalExamScormManifest({...good,assessment:{...good.assessment,
     scoringBySCORM:true}})).toBe(false);
   expect(isExternalExamScormManifest({...good,assessment:{...good.assessment,
     mode:'SCORED'}})).toBe(false);
   expect(isExternalExamScormManifest({...good,assessment:{...good.assessment,
     requiredInteractions:['quiz-1']}})).toBe(false);
   expect(isExternalExamScormManifest({...good,assessment:{...good.assessment,
     masteryScore:80}})).toBe(false);
   expect(isExternalExamScormManifest({...good,completion:{...good.completion,
     workerApprovalRequired:false}})).toBe(false);
   expect(isExternalExamScormManifest({...good,completion:{...good.completion,
     passStatusFromSCORM:true}})).toBe(false);
 });
 it('reads only R2 asset of ACTIVE edition scoped to tenant and course',async()=>{
   const store=db({package_sha256:sha,r2_prefix:pref});
   const b=bucket(good);
   const r=await readActiveScormPlayer3Profile({
     db:store,bucket:b,tenant:6,course:9,activePrefix:pref});
   expect(r).toMatchObject({packageSha256:sha,externalExam:true});
   expect(vi.mocked(b.get)).toHaveBeenCalledWith(pref+'airtrust-completion-manifest.json');
   expect(vi.mocked(store.prepare)).toHaveBeenCalledWith(
     expect.stringContaining('WHERE empresa_id=? AND curso_id=? AND r2_prefix=?'));
 });
 it('rejects cross-tenant prefixes and missing/corrupt trusted assets',async()=>{
   const store=db({package_sha256:sha,r2_prefix:pref});
   expect(await readActiveScormPlayer3Profile({
     db:store,bucket:bucket(good),tenant:7,course:9,activePrefix:pref})).toBeNull();
   await expect(readActiveScormPlayer3Profile({
     db:store,bucket:bucket(null),tenant:6,course:9,activePrefix:pref,
   })).rejects.toThrow('SCORM_PLAYER3_ACTIVE_PROFILE_UNVERIFIED');
   expect(await readActiveScormPlayer3Profile({
     db:db(null),bucket:bucket(good),tenant:6,course:9,activePrefix:pref,
   })).toBeNull();
 });
 it('never admits unreviewed production candidates',()=>{
   const profile={packageSha256:sha,packageVersion:'SCORE-F5-V3',
    packageCourseId:'test',activePrefix:pref,externalExam:true as const};
   expect(scormPlayer3AdmissionAllowed(env(),6,9,profile,false)).toBe(true);
   const prod=env({ENVIRONMENT:'production',
     SCORM_PLAYER3_PRODUCTION_TENANTS:'6',SCORM_PLAYER3_PRODUCTION_COURSES:'9',
     SCORM_PLAYER3_PRODUCTION_PACKAGES:sha,
     SCORM_PLAYER3_PRODUCTION_RELEASE_SHA:release});
   expect(scormPlayer3AdmissionAllowed(prod,6,9,profile,false)).toBe(false);
   expect(scormPlayer3AdmissionAllowed(prod,6,9,profile,true)).toBe(true);
 });
});
