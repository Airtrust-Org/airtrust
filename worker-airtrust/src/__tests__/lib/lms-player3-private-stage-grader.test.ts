import {describe,expect,it} from 'vitest';
import {gradePlayer3ApprovedStage,type Player3PrivateBank,type Player3ApprovedPolicy}
  from '../../lib/lms-player3/private-stage-grader';
const a='a'.repeat(64),b='b'.repeat(64);
const bank:Player3PrivateBank={
  schema:'AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1',
  source_sha256:a,courseId:'training',PRIVATE_NEVER_SERVE_TO_BROWSER:true,
  questions:[
    {id:'q1',stageId:'m1',options:['o0','o1'],correctOptionId:'o1',feedbackCorrect:'ok',feedbackIncorrect:'revise'},
    {id:'q2',stageId:'m1',options:['o0','o1'],correctOptionId:'o0',feedbackCorrect:'ok',feedbackIncorrect:'revise'},
    {id:'q3',stageId:'m2',options:['o0','o1'],correctOptionId:'o1',feedbackCorrect:'ok',feedbackIncorrect:'revise'}
  ],
};
const policy:Player3ApprovedPolicy={
  schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',source_sha256:a,courseId:'training',
  editionSha256:b,certificationApproved:true,
  stages:[{stageId:'m1',masteryScore:70,requiredQuestionIds:['q1','q2']},
          {stageId:'m2',masteryScore:70,requiredQuestionIds:['q3']}],
};
const grade=(answers:{questionId:string;optionId:string}[],stageId='m1')=>
  gradePlayer3ApprovedStage(bank,policy,{stageId,answers});
describe('Player3 approved bank stage grader',()=>{
 it('scores only required module and never awards enrollment completion',()=>{
  expect(grade([{questionId:'q1',optionId:'o1'},{questionId:'q2',optionId:'o0'}]))
    .toMatchObject({stageId:'m1',scorePct:100,stagePassed:true,
      grantsCompletion:false,grantsCertificate:false});
 });
 it('rejects incomplete and duplicate answers',()=>{
  expect(()=>grade([{questionId:'q1',optionId:'o1'}])).toThrow('INCOMPLETE_STAGE');
  expect(()=>grade([{questionId:'q1',optionId:'o1'},{questionId:'q1',optionId:'o1'}]))
    .toThrow('INVALID_STAGE_ANSWER');
 });
 it('does not grant a module if its passing threshold was not met',()=>{
  expect(grade([{questionId:'q1',optionId:'o0'},{questionId:'q2',optionId:'o0'}]))
    .toMatchObject({scorePct:50,stagePassed:false});
 });
 it('requires approved source and exact edition identity',()=>{
  expect(()=>gradePlayer3ApprovedStage(bank,{...policy,certificationApproved:false} as never,
    {stageId:'m1',answers:[]})).toThrow('INVALID_SOURCE_OR_POLICY');
  expect(()=>gradePlayer3ApprovedStage(bank,{...policy,source_sha256:'c'.repeat(64)},
    {stageId:'m1',answers:[]})).toThrow('INVALID_SOURCE_OR_POLICY');
 });
 it('rejects cross-module answers and incomplete mapping',()=>{
  expect(()=>grade([{questionId:'q1',optionId:'o1'},{questionId:'q3',optionId:'o1'}]))
    .toThrow('INVALID_STAGE_ANSWER');
  expect(()=>gradePlayer3ApprovedStage(bank,{...policy,stages:[policy.stages[0]]},
    {stageId:'m1',answers:[{questionId:'q1',optionId:'o1'},
      {questionId:'q2',optionId:'o0'}]})).toThrow('INVALID_PRIVATE_BANK');
 });
 it('grades two independent ten-question V7 modules at exactly 7/10 without certifying',()=>{
  const questions=Array.from({length:20},(_,i)=>({
    id:'v7q'+(i+1),stageId:i<10?'avaliacao-modulo-01':'avaliacao-final',
    options:['o0','o1'],correctOptionId:'o1',
    feedbackCorrect:'ok',feedbackIncorrect:'revise',
  }));
  const stagedBank:Player3PrivateBank={...bank,questions};
  const stages=['avaliacao-modulo-01','avaliacao-final'];
  const stagedPolicy:Player3ApprovedPolicy={...policy,stages:stages.map((stageId,index)=>({
    stageId,masteryScore:70,
    requiredQuestionIds:questions.slice(index*10,index*10+10).map(q=>q.id),
  }))};
  const attempt=(stage:number,correct:number)=>{
    const answers=questions.slice(stage*10,stage*10+10).map((q,index)=>({
      questionId:q.id,optionId:index<correct?'o1':'o0',
    }));
    return gradePlayer3ApprovedStage(stagedBank,stagedPolicy,{
      stageId:stages[stage],answers,
    });
  };
  for(const stage of [0,1]){
    expect(attempt(stage,6)).toMatchObject({
      total:10,correct:6,scorePct:60,stagePassed:false,
      grantsCompletion:false,grantsCertificate:false,
    });
    expect(attempt(stage,7)).toMatchObject({
      total:10,correct:7,scorePct:70,stagePassed:true,
      grantsCompletion:false,grantsCertificate:false,
    });
    expect(attempt(stage,10)).toMatchObject({scorePct:100,stagePassed:true});
  }
  // Even a perfect module-1 submission cannot substitute for module 2.
  const firstAnswers=questions.slice(0,10).map(q=>({questionId:q.id,optionId:'o1'}));
  expect(()=>gradePlayer3ApprovedStage(stagedBank,stagedPolicy,{
    stageId:stages[1],answers:firstAnswers,
  })).toThrow('INVALID_STAGE_ANSWER');
 });
 it('passes stage two independently without issuing a certificate',()=>{
  expect(grade([{questionId:'q3',optionId:'o1'}],'m2'))
    .toMatchObject({stagePassed:true,total:1,grantsCertificate:false});
 });
});
