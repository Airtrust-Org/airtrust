import {describe,expect,it} from 'vitest';
import {assessScoreF5StudyEvidence,type ScoreF5StudyEvidenceInput} from '../../services/lms-score-f5-study-evidence';
const edition='AIRTRUST-SCORE-F5-EXTERNAL-20261021-V4_17-cca677fb0bde-A11Y-RM1';
const ids=Array.from({length:16},(_,i)=>'nr20_'+String(i+1).padStart(2,'0'));
const required=[2,7,11,14]; // synthetic test positions (package-private authoring config).
const make=(d:number[],f:number[],study:boolean,rev=edition,status='incomplete')=>
 JSON.stringify({'cmi.core.lesson_location':'16/16','cmi.core.lesson_status':status,
  'cmi.suspend_data':JSON.stringify({v:1,p:rev,c:15,a:15,d,f,study})});
const base:ScoreF5StudyEvidenceInput={
 cmiJson:make(Array.from({length:16},(_,i)=>i),required,true),
 expectedEdition:edition,requiredSlideIds:ids,requiredFormativeIndices:required,
 serverValidatedFinish:true,activePackageAndCycleVerified:true,
};
describe('Score F5 study evidence is not a certificate',()=>{
 it('requires a server-verified finish and an exact edition',()=>{
   const result=assessScoreF5StudyEvidence(base);
   expect(result).toMatchObject({code:'STUDY_READY_FOR_SERVER_RECEIPT',
     studyReady:true,completesEnrollment:false,grantsQualification:false});
 });
 it('last page alone never completes study',()=>{
   expect(assessScoreF5StudyEvidence({...base,cmiJson:make([15],required,true)}))
     .toMatchObject({code:'REQUIRED_UNITS_MISSING',studyReady:false});
 });
 it('rejects a missing formative decision',()=>{
   expect(assessScoreF5StudyEvidence({...base,cmiJson:make(
     Array.from({length:16},(_,i)=>i),[2,7,11],true)}))
     .toMatchObject({code:'FORMATIVE_INTERACTIONS_MISSING'});
 });
 it('rejects an untrusted finish or different cycle package',()=>{
   expect(assessScoreF5StudyEvidence({...base,serverValidatedFinish:false}))
     .toMatchObject({code:'FINISH_NOT_ATTESTED'});
   expect(assessScoreF5StudyEvidence({...base,activePackageAndCycleVerified:false}))
     .toMatchObject({code:'EDITION_UNVERIFIED'});
 });
 it('does not credit an old edition even with full positions',()=>{
   expect(assessScoreF5StudyEvidence({...base,cmiJson:make(
     Array.from({length:16},(_,i)=>i),required,true,'older-edition')}))
     .toMatchObject({code:'STATE_EDITION_MISMATCH'});
 });
 it('needs intentional study ending, not just all page visits',()=>{
   expect(assessScoreF5StudyEvidence({...base,cmiJson:make(
     Array.from({length:16},(_,i)=>i),required,false)}))
     .toMatchObject({code:'STUDY_END_MISSING'});
 });
 it('SCORM passed alone is not valid Score F5 study evidence',()=>{
   expect(assessScoreF5StudyEvidence({...base,cmiJson:make(
     Array.from({length:16},(_,i)=>i),required,true,edition,'passed')}))
     .toMatchObject({code:'STUDY_END_MISSING'});
 });
 it('rejects duplicate visited indices and invalid course manifests',()=>{
   expect(assessScoreF5StudyEvidence({...base,cmiJson:make(
     [...Array.from({length:16},(_,i)=>i),15],required,true)}))
     .toMatchObject({code:'REQUIRED_UNITS_MISSING'});
   expect(assessScoreF5StudyEvidence({...base,requiredSlideIds:['x','x']}))
     .toMatchObject({code:'INVALID_MANIFEST'});
 });
});
