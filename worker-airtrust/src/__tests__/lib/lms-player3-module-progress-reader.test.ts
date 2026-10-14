import {describe,it,expect,vi,beforeEach} from 'vitest';
import {loadApprovedPlayer3StageContext} from '../../services/lms-player3-module-attempt-writer';
import {readPlayer3ModuleSession} from '../../services/lms-player3-module-progress-reader';
import type {Env} from '../../types';

vi.mock('../../services/lms-player3-module-attempt-writer',()=>({
  loadApprovedPlayer3StageContext:vi.fn(),
  Player3StageWriteError:class Player3StageWriteError extends Error {
    constructor(public readonly code:string){super(code);}
  },
}));
const edition='a'.repeat(64),source='b'.repeat(64);
const policy={
  schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',
  source_sha256:source,courseId:'training',editionSha256:edition,
  certificationApproved:true,
  stages:[
    {stageId:'module1',masteryScore:70,requiredQuestionIds:['q1','q2']},
    {stageId:'module2',masteryScore:70,requiredQuestionIds:['q3']},
  ],
};
const bank={
  schema:'AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1',
  source_sha256:source,courseId:'training',PRIVATE_NEVER_SERVE_TO_BROWSER:true,
  questions:[
    {id:'q1',stageId:'module1',options:['o0','o1'],correctOptionId:'o1',feedbackCorrect:'SECRET',feedbackIncorrect:'SECRET'},
    {id:'q2',stageId:'module1',options:['o0','o1'],correctOptionId:'o0',feedbackCorrect:'SECRET',feedbackIncorrect:'SECRET'},
    {id:'q3',stageId:'module2',options:['o0','o1'],correctOptionId:'o1',feedbackCorrect:'SECRET',feedbackIncorrect:'SECRET'},
  ],
};
async function row(stage:string,num:number,answers:{questionId:string;optionId:string}[],score:number,pass:number){
  const json=JSON.stringify(answers);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json));
  const sha=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  return {politica_id:301,etapa_id:stage,tentativa_numero:num,
    event_id:'event-'+stage+'-'+num,answers_json:json,answers_sha256:sha,
    score_pct:score,passed:pass};
}
const correct1=[
  {questionId:'q1',optionId:'o1'},{questionId:'q2',optionId:'o0'},
];
const wrong1=[
  {questionId:'q1',optionId:'o0'},{questionId:'q2',optionId:'o0'},
];
function read(rows:unknown[]){
  const db={prepare:vi.fn(()=>({bind:vi.fn(()=>({
    all:vi.fn(async()=>({results:rows})),
  }))}))};
  return readPlayer3ModuleSession({env:{} as Env,db:db as unknown as D1Database,
    bucket:{} as R2Bucket,empresaId:6,matriculaId:911,actorUserId:31});
}
beforeEach(()=>{
  vi.mocked(loadApprovedPlayer3StageContext).mockReset();
  vi.mocked(loadApprovedPlayer3StageContext).mockResolvedValue({
    binding:{vinculo_id:200,politica_id:301,source_sha256:source},
    course:{editionHash:edition,cicloId:1000,mode:'LEARN'},
    bank,policy,
  } as never);
});
describe('Player3 authenticated modular resumed session',()=>{
  it('shows no pass before any attempt, with independent next attempt numbers',async()=>{
    const s=await read([]);
    expect(s).toMatchObject({allOfficialStagesPassed:false,completionSupported:false,
      stages:[
        {stageId:'module1',attempts:0,passed:false,nextAttemptNumber:1,lastScorePct:null},
        {stageId:'module2',attempts:0,passed:false,nextAttemptNumber:1,lastScorePct:null},
      ],
    });
  });
  it('retains an earlier module pass after a later failed repeat',async()=>{
    const s=await read([
      await row('module1',1,correct1,100,1),
      await row('module1',2,wrong1,50,0),
      await row('module2',1,[{questionId:'q3',optionId:'o1'}],100,1),
    ]);
    expect(s).toMatchObject({editionSha256:edition,cycleId:1000,
      allOfficialStagesPassed:true,completionSupported:false,
      stages:[
        {stageId:'module1',attempts:2,lastScorePct:50,passed:true,nextAttemptNumber:3},
        {stageId:'module2',attempts:1,lastScorePct:100,passed:true,nextAttemptNumber:2},
      ],
    });
    expect(JSON.stringify(s)).not.toContain('SECRET');
    expect(JSON.stringify(s)).not.toContain('correctOptionId');
    expect(JSON.stringify(s)).not.toContain('optionId');
  });
  it('rejects stored grades that cannot be reproduced from private answers',async()=>{
    await expect(read([await row('module1',1,wrong1,100,1)]))
      .rejects.toMatchObject({code:'STAGE_SESSION_GRADE_INCONSISTENT'});
  });
  it('rejects corruption in stored answer SHA and cross-policy attempts',async()=>{
    const valid=await row('module1',1,correct1,100,1);
    await expect(read([{...valid,answers_sha256:'x'.repeat(64)}]))
      .rejects.toMatchObject({code:'STAGE_SESSION_LEDGER_INVALID'});
    await expect(read([{...valid,politica_id:777}]))
      .rejects.toMatchObject({code:'STAGE_SESSION_LEDGER_INVALID'});
  });
  it('rejects unknown stages, oversized receipts and malformed JSON',async()=>{
    const valid=await row('module1',1,correct1,100,1);
    await expect(read([{...valid,etapa_id:'unknown'}]))
      .rejects.toMatchObject({code:'STAGE_SESSION_LEDGER_INVALID'});
    await expect(read(Array(201).fill(valid)))
      .rejects.toMatchObject({code:'STAGE_SESSION_LEDGER_INVALID'});
    await expect(read([{...valid,answers_json:'invalid'}]))
      .rejects.toMatchObject({code:'STAGE_SESSION_LEDGER_INVALID'});
  });
});
