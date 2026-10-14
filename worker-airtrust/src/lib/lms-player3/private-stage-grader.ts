/**
 * Player 3 private stage assessment grader.
 *
 * Takes only an immutable, Worker-private answer bank and a separately
 * approved/edition-pinned assessment policy. Never derives a pass from SCORM
 * lesson_status, completion_status, client scores or the HTML5 iframe.
 *
 * This pure function is not a persistence/qualification/certificate writer.
 */
export const PLAYER3_PRIVATE_BANK_SCHEMA = 'AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1' as const;
export const PLAYER3_GRADE_POLICY_SCHEMA = 'AIRTRUST_PLAYER3_GRADE_POLICY_V1' as const;

export type Player3PrivateQuestion = Readonly<{
  id:string;stageId:string;options:readonly string[];
  correctOptionId:string;
  feedbackCorrect:string;feedbackIncorrect:string;
}>;
export type Player3PrivateBank = Readonly<{
  schema:typeof PLAYER3_PRIVATE_BANK_SCHEMA;
  source_sha256:string;courseId:string;questions:readonly Player3PrivateQuestion[];
  PRIVATE_NEVER_SERVE_TO_BROWSER:true;
}>;
export type Player3StagePolicy = Readonly<{
  stageId:string;masteryScore:number;
  requiredQuestionIds:readonly string[];
}>;
export type Player3ApprovedPolicy = Readonly<{
  schema:typeof PLAYER3_GRADE_POLICY_SCHEMA;
  source_sha256:string;courseId:string;editionSha256:string;
  certificationApproved:true;
  stages:readonly Player3StagePolicy[];
}>;
export type Player3StageSubmission = Readonly<{
  stageId:string;answers:readonly Readonly<{questionId:string;optionId:string}>[];
}>;
export type Player3StageDecision = Readonly<{
  stageId:string;editionSha256:string;
  answered:number;total:number;correct:number;
  scorePct:number;stagePassed:boolean;
  serverGraded:true;grantsCompletion:false;grantsCertificate:false;
}>;
export class Player3GradeError extends Error {
  constructor(public readonly code:string){super(code);this.name='Player3GradeError';}
}
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const fail=(code:string):never=>{throw new Player3GradeError(code);};
const keys=(value:object,allowed:readonly string[])=>Object.keys(value).every(k=>allowed.includes(k));
const integer=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v);
function validId(v:unknown):v is string {return typeof v==='string'&&ID.test(v);}

/** Throws on ANY invalid scope/policy/bank so drafts cannot be graded as approved. */
export function gradePlayer3ApprovedStage(
  bank:Player3PrivateBank,
  policy:Player3ApprovedPolicy,
  submission:Player3StageSubmission,
):Player3StageDecision {
  if(!bank||!policy||!submission||typeof bank!=='object'||
      typeof policy!=='object'||typeof submission!=='object'||
      bank.schema!==PLAYER3_PRIVATE_BANK_SCHEMA ||
      bank.PRIVATE_NEVER_SERVE_TO_BROWSER!==true ||
      policy.schema!==PLAYER3_GRADE_POLICY_SCHEMA ||
      policy.certificationApproved!==true ||
      !SHA.test(bank.source_sha256)||!SHA.test(policy.source_sha256) ||
      !SHA.test(policy.editionSha256) ||
      bank.source_sha256!==policy.source_sha256 ||
      !validId(bank.courseId)||bank.courseId!==policy.courseId ||
      !validId(submission.stageId) ||
      !Array.isArray(bank.questions)||bank.questions.length<1 ||
      bank.questions.length>2000 ||
      !Array.isArray(policy.stages)||policy.stages.length<1||
      policy.stages.length>100 ||
      !Array.isArray(submission.answers)) fail('INVALID_SOURCE_OR_POLICY');
  const stages=new Map<string,Player3StagePolicy>();
  const requiredGlobal=new Set<string>();
  for(const stage of policy.stages) {
    if(!stage || !validId(stage.stageId)||stages.has(stage.stageId)||
        !integer(stage.masteryScore)||stage.masteryScore<1||stage.masteryScore>100||
        !Array.isArray(stage.requiredQuestionIds)||
        stage.requiredQuestionIds.length<1||stage.requiredQuestionIds.length>200||
        stage.requiredQuestionIds.some(q=>!validId(q)||requiredGlobal.has(q))) {
      fail('INVALID_STAGE_POLICY');
    }
    for(const q of stage.requiredQuestionIds)requiredGlobal.add(q);
    stages.set(stage.stageId,stage);
  }
  const exactStage=stages.get(submission.stageId);
  if(!exactStage){throw new Player3GradeError('UNKNOWN_STAGE');}
  const questions=new Map<string,Player3PrivateQuestion>();
  for(const q of bank.questions){
    if(!q || !validId(q.id)||!validId(q.stageId)||
       questions.has(q.id)||!stages.has(q.stageId)||
       !keys(q,['id','stageId','options','correctOptionId','feedbackCorrect','feedbackIncorrect'])||
       !Array.isArray(q.options)||q.options.length<2||q.options.length>16||
       q.options.some(v=>!validId(v))||
       new Set(q.options).size!==q.options.length ||
       !validId(q.correctOptionId)||!q.options.includes(q.correctOptionId)||
       typeof q.feedbackCorrect!=='string'||
       typeof q.feedbackIncorrect!=='string')fail('INVALID_PRIVATE_BANK');
    questions.set(q.id,q);
  }
  // No silent question drops or additional questions: the approved policy
  // must exhaustively cover the exact private bank, including every stage.
  if(questions.size!==requiredGlobal.size ||
    [...requiredGlobal].some(q=>!questions.has(q)))fail('BANK_POLICY_CROSSWALK_MISMATCH');
  for(const [stageId,entry] of stages) {
    if(entry.requiredQuestionIds.some(id=>questions.get(id)?.stageId!==stageId)) {
      fail('BANK_POLICY_CROSSWALK_MISMATCH');
    }
  }
  if(submission.answers.length!==exactStage.requiredQuestionIds.length ||
      submission.answers.length>200) fail('INCOMPLETE_STAGE');
  const selected=new Map<string,string>();
  const required=new Set(exactStage.requiredQuestionIds);
  for(const item of submission.answers) {
    if(!item||typeof item!=='object'||Array.isArray(item)||
       !keys(item,['questionId','optionId'])||
       !validId(item.questionId)||!validId(item.optionId)||
       !required.has(item.questionId)||selected.has(item.questionId)||
       !questions.get(item.questionId)?.options.includes(item.optionId)) {
      fail('INVALID_STAGE_ANSWER');
    }
    selected.set(item.questionId,item.optionId);
  }
  const total=required.size;
  const correct=[...required].filter(id=>
    questions.get(id)?.correctOptionId===selected.get(id)).length;
  const scorePct=Math.round(100*correct/total);
  // Compare integer products: rounding must not manufacture a passing score.
  const stagePassed=correct*100>=exactStage.masteryScore*total;
  return {
    stageId:exactStage.stageId,editionSha256:policy.editionSha256,
    answered:selected.size,total,correct,scorePct,stagePassed,
    serverGraded:true,grantsCompletion:false,grantsCertificate:false,
  };
}
