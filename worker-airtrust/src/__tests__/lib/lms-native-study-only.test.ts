import {describe,it,expect} from 'vitest';
import {
 canReadStudyOnlyInProduction,canReadStudyOnlyInStaging,isNativeStudyOnlyEnabled,
 isApprovedStudyOnlyEdition,permitNativeStudyContent,
} from '../../services/lms-native-study-only';
import type {Env} from '../../types';
import type {NativeCourseArtifact} from '../../lib/lms/lms-native-course-contract';

const release='a'.repeat(40);
const edition='b'.repeat(64);
const lesson:NativeCourseArtifact['units'][number]={id:'l1',title:'Aula obrigatória',kind:'lesson',questionIds:[],blocks:[
  {type:'paragraph',text:'Conteúdo importante'},
]};
const practice:NativeCourseArtifact['units'][number]={id:'p1',title:'Fixação',kind:'practice',questionIds:['q1'],blocks:[]};
const artifact={policy:{mode:'FORMATIVE'},units:[lesson,practice]} as unknown as NativeCourseArtifact;
function env(overrides:Record<string,unknown>={}):Env {
 return {ENVIRONMENT:'production',AIRTRUST_SOURCE_SHA:release,
  NATIVE_STUDY_ONLY_PRODUCTION_RELEASE_SHA:release,
  NATIVE_STUDY_ONLY_PRODUCTION_TENANTS:'6',
  NATIVE_STUDY_ONLY_PRODUCTION_EDITIONS:edition,
  ...overrides} as unknown as Env;
}
describe('Player3 Native production study-only release guard',()=>{
 it('is OFF absent complete tenant/release/edition configuration',()=>{
   const e=env();
   for(const key of [
    'NATIVE_STUDY_ONLY_PRODUCTION_TENANTS',
    'NATIVE_STUDY_ONLY_PRODUCTION_RELEASE_SHA',
    'NATIVE_STUDY_ONLY_PRODUCTION_EDITIONS',
    'AIRTRUST_SOURCE_SHA',
   ]){
     const changed={...e,[key]:undefined};
     expect(canReadStudyOnlyInProduction(changed,6)).toBe(false);
   }
 });
 it('rejects different tenant, deploy SHA, wildcard and malformed allowlists',()=>{
   expect(canReadStudyOnlyInProduction(env(),6)).toBe(true);
   expect(canReadStudyOnlyInProduction(env(),7)).toBe(false);
   expect(canReadStudyOnlyInProduction(env({AIRTRUST_SOURCE_SHA:'c'.repeat(40)}),6)).toBe(false);
   expect(canReadStudyOnlyInProduction(env({NATIVE_STUDY_ONLY_PRODUCTION_TENANTS:'*'}),6)).toBe(false);
   expect(canReadStudyOnlyInProduction(env({NATIVE_STUDY_ONLY_PRODUCTION_TENANTS:'6,,'}),6)).toBe(false);
   expect(canReadStudyOnlyInProduction(env({NATIVE_STUDY_ONLY_PRODUCTION_EDITIONS:'*'}),6)).toBe(false);
   expect(canReadStudyOnlyInProduction(env({AIRTRUST_SOURCE_SHA:'a'.repeat(39)}),6)).toBe(false);
 });
 it('restricts content to approved immutable FORMATIVE edition with lessons and fixations',()=>{
   expect(isApprovedStudyOnlyEdition(env(),6,edition,artifact)).toBe(true);
   expect(isApprovedStudyOnlyEdition(env(),6,'c'.repeat(64),artifact)).toBe(false);
   expect(isApprovedStudyOnlyEdition(env(),7,edition,artifact)).toBe(false);
   expect(isApprovedStudyOnlyEdition(env(),6,edition,
     {...artifact,policy:{mode:'SCORED',masteryScore:70}})).toBe(false);
   for(const kind of ['assessment','scenario']){
     expect(isApprovedStudyOnlyEdition(env(),6,edition,{
       ...artifact,units:[lesson,{...practice,kind}],
     } as NativeCourseArtifact)).toBe(false);
   }
   expect(isApprovedStudyOnlyEdition(env(),6,edition,
     {...artifact,units:[practice]})).toBe(false);
 });
 it('only enables staging study-only by independent SHA, tenant and edition',()=>{
   const s=env({ENVIRONMENT:'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS:'6',
    NATIVE_STUDY_ONLY_STAGING_TENANTS:'6',
    NATIVE_STUDY_ONLY_STAGING_RELEASE_SHA:release,
    NATIVE_STUDY_ONLY_STAGING_EDITIONS:edition,
   });
   expect(canReadStudyOnlyInStaging(s,6)).toBe(true);
   expect(isNativeStudyOnlyEnabled(s,6)).toBe(true);
   expect(isApprovedStudyOnlyEdition(s,6,edition,artifact)).toBe(true);
   expect(isApprovedStudyOnlyEdition(s,6,'c'.repeat(64),artifact)).toBe(false);
   expect(permitNativeStudyContent(s,6,edition,{
     ...artifact,units:[lesson,{...practice,kind:'assessment'}]
   } as NativeCourseArtifact)).toBe(false);
   for(const key of ['NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS',
    'NATIVE_LEARNER_WRITE_ENABLED_TENANTS','NATIVE_STUDY_ONLY_STAGING_TENANTS',
    'NATIVE_STUDY_ONLY_STAGING_RELEASE_SHA','NATIVE_STUDY_ONLY_STAGING_EDITIONS']){
      expect(canReadStudyOnlyInStaging({...s,[key]:undefined},6)).toBe(false);
   }
   expect(canReadStudyOnlyInStaging({...s,NATIVE_STUDY_ONLY_STAGING_TENANTS:'*'},6)).toBe(false);
 });
 it('never turns a terminal stage into an authorized player by changing a feature flag',()=>{
   const forged={...artifact,units:[lesson,{...practice,kind:'assessment'}]} as NativeCourseArtifact;
   expect(permitNativeStudyContent(env(),6,edition,forged)).toBe(false);
   expect(permitNativeStudyContent(env(),6,edition,artifact)).toBe(true);
   // Staging continues to use its existing scoped and approved learner contracts.
   expect(permitNativeStudyContent(env({ENVIRONMENT:'staging'}),6,edition,forged)).toBe(true);
 });
});
