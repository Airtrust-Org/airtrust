/**
 * Score V3 SCORM study coverage; never issues an exam entitlement or certificate.
 * Models/manifests MUST be obtained from the server-verified immutable ZIP.
 * CMI is self-reported even after D1 commit, requiring separate corroboration
 * of actual visits and interaction events before a future exam unlock.
 */
type Obj=Record<string,unknown>;
const object=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
const sha=/^[a-f0-9]{64}$/;
const id=/^[A-Za-z][\w-]{0,79}$/;
export type ScoreStudyBlueprint=Readonly<{
  courseId:string;edition:string;sha256:string;slides:readonly string[];
  fixations:readonly string[];interactionsInManifest:boolean;
}>;
export type ScoreStudyEvidence=Readonly<{
  courseId:string;edition:string;sha256:string;suspendData:string|null;
  tenantVerified:boolean;enrollmentVerified:boolean;cycleVerified:boolean;
  packageVerified:boolean;persistedCommitVerified:boolean;
}>;
export type ScoreStudyVerdict=Readonly<{
  status:'REJECTED'|'INCOMPLETE'|'COVERAGE_REPORTED';
  reason:string;missingSlides:readonly string[];missingFixations:readonly string[];
  studyEndReported:boolean;examEligible:false;grantsCompletion:false;
  grantsCertificate:false;
}>;
function fail(reason:string):ScoreStudyVerdict{
  return{status:'REJECTED',reason,missingSlides:[],missingFixations:[],
    studyEndReported:false,examEligible:false,grantsCompletion:false,
    grantsCertificate:false};
}
export function scoreV3Blueprint(model:unknown,manifest:unknown,
  packageSha256:string):ScoreStudyBlueprint {
  if(!sha.test(packageSha256)||!object(model)||!object(manifest)||
     model.schema!=='AIRTRUST_UNIFIED_SCORE_SCORM12_V1'||
     typeof model.courseId!=='string'||!model.courseId||
     typeof model.edition!=='string'||!model.edition||
     !object(manifest.content)||!object(manifest.assessment)||
     !object(manifest.completion)||manifest.courseId!==model.courseId||
     manifest.packageVersion!==model.edition||manifest.scormVersion!=='1.2'||
     manifest.assessment.mode!=='EXTERNAL'||
     manifest.assessment.scoringBySCORM!==false||
     manifest.completion.passStatusFromSCORM!==false||
     manifest.completion.workerApprovalRequired!==true||
     !Array.isArray(model.slides)||model.slides.length<2||
     model.slides.length>2000)
    throw Error('SCORE_STUDY_CONTRACT_INVALID');
  const rows=model.slides as unknown[];
  if(rows.some(x=>!object(x)||typeof x.id!=='string'||!id.test(x.id)||
      typeof x.kind!=='string'))throw Error('SCORE_STUDY_SLIDE_INVALID');
  const slides=rows.map(x=>(x as Obj).id as string);
  const requiredSlides=manifest.content.requiredSlides;
  if(new Set(slides).size!==slides.length||
     !Array.isArray(requiredSlides)||
     requiredSlides.length!==slides.length||
     !slides.every((x,i)=>requiredSlides[i]===x))
    throw Error('SCORE_STUDY_SLIDE_MANIFEST_MISMATCH');
  const fixations=rows.filter(x=>(x as Obj).kind==='scenario')
    .map(x=>(x as Obj).id as string);
  if(!fixations.length)throw Error('SCORE_STUDY_FIXATIONS_MISSING');
  const declared=manifest.assessment.requiredInteractions;
  if(!Array.isArray(declared)||declared.some(x=>typeof x!=='string')||
    (declared.length!==0 && (declared.length!==fixations.length ||
       !fixations.every((x,i)=>declared[i]===x))))
    throw Error('SCORE_STUDY_INTERACTION_MANIFEST_MISMATCH');
  // V3 intentionally has requiredInteractions: []; these 86 formatively
  // required interactions come from authoritative model slide.kind=scenario.
  return {courseId:model.courseId,edition:model.edition,sha256:packageSha256,
    slides,fixations,interactionsInManifest:declared.length===fixations.length};
}
export function scoreV3ReportedStudyCoverage(
  plan:ScoreStudyBlueprint,evidence:ScoreStudyEvidence):ScoreStudyVerdict {
  if(!plan||!evidence||!evidence.tenantVerified||
    !evidence.enrollmentVerified||!evidence.cycleVerified||
    !evidence.packageVerified||!evidence.persistedCommitVerified||
    plan.courseId!==evidence.courseId||plan.edition!==evidence.edition||
    plan.sha256!==evidence.sha256)return fail('VERIFIED_PERSISTED_SCOPE_REQUIRED');
  if(typeof evidence.suspendData!=='string'||!evidence.suspendData||
     evidence.suspendData.length>3900)return fail('CMI_UNAVAILABLE');
  let raw:unknown;
  try{raw=JSON.parse(evidence.suspendData)}catch{return fail('CMI_INVALID')}
  if(!object(raw)||raw.v!==1||raw.p!==plan.edition||
    typeof raw.study!=='boolean'||!Array.isArray(raw.d)||
    !Array.isArray(raw.f))return fail('CMI_EDITION_OR_SCHEMA_INVALID');
  const max=plan.slides.length;
  const valid=(arr:unknown[])=>arr.every(x=>
    typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<max)&&
    new Set(arr).size===arr.length;
  if(!valid(raw.d)||!valid(raw.f))return fail('CMI_INDICES_INVALID');
  const seen=new Set(raw.d as number[]);
  const fixed=new Set(raw.f as number[]);
  const missingSlides=plan.slides.filter((_,i)=>!seen.has(i));
  const byId=new Map(plan.slides.map((slide,i)=>[slide,i]));
  const missingFixations=plan.fixations.filter(x=>{
    const index=byId.get(x);return index===undefined||
      !fixed.has(index)||!seen.has(index);
  });
  const studyEndReported=raw.study===true;
  const all=missingSlides.length===0&&missingFixations.length===0&&studyEndReported;
  return {status:all?'COVERAGE_REPORTED':'INCOMPLETE',
    reason:all?'NEEDS_INDEPENDENT_SERVER_EVIDENCE':'MISSING_REQUIRED_LEARNING',
    missingSlides,missingFixations,studyEndReported,examEligible:false,
    grantsCompletion:false,grantsCertificate:false};
}
