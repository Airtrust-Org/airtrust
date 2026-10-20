/** F5 standalone read-only approval gate. No content conversion, DB/R2 writes or publishing. */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const HASH=/^[a-f0-9]{64}$/, KEY=/^[a-zA-Z0-9._:-]{6,128}$/;
const required=['source','edition','learner','privateBank','policy','crosswalk','navigation','fidelity'];
export class NativeApprovalDenied extends Error{
  constructor(code){super('PLAYER3_QA_APPROVAL_'+code);this.name='NativeApprovalDenied';}
}
const need=(ok,code)=>{if(!ok)throw new NativeApprovalDenied(code)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(o,k)=>obj(o)&&Object.keys(o).length===k.length&&k.every(x=>Object.hasOwn(o,x));
const sha=x=>typeof x==='string'&&HASH.test(x);
const id=x=>typeof x==='string'&&x.length>0&&x.length<=128;
function document(root,path){
  need(typeof path==='string'&&path.length>0&&path.length<=300&&!path.startsWith('/')&&
    !path.includes('\\')&&!path.split('/').some(s=>!s||s==='.'||s==='..'),'UNSAFE_DOCUMENT_PATH');
  const file=resolve(root,path);need(file.startsWith(root+sep),'DOCUMENT_OUTSIDE_ROOT');
  try{
    const stat=lstatSync(file);
    need(stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(file)===file&&
      stat.size>0&&stat.size<=4*1024*1024,'UNSAFE_DOCUMENT');
    return readFileSync(file);
  }catch(e){if(e instanceof NativeApprovalDenied)throw e;throw new NativeApprovalDenied('DOCUMENT_MISSING');}
}
function artifact(root,entry){
  need(exact(entry,['path','sha256']),'MANDATORY_EVIDENCE_MISSING');
  need(sha(entry.sha256),'ARTIFACT_HASH_REQUIRED');
  need(typeof entry.path==='string'&&entry.path.length>0&&entry.path.length<=300&&
    !entry.path.startsWith('/')&&!entry.path.includes('\\')&&
    !entry.path.split('/').some(p=>!p||p==='.'||p==='..'),'UNSAFE_EVIDENCE_PATH');
  const file=resolve(root,entry.path);
  need(file.startsWith(root+sep),'EVIDENCE_PATH_OUTSIDE_ROOT');
  let bytes;
  try{
    const stat=lstatSync(file);
    need(stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(file)===file&&
      stat.size>0&&stat.size<=120*1024*1024,'ARTIFACT_NOT_REGULAR_OR_SYMLINK');
    bytes=readFileSync(file);
  }catch(e){if(e instanceof NativeApprovalDenied)throw e;throw new NativeApprovalDenied('ARTIFACT_MISSING');}
  need(hash(bytes)===entry.sha256,'ARTIFACT_HASH_MISMATCH');
  return bytes;
}
function json(bytes,code){
  try{const value=JSON.parse(bytes.toString('utf8'));need(obj(value),code);return value;}
  catch(e){if(e instanceof NativeApprovalDenied)throw e;throw new NativeApprovalDenied(code);}
}
const keyLeak=/^(answer|answers|answerkey|officialanswer|correct|correctanswers|correctoption|correctoptionid|correctoptionids|iscorrect|feedback|feedbackcorrect|feedbackincorrect|explain|explanation|rationale|solution|gabarito|ok)$/i;
function safeLearner(o){
  if(Array.isArray(o))return o.every(safeLearner);
  if(obj(o))return Object.entries(o).every(([k,v])=>!keyLeak.test(k.replace(/[_-]/g,''))&&safeLearner(v));
  return true;
}
const ids=x=>Array.isArray(x)&&x.length>0&&x.every(v=>obj(v)&&id(v.id))&&
  new Set(x.map(v=>v.id)).size===x.length;
const same=(a,b)=>a.length===b.length&&a.every(v=>b.includes(v));

export function verifyNativeQaApproval({rootDir,evidenceFile,approvalFile,trustedReviewerKeys}){
  need(typeof rootDir==='string'&&typeof evidenceFile==='string'&&
    typeof approvalFile==='string'&&obj(trustedReviewerKeys),'REVIEW_AND_PROTECTED_TRUST_REQUIRED');
  const root=realpathSync(rootDir),evidenceBytes=document(root,evidenceFile);
  const e=json(evidenceBytes,'INVALID_EVIDENCE_JSON');
  need(e.schema==='AIRTRUST_PLAYER3_NATIVE_QA_APPROVAL_EVIDENCE_V1'&&
    ['REVIEW_ONLY_NEVER_DEPLOY','REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW'].includes(e.status)&&
    e.publicationPerformed===false&&id(e.courseId)&&id(e.packageVersion)&&
    id(e.authorReference)&&sha(e.editionSha256)&&obj(e.artifacts)&&Array.isArray(e.media),
    'INVALID_REVIEW_ONLY_EVIDENCE_CONTRACT');
  need(required.every(k=>exact(e.artifacts[k],['path','sha256'])),'MANDATORY_EVIDENCE_MISSING');
  const files={},paths=new Set();
  for(const k of required){
    need(!paths.has(e.artifacts[k].path),'ARTIFACT_PATH_REUSED');
    paths.add(e.artifacts[k].path);
    files[k]=artifact(root,e.artifacts[k]);
  }
  need(e.editionSha256===e.artifacts.edition.sha256,'EDITION_NOT_IMMUTABLY_PINNED');
  const edition=json(files.edition,'INVALID_NATIVE_EDITION');
  const learner=json(files.learner,'INVALID_LEARNER_PROJECTION');
  const bank=json(files.privateBank,'INVALID_PRIVATE_BANK');
  const policy=json(files.policy,'INVALID_POLICY');
  const map=json(files.crosswalk,'INVALID_QUESTION_CROSSWALK');
  const nav=json(files.navigation,'INVALID_NAVIGATION_PROOF');
  const fidelity=json(files.fidelity,'INVALID_FIDELITY_PROOF');
  need(edition.schema==='AIRTRUST_NATIVE_COURSE_V1'&&edition.courseId===e.courseId&&
    edition.packageVersion===e.packageVersion&&learner.courseId===e.courseId&&
    learner.packageVersion===e.packageVersion,'COURSE_OR_VERSION_DRIFT');
  need(Array.isArray(edition.assets)&&e.media.length===edition.assets.length&&
    new Set(e.media.map(x=>x.path)).size===e.media.length,'MEDIA_INVENTORY_INCOMPLETE');
  for(const m of e.media){
    need(exact(m,['path','sha256'])&&
      edition.assets.some(x=>x.path===m.path&&x.sha256===m.sha256),
      'MEDIA_SOURCE_OR_HASH_UNMAPPED');
    need(!paths.has(m.path),'ARTIFACT_PATH_REUSED');paths.add(m.path);
    const bytes=artifact(root,m);
    if(/\.(?:js|mjs|json|html?|css)$/i.test(m.path)){
      const text=bytes.toString('utf8');
      need(!/(answerKey|correctAnswers|correctOptionId|scenarioCorrect|feedbackCorrect|feedbackIncorrect|gabarito)\s*[=:]/i.test(text)&&
        !/[,{]\s*["'](?:answer|correct|ok)["']\s*:/i.test(text),
        'PRIVATE_GRADING_KEY_IN_LEARNER_ASSET');
    }
  }
  need(safeLearner(learner)&&ids(learner.questions),'LEARNER_KEY_OR_QUESTION_INTEGRITY');
  need(ids(bank.questions)&&map.schema==='AIRTRUST_PLAYER3_QUESTION_CROSSWALK_V1'&&
    Array.isArray(map.questions)&&map.questions.length===bank.questions.length&&
    map.questions.every(q=>id(q.sourceQuestionId)&&id(q.privateQuestionId)&&
      id(q.learnerQuestionId)&&id(q.stageId))&&
    same(map.questions.map(q=>q.privateQuestionId),bank.questions.map(q=>q.id))&&
    same(map.questions.map(q=>q.learnerQuestionId),learner.questions.map(q=>q.id))&&
    new Set(map.questions.map(q=>q.sourceQuestionId)).size===map.questions.length,
    'QUESTION_MAPPING_INCOMPLETE');
  need(policy.schema==='AIRTRUST_PLAYER3_GRADE_POLICY_V1'&&policy.courseId===e.courseId&&
    policy.editionSha256===e.editionSha256&&
    ['MODULE_CERTIFIED','FINAL_CERTIFIED','ATTENDANCE_ONLY'].includes(policy.mode)&&
    (policy.mode==='ATTENDANCE_ONLY'||(Number.isInteger(policy.masteryScore)&&
      policy.masteryScore>=0&&policy.masteryScore<=100&&typeof policy.moduleGate==='boolean')),
    'COMPLETION_AND_APPROVAL_POLICY_REQUIRED');
  need(nav.schema==='AIRTRUST_PLAYER3_NAVIGATION_INTERACTION_REVIEW_V1'&&
    nav.status==='PASS'&&Array.isArray(nav.checks)&&
    ['NAVIGATION','INTERACTIONS','REOPEN'].every(k=>nav.checks.some(c=>c.kind===k&&c.status==='PASS'))&&
    nav.checks.every(c=>c.status==='PASS'),'NAVIGATION_OR_INTERACTION_QA_MISSING');
  need(fidelity.schema==='AIRTRUST_PLAYER3_FIDELITY_REVIEW_V1'&&fidelity.status==='PASS'&&
    fidelity.sourceSha256===e.artifacts.source.sha256&&
    fidelity.editionSha256===e.editionSha256&&
    Array.isArray(fidelity.reviewedScreens)&&fidelity.reviewedScreens.length>0&&
    fidelity.reviewedScreens.every(id),'VISUAL_MEDIA_FIDELITY_MISSING');
  need(exact(e.humanReview,['visual','pedagogical'])&&
    ['visual','pedagogical'].every(k=>{const r=e.humanReview[k];return exact(r,['status','reviewerReference','evidenceSha256'])&&r.status==='APPROVED'&&
      id(r.reviewerReference)&&r.reviewerReference!==e.authorReference&&
      r.evidenceSha256===e.artifacts[k==='visual'?'fidelity':'crosswalk'].sha256;
    }),'HUMAN_PEDAGOGICAL_AND_VISUAL_REVIEW_REQUIRED');
  const a=json(document(root,approvalFile),'INVALID_SIGNATURE_DOCUMENT');
  need(exact(a,['kind','evidenceSha256','reviewerKeyId','reviewerReference','approvedAt','signature'])&&
    a.kind==='AIRTRUST_PLAYER3_NATIVE_QA_APPROVAL_ED25519_V1'&&
    a.evidenceSha256===hash(evidenceBytes)&&KEY.test(a.reviewerKeyId??'')&&
    id(a.reviewerReference)&&a.reviewerReference!==e.authorReference&&
    /^[A-Za-z0-9+/]{86}==$/.test(a.signature)&&
    Object.hasOwn(trustedReviewerKeys,a.reviewerKeyId),'INDEPENDENT_SIGNATURE_SCOPE_REQUIRED');
  const time=Date.parse(a.approvedAt);
  need(typeof a.approvedAt==='string'&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(a.approvedAt)&&
    Number.isFinite(time)&&time<=Date.now()+60000&&Date.now()-time<365*86400_000,
    'INDEPENDENT_APPROVAL_DATE_INVALID');
  const trusted=trustedReviewerKeys[a.reviewerKeyId];
  need(exact(trusted,['reviewerReference','role','publicKeyPem'])&&
    trusted.role==='INDEPENDENT_PEDAGOGICAL_REVIEWER'&&
    trusted.reviewerReference===a.reviewerReference&&
    Object.values(e.humanReview).every(r=>r.reviewerReference===a.reviewerReference),
    'INDEPENDENT_REVIEWER_NOT_TRUSTED');
  let ok=false;
  try{
    const key=createPublicKey(trusted.publicKeyPem),signature=Buffer.from(a.signature,'base64');
    const signed=[a.kind,a.evidenceSha256,a.reviewerKeyId,a.reviewerReference,a.approvedAt].join('\n');
    ok=key.asymmetricKeyType==='ed25519'&&signature.length===64&&
      verify(null,Buffer.from(signed),key,signature);
  }catch{ok=false;}
  need(ok,'INDEPENDENT_ED25519_SIGNATURE_INVALID');
  return Object.freeze({kind:'AIRTRUST_PLAYER3_NATIVE_QA_ELIGIBILITY_V1',
    status:'QA_ELIGIBLE_NOT_AUTHORIZED_TO_PUBLISH',courseId:e.courseId,
    packageVersion:e.packageVersion,sourceSha256:e.artifacts.source.sha256,
    editionSha256:e.editionSha256,evidenceSha256:a.evidenceSha256,
    approvalSignatureSha256:hash(Buffer.from(a.signature,'base64')),
    reviewerKeyId:a.reviewerKeyId,publicationPerformed:false,
    enrollmentChanged:false,certificationPerformed:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [rootDir,evidenceFile,approvalFile]=process.argv.slice(2);
    need(process.env.PLAYER3_TRUSTED_REVIEWER_PUBLIC_KEYS_JSON,
      'PROTECTED_TRUST_REGISTRY_REQUIRED');
    const trustedReviewerKeys=JSON.parse(process.env.PLAYER3_TRUSTED_REVIEWER_PUBLIC_KEYS_JSON);
    console.log(JSON.stringify(verifyNativeQaApproval({rootDir,evidenceFile,approvalFile,trustedReviewerKeys})));
  }catch(e){
    console.error(e instanceof NativeApprovalDenied?e.message:'PLAYER3_QA_APPROVAL_DENIED');
    process.exitCode=1;
  }
}