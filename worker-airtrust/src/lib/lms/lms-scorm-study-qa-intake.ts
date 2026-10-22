/** Score V3 candidates can be uploaded into QA only, never activated here. */
import type {Env} from '../../types';
const HEX=/^[a-f0-9]{64}$/;
export function scormStudyQaTenantEnabled(env:Env,tenant:number):boolean{
  if(env.ENVIRONMENT!=='staging'||!Number.isSafeInteger(tenant)||tenant<1)return false;
  const raw=env.SCORM_STUDY_QA_ENABLED_TENANTS;
  if(!raw||raw.includes('*'))return false;
  const items=raw.split(',').map(v=>v.trim());
  return items.every(v=>/^[1-9][0-9]*$/.test(v))&&items.includes(String(tenant));
}
export function assertScormV3StudyOnlyManifest(raw:unknown):void{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('SCORE_V3_QA_MANIFEST_REQUIRED');
  const obj=raw as Record<string,unknown>;
  const assess=obj.assessment as Record<string,unknown>|null;
  const finish=obj.completion as Record<string,unknown>|null;
  if(obj.schemaVersion!==1||obj.scormVersion!=='1.2'||
    typeof obj.courseId!=='string'||!obj.courseId||
    typeof obj.packageVersion!=='string'||!obj.packageVersion||
    !assess||assess.mode!=='EXTERNAL'||assess.scoringBySCORM!==false||
    !finish||finish.passStatusFromSCORM!==false||
    finish.workerApprovalRequired!==true)throw Error('SCORE_V3_EXTERNAL_STUDY_CONTRACT_REQUIRED');
}
export async function matchesExpectedScormZipSha(
  bytes:Uint8Array,expected:string|null,
):Promise<boolean>{
  if(!expected||!HEX.test(expected))return false;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const actual=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return actual===expected;
}
