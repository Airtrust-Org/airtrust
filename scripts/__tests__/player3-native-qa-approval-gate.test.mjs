import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyNativeQaApproval} from '../ci/player3-native-qa-approval-gate.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function make(){
 const rootDir=mkdtempSync(join(tmpdir(),'airtrust-f5-synthetic-'));
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const trustedReviewerKeys={'synthetic-reviewer-key-01':{
  reviewerReference:'reviewer-01',role:'INDEPENDENT_PEDAGOGICAL_REVIEWER',
  publicKeyPem:publicKey.export({type:'spki',format:'pem'})}};
 const file=(path,data)=>{const dest=join(rootDir,path);
  writeFileSync(dest,typeof data==='string'?data:JSON.stringify(data));
  return {path,sha256:hash(readFileSync(dest))};};
 const source=file('synthetic-original.zip','SYNTHETIC ONLY, NOT A REAL COURSE');
 const media=file('image.png','SYNTHETIC PICTURE');
 const edition=file('edition.json',{schema:'AIRTRUST_NATIVE_COURSE_V1',
  courseId:'synthetic-qa-course',packageVersion:'synthetic-v1',assets:[media]});
 const learner=file('learner.json',{courseId:'synthetic-qa-course',
  packageVersion:'synthetic-v1',questions:[{id:'learner-q-1',prompt:'A question?'}]});
 const privateBank=file('bank.json',{questions:[{id:'private-q-1',correctOptionId:'secret'}]});
 const policy=file('policy.json',{schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',
  courseId:'synthetic-qa-course',editionSha256:edition.sha256,
  mode:'MODULE_CERTIFIED',masteryScore:75,moduleGate:true});
 const crosswalk=file('crosswalk.json',{schema:'AIRTRUST_PLAYER3_QUESTION_CROSSWALK_V1',
  questions:[{sourceQuestionId:'source-q-1',privateQuestionId:'private-q-1',
   learnerQuestionId:'learner-q-1',stageId:'stage-1'}]});
 const navigation=file('navigation.json',{
  schema:'AIRTRUST_PLAYER3_NAVIGATION_INTERACTION_REVIEW_V1',status:'PASS',
  checks:['NAVIGATION','INTERACTIONS','REOPEN'].map(kind=>({kind,status:'PASS'}))});
 const fidelity=file('fidelity.json',{schema:'AIRTRUST_PLAYER3_FIDELITY_REVIEW_V1',
  status:'PASS',sourceSha256:source.sha256,editionSha256:edition.sha256,
  reviewedScreens:['synthetic-cover']});
 const evidence={schema:'AIRTRUST_PLAYER3_NATIVE_QA_APPROVAL_EVIDENCE_V1',
  status:'REVIEW_ONLY_NEVER_DEPLOY',publicationPerformed:false,
  courseId:'synthetic-qa-course',packageVersion:'synthetic-v1',
  authorReference:'synthetic-author-01',editionSha256:edition.sha256,
  artifacts:{source,edition,learner,privateBank,policy,crosswalk,navigation,fidelity},
  media:[media],humanReview:{
   visual:{status:'APPROVED',reviewerReference:'reviewer-01',evidenceSha256:fidelity.sha256},
   pedagogical:{status:'APPROVED',reviewerReference:'reviewer-01',evidenceSha256:crosswalk.sha256}}};
 function signEvidence(){
  writeFileSync(join(rootDir,'evidence.json'),JSON.stringify(evidence));
  const approval={kind:'AIRTRUST_PLAYER3_NATIVE_QA_APPROVAL_ED25519_V1',
   evidenceSha256:hash(readFileSync(join(rootDir,'evidence.json'))),
   reviewerKeyId:'synthetic-reviewer-key-01',reviewerReference:'reviewer-01',
   approvedAt:new Date().toISOString()};
  const message=[approval.kind,approval.evidenceSha256,approval.reviewerKeyId,
   approval.reviewerReference,approval.approvedAt].join('\n');
  writeFileSync(join(rootDir,'approval.json'),JSON.stringify({...approval,
   signature:sign(null,Buffer.from(message),privateKey).toString('base64')}));
 }
 signEvidence();
 return {rootDir,evidence,file,signEvidence,
  verify:()=>verifyNativeQaApproval({rootDir,evidenceFile:'evidence.json',
   approvalFile:'approval.json',trustedReviewerKeys}),
  close:()=>rmSync(rootDir,{force:true,recursive:true})};
}
function negative(label,change,code){
 test(label,()=>{
  const f=make();
  try{change(f);assert.throws(f.verify,new RegExp('PLAYER3_QA_APPROVAL_'+code));}
  finally{f.close();}
 });
}
test('synthetic fully signed approval only permits entry to QA, never publishing',()=>{
 const f=make();
 try{
  const r=f.verify();
  assert.equal(r.status,'QA_ELIGIBLE_NOT_AUTHORIZED_TO_PUBLISH');
  assert.equal(r.publicationPerformed,false);
  assert.equal(r.enrollmentChanged,false);
  assert.equal(r.certificationPerformed,false);
  assert.equal(r.editionSha256,f.evidence.editionSha256);
  assert.ok(!JSON.stringify(r).includes('secret'));
 }finally{f.close();}
});
negative('source hash drift fails',f=>{
 writeFileSync(join(f.rootDir,'synthetic-original.zip'),'altered');
},'ARTIFACT_HASH_MISMATCH');
negative('missing media fails',f=>unlinkSync(join(f.rootDir,'image.png')),'ARTIFACT_MISSING');
negative('learner projection leaking gabarito fails despite renewed signature',f=>{
 f.evidence.artifacts.learner=f.file('learner.json',{courseId:'synthetic-qa-course',
  packageVersion:'synthetic-v1',questions:[{id:'learner-q-1',correctOptionId:'secret'}]});
 f.signEvidence();
},'LEARNER_KEY_OR_QUESTION_INTEGRITY');
negative('missing approval policy fails',f=>{
 delete f.evidence.artifacts.policy;f.signEvidence();
},'MANDATORY_EVIDENCE_MISSING');
negative('wrong immutable edition fails',f=>{
 f.evidence.editionSha256='f'.repeat(64);f.signEvidence();
},'EDITION_NOT_IMMUTABLY_PINNED');
negative('unsigned approval document fails',f=>{
 const path=join(f.rootDir,'approval.json'),a=JSON.parse(readFileSync(path));
 delete a.signature;writeFileSync(path,JSON.stringify(a));
},'INDEPENDENT_SIGNATURE_SCOPE_REQUIRED');
negative('forged Ed25519 signature fails',f=>{
 const path=join(f.rootDir,'approval.json'),a=JSON.parse(readFileSync(path));
 a.signature=Buffer.alloc(64).toString('base64');writeFileSync(path,JSON.stringify(a));
},'INDEPENDENT_ED25519_SIGNATURE_INVALID');
negative('unapproved visual review fails even if signed',f=>{
 f.evidence.humanReview.visual.status='REJECTED';f.signEvidence();
},'HUMAN_PEDAGOGICAL_AND_VISUAL_REVIEW_REQUIRED');
negative('navigation integrity missing fails',f=>{
 f.evidence.artifacts.navigation=f.file('navigation.json',{
  schema:'AIRTRUST_PLAYER3_NAVIGATION_INTERACTION_REVIEW_V1',status:'PASS',
  checks:[{kind:'NAVIGATION',status:'PASS'}]});
 f.signEvidence();
},'NAVIGATION_OR_INTERACTION_QA_MISSING');
negative('unmapped private questions fail',f=>{
 f.evidence.artifacts.crosswalk=f.file('crosswalk.json',{
  schema:'AIRTRUST_PLAYER3_QUESTION_CROSSWALK_V1',questions:[]});
 f.evidence.humanReview.pedagogical.evidenceSha256=f.evidence.artifacts.crosswalk.sha256;
 f.signEvidence();
},'QUESTION_MAPPING_INCOMPLETE');
negative('evidence tampered after signature fails',f=>{
 f.evidence.authorReference='some-other-author';
 writeFileSync(join(f.rootDir,'evidence.json'),JSON.stringify(f.evidence));
},'INDEPENDENT_SIGNATURE_SCOPE_REQUIRED');
negative('incomplete certification mastery policy fails',f=>{
 f.evidence.artifacts.policy=f.file('policy.json',{
  schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',courseId:'synthetic-qa-course',
  editionSha256:f.evidence.editionSha256,mode:'FINAL_CERTIFIED'});
 f.signEvidence();
},'COMPLETION_AND_APPROVAL_POLICY_REQUIRED');
negative('author and reviewer cannot be the same',f=>{
 f.evidence.authorReference='reviewer-01';f.signEvidence();
},'HUMAN_PEDAGOGICAL_AND_VISUAL_REVIEW_REQUIRED');
negative('missing approval signature file fails',f=>{
 unlinkSync(join(f.rootDir,'approval.json'));
},'DOCUMENT_MISSING');
negative('unsanitized JavaScript with answer key fails',f=>{
 const media=f.file('runtime.js','const answerKey = {q: 1};');
 const edition=f.file('edition.json',{schema:'AIRTRUST_NATIVE_COURSE_V1',
  courseId:'synthetic-qa-course',packageVersion:'synthetic-v1',assets:[media]});
 f.evidence.media=[media];f.evidence.artifacts.edition=edition;f.evidence.editionSha256=edition.sha256;
 f.evidence.artifacts.policy=f.file('policy.json',{
  schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',courseId:'synthetic-qa-course',
  editionSha256:edition.sha256,mode:'MODULE_CERTIFIED',masteryScore:75,moduleGate:true});
 f.evidence.artifacts.fidelity=f.file('fidelity.json',{
  schema:'AIRTRUST_PLAYER3_FIDELITY_REVIEW_V1',status:'PASS',
  sourceSha256:f.evidence.artifacts.source.sha256,
  editionSha256:edition.sha256,reviewedScreens:['synthetic-cover']});
 f.evidence.humanReview.visual.evidenceSha256=f.evidence.artifacts.fidelity.sha256;
 f.signEvidence();
},'PRIVATE_GRADING_KEY_IN_LEARNER_ASSET');
negative('media inventory omission fails',f=>{
 f.evidence.media=[];f.signEvidence();
},'MEDIA_INVENTORY_INCOMPLETE');
negative('path traversal fails',f=>{
 f.evidence.artifacts.source.path='../secret.txt';f.signEvidence();
},'UNSAFE_EVIDENCE_PATH');