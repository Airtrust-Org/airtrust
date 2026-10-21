/**
 * Player 3 Native STUDY_ONLY production gate: no scores or certificates.
 * Exact deployed SHA + tenant + immutable edition allowlist; default OFF.
 */
import type {Env} from '../types';
import type {NativeCourseArtifact} from '../lib/lms/lms-native-course-contract';
const SHA=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
function exactMember(raw:string|undefined,value:string):boolean{
  if(!raw||raw.includes('*'))return false;
  const items=raw.split(',').map(x=>x.trim());
  return items.every(x=>x.length>0) && items.includes(value);
}
export function canReadStudyOnlyInStaging(env:Env,tenant:number):boolean{
  return env.ENVIRONMENT==='staging' && Number.isSafeInteger(tenant) &&
    tenant>0 && exactMember(env.NATIVE_STUDY_ONLY_STAGING_TENANTS,String(tenant)) &&
    exactMember(env.NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS,String(tenant)) &&
    exactMember(env.NATIVE_LEARNER_WRITE_ENABLED_TENANTS,String(tenant)) &&
    !!env.AIRTRUST_SOURCE_SHA && COMMIT.test(env.AIRTRUST_SOURCE_SHA) &&
    env.NATIVE_STUDY_ONLY_STAGING_RELEASE_SHA===env.AIRTRUST_SOURCE_SHA &&
    !!env.NATIVE_STUDY_ONLY_STAGING_EDITIONS &&
    !env.NATIVE_STUDY_ONLY_STAGING_EDITIONS.includes('*');
}
export function isNativeStudyOnlyEnabled(env:Env,tenant:number):boolean{
  return canReadStudyOnlyInProduction(env,tenant) ||
    canReadStudyOnlyInStaging(env,tenant);
}
export function canReadStudyOnlyInProduction(env:Env,tenant:number):boolean{
  return env.ENVIRONMENT==='production' && Number.isSafeInteger(tenant) &&
    tenant>0 && exactMember(env.NATIVE_STUDY_ONLY_PRODUCTION_TENANTS,String(tenant)) &&
    !!env.AIRTRUST_SOURCE_SHA && COMMIT.test(env.AIRTRUST_SOURCE_SHA) &&
    env.NATIVE_STUDY_ONLY_PRODUCTION_RELEASE_SHA===env.AIRTRUST_SOURCE_SHA &&
    !!env.NATIVE_STUDY_ONLY_PRODUCTION_EDITIONS &&
    !env.NATIVE_STUDY_ONLY_PRODUCTION_EDITIONS.includes('*');
}
type FormativeProjection=Pick<NativeCourseArtifact,'policy'|'units'>;
export function isApprovedStudyOnlyEdition(env:Env,tenant:number,
  editionSha256:string,artifact:FormativeProjection):boolean{
  const editions=env.ENVIRONMENT==='staging'
    ?env.NATIVE_STUDY_ONLY_STAGING_EDITIONS
    :env.NATIVE_STUDY_ONLY_PRODUCTION_EDITIONS;
  return isNativeStudyOnlyEnabled(env,tenant) &&
    SHA.test(editionSha256) &&
    exactMember(editions,editionSha256) &&
    artifact.policy.mode==='FORMATIVE' &&
    Array.isArray(artifact.units) && artifact.units.length>0 &&
    artifact.units.some(unit=>unit.kind==='lesson') &&
    artifact.units.every(unit=>unit.kind==='lesson'||unit.kind==='practice');
}
/** On staging preserve the audited legacy Native pilot contract unchanged. */
export function permitNativeStudyContent(env:Env,tenant:number,
  editionSha256:string,artifact:FormativeProjection):boolean{
  if(env.ENVIRONMENT!=='production' && !canReadStudyOnlyInStaging(env,tenant)){
    // Retain separate staging pilot; its original scope gates are unchanged.
    return true;
  }
  return isApprovedStudyOnlyEdition(env,tenant,editionSha256,artifact);
}
