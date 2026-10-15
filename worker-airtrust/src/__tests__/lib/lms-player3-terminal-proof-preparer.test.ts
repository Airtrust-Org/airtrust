import {beforeEach,describe,expect,it,vi} from 'vitest';
import {loadApprovedPlayer3StageContext}
  from '../../services/lms-player3-module-attempt-writer';
import {preparePlayer3VerifiedPassProofs}
  from '../../services/lms-player3-terminal-proof-preparer';
import type {Env} from '../../types';

vi.mock('../../services/lms-player3-module-attempt-writer',()=>({
  loadApprovedPlayer3StageContext:vi.fn(),
  Player3StageWriteError:class Player3StageWriteError extends Error{
    constructor(public readonly code:string){super(code);}
  },
}));
const SHA='a'.repeat(64),SOURCE='b'.repeat(64);
const policy={
  schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',
  source_sha256:SOURCE,courseId:'training',editionSha256:SHA,
  certificationApproved:true,
  stages:[{stageId:'mod1',masteryScore:70,requiredQuestionIds:['q1','q2']},
    {stageId:'mod2',masteryScore:70,requiredQuestionIds:['q3']}],
};
const bank={
  schema:'AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1',
  source_sha256:SOURCE,courseId:'training',PRIVATE_NEVER_SERVE_TO_BROWSER:true,
  questions:[
    {id:'q1',stageId:'mod1',options:['o0','o1'],correctOptionId:'o1',feedbackCorrect:'PRIVATE',feedbackIncorrect:'PRIVATE'},
    {id:'q2',stageId:'mod1',options:['o0','o1'],correctOptionId:'o0',feedbackCorrect:'PRIVATE',feedbackIncorrect:'PRIVATE'},
    {id:'q3',stageId:'mod2',options:['o0','o1'],correctOptionId:'o1',feedbackCorrect:'PRIVATE',feedbackIncorrect:'PRIVATE'},
  ],
};
const args={
  env:{} as Env,db:{} as D1Database,bucket:{} as R2Bucket,
  actorUserId:31,empresaId:6,matriculaId:911,
};
const hashed=async(s:string)=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
};
async function row(id:number,stage:string,answers:{questionId:string;optionId:string}[],score=100){
  const json=JSON.stringify(answers);
  return{
    id,politica_id:301,etapa_id:stage,
    tentativa_numero:1,event_id:'event-'+id,
    answers_json:json,answers_sha256:await hashed(json),
    score_pct:score,passed:1,
  };
}
const good=async()=>[
  await row(42,'mod1',[{questionId:'q1',optionId:'o1'},{questionId:'q2',optionId:'o0'}]),
  await row(43,'mod2',[{questionId:'q3',optionId:'o1'}]),
];
function read(rows:unknown[],success=true){
  const sqls:string[]=[];
  const db={
    prepare:vi.fn((sql:string)=>{
      sqls.push(sql);
      return {bind:vi.fn((...bindings:unknown[])=>({
        all:vi.fn(async()=>{
          expect(bindings).toEqual([200,301]);
          return {success,results:rows};
        }),
      }))};
    }),
  };
  return{invoke:()=>preparePlayer3VerifiedPassProofs({...args,db:db as unknown as D1Database}),sqls};
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(loadApprovedPlayer3StageContext).mockResolvedValue({
    course:{editionHash:SHA,cicloId:1000,cursoId:80,mode:'LEARN'},
    binding:{vinculo_id:200,politica_id:301,source_sha256:SOURCE,
      policy_sha256:'c'.repeat(64),bank_sha256:'d'.repeat(64)},
    policy,bank,
  } as never);
});
describe('Worker-only Player3 terminal proof preparation',()=>{
  it('loads every approved stage with its database attempt ID, hash and score',async()=>{
    const fixture=read(await good());
    const result=await fixture.invoke();
    expect(result.officialStages).toEqual([
      {stageId:'mod1',attemptId:42,attemptNumber:1,
        answersHash:expect.stringMatching(/^[a-f0-9]{64}$/),scorePct:100},
      {stageId:'mod2',attemptId:43,attemptNumber:1,
        answersHash:expect.stringMatching(/^[a-f0-9]{64}$/),scorePct:100},
    ]);
    expect(fixture.sqls[0]).toContain('MIN(a.tentativa_numero)');
    expect(JSON.stringify(result.officialStages)).not.toMatch(/PRIVATE|correctOptionId|optionId/);
  });
  it('refuses certification on a D1 error even if plausible passed rows were returned',async()=>{
    await expect(read(await good(),false).invoke()).rejects
      .toMatchObject({code:'PLAYER3_TERMINAL_PROOFS_READ_FAILED'});
  });
  it('refuses certification when even one required stage is absent',async()=>{
    const rows=await good();
    await expect(read([rows[0]]).invoke()).rejects
      .toMatchObject({code:'PLAYER3_TERMINAL_OFFICIAL_PROOFS_MISSING'});
  });
  it('rejects tampered answer hash, grade or undeclared stage',async()=>{
    const rows=await good();
    for(const invalid of [
      [{...rows[0],answers_sha256:'e'.repeat(64)},rows[1]],
      [{...rows[0],score_pct:50},rows[1]],
      [{...rows[0],etapa_id:'alien'},rows[1]],
      [{...rows[0],id:0},rows[1]],
      [rows[0],rows[0]],
    ])await expect(read(invalid).invoke()).rejects.toHaveProperty('code');
  });
  it('cannot use unapproved policies or stale private keys',async()=>{
    const rows=await good();
    vi.mocked(loadApprovedPlayer3StageContext).mockResolvedValueOnce({
      course:{editionHash:SHA,cicloId:1000,cursoId:80,mode:'LEARN'},
      binding:{vinculo_id:200,politica_id:301,source_sha256:SOURCE,
        policy_sha256:'c'.repeat(64),bank_sha256:'d'.repeat(64)},
      policy:{...policy,certificationApproved:false},bank,
    } as never);
    await expect(read(rows).invoke()).rejects
      .toMatchObject({code:'PLAYER3_TERMINAL_POLICY_NOT_APPROVED'});
  });
});
