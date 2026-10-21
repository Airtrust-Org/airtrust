import {describe,expect,it} from 'vitest';
import {
  QUESTION_BANK_SCHEMA,EXAM_PLAN_SCHEMA,QuestionBankError,
  createQuestionDraft,editQuestionDraft,reviewQuestionDraft,
  publishReviewedQuestion,forkPublishedQuestion,verifyPublishedQuestion,
  learnerQuestion,validateExamPlan,gradeExternalExam,
  type QuestionContent,type QuestionRevision,type ExamPlan,
} from '../../lib/lms-exams/question-bank-domain';

const sha = 'a'.repeat(64);
const content: QuestionContent = {
  moduleId:'m1',topicId:'safety',sourceUnitId:'u1',sourceSha256:sha,
  prompt:'Qual procedimento reduz o risco operacional?',
  choices:[{id:'o1',text:'Inspecionar antes do voo'},{id:'o2',text:'Ignorar a lista'}],
  correctChoiceId:'o1',explanation:'A verificação reduz o risco.',
};
const scope={tenantId:999006,courseId:327,questionId:'q1'};
async function published(id='q1',moduleId='m1'){
  const draft=createQuestionDraft({...scope,questionId:id},{...content,moduleId},'author1');
  return publishReviewedQuestion(reviewQuestionDraft(draft,'reviewer2'),'approver3');
}
function plan(rows: readonly QuestionRevision[], pct=70): ExamPlan {
  return {
    schema:EXAM_PLAN_SCHEMA,tenantId:999006,courseId:327,
    examId:'exam1',version:1,trainingSourceSha256:sha,
    trainingEditionSha256:'b'.repeat(64),consultationAllowed:true,
    sections:[{moduleId:'m1',minScorePct:pct,questions:rows.map(q=>({
      questionId:q.questionId,revision:q.revision,contentSha256:q.contentSha256!,
    }))}],
  };
}
describe('Independent authorable bank and immutable published revisions',()=>{
  it('creates and edits DRAFT questions independently of any SCORM ZIP',()=>{
    const draft=createQuestionDraft(scope,content,'author1');
    expect(draft.schema).toBe(QUESTION_BANK_SCHEMA);
    const edited=editQuestionDraft(draft,{prompt:'Qual ação reduz risco imediato?'},'editor2');
    expect(edited.prompt).toContain('risco imediato');
    expect(draft.prompt).toContain('procedimento');
    expect(edited.revision).toBe(1);
    expect(()=>editQuestionDraft(draft,{tenantId:6} as never,'editor2'))
      .toThrow('INVALID_EDIT_REQUEST');
    expect(()=>editQuestionDraft(draft,{correctChoiceId:'forged'},'editor2'))
      .toThrow('INVALID_QUESTION_CONTENT');
  });
  it('requires an independent reviewer; disallows editing REVIEWED or PUBLISHED',async()=>{
    const draft=createQuestionDraft(scope,content,'author1');
    expect(()=>reviewQuestionDraft(draft,'author1'))
      .toThrow('INDEPENDENT_REVIEW_REQUIRED');
    const reviewed=reviewQuestionDraft(draft,'reviewer2');
    expect(()=>editQuestionDraft(reviewed,{prompt:'altered'},'author1'))
      .toThrow('REVISION_NOT_EDITABLE');
    expect(()=>await 1).not.toThrow();
    const frozen=await publishReviewedQuestion(reviewed,'approver3');
    expect(frozen.status).toBe('PUBLISHED');
    expect(await verifyPublishedQuestion(frozen)).toBe(true);
    expect(()=>editQuestionDraft(frozen,{prompt:'altered'},'admin4'))
      .toThrow('REVISION_NOT_EDITABLE');
    await expect(publishReviewedQuestion(draft,'approver3'))
      .rejects.toThrow('REVIEWED_REVISION_REQUIRED');
  });
  it('forks published version without rewriting previously recorded exam revision',async()=>{
    const old=await published();
    const next=forkPublishedQuestion(old,'editor4');
    const revised=editQuestionDraft(next,{prompt:'Revised future exam question'},'editor4');
    expect(next.revision).toBe(2);
    expect(revised.status).toBe('DRAFT');
    expect(old.revision).toBe(1);
    expect(old.prompt).toBe(content.prompt);
    expect(await verifyPublishedQuestion(old)).toBe(true);
    expect(()=>learnerQuestion(revised)).toThrow('QUESTION_NOT_PUBLISHED');
    expect(()=>forkPublishedQuestion(revised,'editor4'))
      .toThrow('PUBLISHED_REVISION_REQUIRED');
  });
  it('never leaks answer key, rationale or internal editor information to learner',async()=>{
    const view=learnerQuestion(await published());
    expect(Object.keys(view).sort()).toEqual([
      'choices','moduleId','prompt','questionId','revision',
    ]);
    expect(JSON.stringify(view)).not.toMatch(/correctChoiceId|explanation|author1|reviewer2/);
  });
  it('locks published bank by tenant, course, module, source and content SHA',async()=>{
    const q=await published();
    const approved=plan([q]);
    await expect(validateExamPlan(approved,[q])).resolves.toBeUndefined();
    await expect(validateExamPlan({...approved,tenantId:5},[q]))
      .rejects.toThrow('UNTRUSTED_EXAM_QUESTION_VERSION');
    await expect(validateExamPlan({...approved,trainingSourceSha256:'c'.repeat(64)},[q]))
      .rejects.toThrow('UNTRUSTED_EXAM_QUESTION_VERSION');
    await expect(validateExamPlan(approved,[{...q,prompt:'silent tamper'}]))
      .rejects.toThrow('UNTRUSTED_EXAM_QUESTION_VERSION');
    await expect(validateExamPlan(approved,[{...q,status:'DRAFT'}]))
      .rejects.toThrow(QuestionBankError);
  });
  it('grades server-side, 6/10 fails and 7/10 passes, no certificate is granted',async()=>{
    const bank=await Promise.all(Array.from({length:10},(_,i)=>published('q'+(i+1))));
    const p=plan(bank);
    const answers=(correct:number)=>bank.map((q,i)=>({
      questionId:q.questionId,choiceId:i<correct?'o1':'o2',
    }));
    const fail=await gradeExternalExam(p,bank,answers(6));
    const pass=await gradeExternalExam(p,bank,answers(7));
    expect(fail.sections[0]).toMatchObject({correct:6,total:10,scorePct:60,passed:false});
    expect(pass.sections[0]).toMatchObject({correct:7,total:10,scorePct:70,passed:true});
    expect(fail.passed).toBe(false);
    expect(pass.passed).toBe(true);
    expect(pass.grantsCompletion).toBe(false);
    expect(pass.grantsCertificate).toBe(false);
    await expect(gradeExternalExam(p,bank,answers(7).slice(1)))
      .rejects.toThrow('EXAM_ANSWERS_INCOMPLETE');
  });
  it('blocks one failing module from being hidden by another module pass',async()=>{
    const m1=await Promise.all(Array.from({length:10},(_,i)=>published('a'+i,'m1')));
    const m2=await Promise.all(Array.from({length:10},(_,i)=>published('b'+i,'m2')));
    const bank=[...m1,...m2];
    const first=plan(m1);
    const p={...first,sections:[
      first.sections[0],
      {moduleId:'m2',minScorePct:70,questions:m2.map(q=>({
        questionId:q.questionId,revision:q.revision,contentSha256:q.contentSha256!,
      }))},
    ]};
    const answers=bank.map((q,i)=>({
      questionId:q.questionId,choiceId:i<6?'o1':i<10?'o2':'o1',
    }));
    const scored=await gradeExternalExam(p,bank,answers);
    expect(scored.sections.map(x=>x.passed)).toEqual([false,true]);
    expect(scored.passed).toBe(false);
  });
});
