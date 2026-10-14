import { describe, expect, it } from 'vitest';
import {
  readiness, validatePolicy, gradeOfficialAttempt, checkPractice,
  Player3ValidationError,
  type Policy, type PrivateQuestion, type PersistedEnrollment,
} from '../../lib/lms-player3/engine';
const sha = 'a'.repeat(64);
const policy: Policy = {
  schema:'AIRTRUST_PLAYER3_POLICY_V1', courseId:'doutrinamento',
  editionSha256:sha, certificationMode:'MODULE_CERTIFIED', masteryScore:80,
  stages:[
    {id:'intro',type:'content',required:true},
    {id:'fix1',type:'practice',required:true},
    {id:'mod1',type:'module_exam',required:true},
    {id:'mod2',type:'module_exam',required:true},
  ],
};
const bank: PrivateQuestion[] = [
  {id:'p1',stageId:'fix1',options:['a','b'],correctOptionId:'b',
    feedbackCorrect:'Correto',feedbackIncorrect:'Revisar'},
  {id:'q1',stageId:'mod1',options:['a','b'],correctOptionId:'a',
    feedbackCorrect:'OK',feedbackIncorrect:'Nao'},
  {id:'q2',stageId:'mod2',options:['a','b'],correctOptionId:'a',
    feedbackCorrect:'OK',feedbackIncorrect:'Nao'},
];
const enroll:PersistedEnrollment = {
  enrollmentId:911,tenantId:9,cycleId:3,courseId:'doutrinamento',
  editionSha256:sha,status:'IN_PROGRESS',
  stages:[{id:'intro',result:'VIEWED'},{id:'fix1',result:'PRACTICED'}],
  exams:[
    {stageId:'mod1',editionSha256:sha,scorePct:100,passed:true},
    {stageId:'mod2',editionSha256:sha,scorePct:100,passed:true},
  ],
};
describe('Player 3 independent canonical learning domain', () => {
  it('supports module gates without inventing a final exam', () => {
    expect(readiness(policy,enroll)).toEqual({ready:true,code:'READY_FOR_CANONICAL_TRANSACTION'});
  });
  it('does not turn a visual 99% into completion', () => {
    expect(readiness(policy,{...enroll,stages:[]})).toMatchObject({
      ready:false,code:'CONTENT_EVIDENCE_MISSING',
    });
  });
  it('requires every mandatory certifying module', () => {
    expect(readiness(policy,{...enroll,exams:[enroll.exams[0]]}).code)
      .toBe('OFFICIAL_EXAM_NOT_PASSED');
  });
  it('rejects wrong edition/cycle and invalid ledger', () => {
    expect(readiness(policy,{...enroll,editionSha256:'b'.repeat(64)}).ready).toBe(false);
    expect(readiness(policy,{...enroll,cycleId:0}).ready).toBe(false);
    expect(readiness(policy,{...enroll,stages:[...enroll.stages,enroll.stages[0]]}).code)
      .toBe('INVALID_LEDGER');
  });
  it('grades only server private official module questions', () => {
    expect(gradeOfficialAttempt(policy,bank,'mod1',[{questionId:'q1',optionId:'a'}]))
      .toEqual({stageId:'mod1',correct:1,total:1,scorePct:100,passed:true});
  });
  it('does not accept client grade or a practice answer inside an exam', () => {
    expect(() => gradeOfficialAttempt(policy,bank,'mod1',[
      {questionId:'q1',optionId:'a',scorePct:100} as never,
    ])).toThrow(Player3ValidationError);
    expect(() => gradeOfficialAttempt(policy,bank,'mod1',[
      {questionId:'p1',optionId:'b'},
    ])).toThrow(Player3ValidationError);
  });
  it('returns formative feedback without certifying attempts', () => {
    expect(checkPractice(policy,bank,'fix1',{questionId:'p1',optionId:'a'}))
      .toEqual({correct:false,feedback:'Revisar'});
    expect(() => checkPractice(policy,bank,'mod1',{questionId:'q1',optionId:'a'}))
      .toThrow(Player3ValidationError);
  });
  it('rejects a fictitious final exam for a module-certified course', () => {
    expect(() => validatePolicy({...policy,certificationMode:'FINAL_CERTIFIED'}))
      .toThrow(Player3ValidationError);
  });
  it('does not complete an enrollment twice', () => {
    expect(readiness(policy,{...enroll,status:'COMPLETED'}).code)
      .toBe('ENROLLMENT_NOT_ACTIVE');
  });
  it('never approves a failing persisted module attempt', () => {
    expect(readiness(policy,{...enroll,exams:[
      enroll.exams[0],{...enroll.exams[1],passed:false},
    ]}).ready).toBe(false);
  });
  it('supports the separately configured final-exam mode', () => {
    const p:Policy={...policy,certificationMode:'FINAL_CERTIFIED',stages:[
      {id:'intro',type:'content',required:true},
      {id:'final',type:'final_exam',required:true},
    ]};
    expect(validatePolicy(p).certificationMode).toBe('FINAL_CERTIFIED');
    const e:PersistedEnrollment={...enroll,stages:[{id:'intro',result:'VIEWED'}],
      exams:[{stageId:'final',editionSha256:sha,scorePct:85,passed:true}]};
    expect(readiness(p,e).ready).toBe(true);
  });
});