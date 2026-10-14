import {describe,it,expect,vi,beforeEach} from 'vitest';
import {loadNativePrivateCourse} from '../../services/lms-native-content-loader';
import {
  commitPlayer3StageAttempt,canWritePlayer3Stage,Player3StageWriteError,
} from '../../services/lms-player3-module-attempt-writer';
import type {Env} from '../../types';

vi.mock('../../services/lms-native-content-loader',()=>({
  loadNativePrivateCourse:vi.fn(),
}));
const EDITION='a'.repeat(64),SOURCE='b'.repeat(64);
const prefix='lms/native/6/10/'+EDITION+'/';
const policy={
  schema:'AIRTRUST_PLAYER3_GRADE_POLICY_V1',source_sha256:SOURCE,
  courseId:'doutrinamento',editionSha256:EDITION,certificationApproved:true,
  stages:[
    {stageId:'m1',masteryScore:70,requiredQuestionIds:['q1','q2']},
    {stageId:'m2',masteryScore:70,requiredQuestionIds:['q3']},
  ],
};
const bank={
  schema:'AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1',source_sha256:SOURCE,
  courseId:'doutrinamento',PRIVATE_NEVER_SERVE_TO_BROWSER:true,
  questions:[
    {id:'q1',stageId:'m1',options:['o0','o1'],correctOptionId:'o1',
      feedbackCorrect:'private',feedbackIncorrect:'private'},
    {id:'q2',stageId:'m1',options:['o0','o1'],correctOptionId:'o0',
      feedbackCorrect:'private',feedbackIncorrect:'private'},
    {id:'q3',stageId:'m2',options:['o0','o1'],correctOptionId:'o1',
      feedbackCorrect:'private',feedbackIncorrect:'private'},
  ],
};
async function hashed(data:unknown){
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {bytes,hash:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
}
type Persisted={
 politica_id:number;tentativa_numero:number;event_id:string;
 answers_json:string;answers_sha256:string;score_pct:number;passed:number;
};
async function fixture(){
  const policyData=await hashed(policy),bankData=await hashed(bank);
  const stored=new Map<string,Persisted>();
  const query=vi.fn();
  const params:unknown[][]=[];
  const db={
    prepare:vi.fn((sql:string)=>{
      query(sql);
      return {bind:(...values:unknown[])=>{
        params.push(values);
        return {
          first:async()=>{
            if(sql.startsWith('SELECT b.id vinculo_id'))return {
              vinculo_id:222,politica_id:301,source_sha256:SOURCE,
              policy_sha256:policyData.hash,bank_sha256:bankData.hash,r2_prefix:prefix,
            };
            if(sql.startsWith('SELECT politica_id'))return stored.get(String(values[1])+':'+String(values[2]))??null;
            if(sql.startsWith('SELECT MAX(tentativa_numero)')){
              const nums=[...stored.entries()].filter(([key])=>key.startsWith(String(values[1])+':'))
                .map(([,v])=>v.tentativa_numero);
              return {number:nums.length?Math.max(...nums):null};
            }
            throw Error('UNEXPECTED_SQL');
          },
          run:async()=>{
            if(!sql.startsWith('INSERT INTO lms_player3_tentativas_modulares'))throw Error('UNEXPECTED_WRITE');
            const [stage,num,event,answers,digest,score,pass,pid]=values;
            const k=String(stage)+':'+String(num);
            if(stored.has(k))throw Error('UNIQUE');
            stored.set(k,{
              politica_id:Number(pid),tentativa_numero:Number(num),event_id:String(event),
              answers_json:String(answers),answers_sha256:String(digest),
              score_pct:Number(score),passed:Number(pass),
            });
            return {success:true,meta:{changes:1}};
          },
        };
      }};
    }),
  };
  const bucket={
    get:vi.fn(async(key:string)=>{
      const data=key===prefix+'player3-approved-policy.json'?policyData:
        key===prefix+'player3-server-private-bank.json'?bankData:null;
      return data?{size:data.bytes.length,arrayBuffer:async()=>data.bytes.buffer}:null;
    }),
  };
  const env={
    ENVIRONMENT:'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:'6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS:'6',
    PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:'6',
  } as unknown as Env;
  const call=(partial:Record<string,unknown>={})=>commitPlayer3StageAttempt({
    env,db:db as unknown as D1Database,bucket:bucket as unknown as R2Bucket,
    actorUserId:33,empresaId:6,matriculaId:911,stageId:'m1',
    eventId:'stage-event-1',attemptNumber:1,
    answers:[{questionId:'q1',optionId:'o1'},{questionId:'q2',optionId:'o0'}],
    ...partial,
  });
  return {call,env,db,bucket,stored,params};
}
beforeEach(()=>{
  vi.mocked(loadNativePrivateCourse).mockReset();
  vi.mocked(loadNativePrivateCourse).mockResolvedValue({
    editionHash:EDITION,cursoId:10,cicloId:1000,mode:'LEARN',
    artifact:{} as never,
  });
});
describe('Player 3 staging module attempt writer',()=>{
  it('keeps staging and exact-tenant opt-ins OFF by default',async()=>{
    const f=await fixture();
    expect(canWritePlayer3Stage({ENVIRONMENT:'production'} as Env,6)).toBe(false);
    await expect(f.call({env:{...f.env,PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:undefined}}))
      .rejects.toMatchObject({code:'STAGE_WRITES_DISABLED'});
    expect(f.db.prepare).not.toHaveBeenCalled();
    expect(f.bucket.get).not.toHaveBeenCalled();
  });
  it('writes one server-graded immutable stage with no completion claim',async()=>{
    const f=await fixture();
    const receipt=await f.call();
    expect(receipt).toMatchObject({state:'APPLIED',stageId:'m1',
      scorePct:100,stagePassed:true,completionSupported:false});
    expect(f.stored.size).toBe(1);
    expect(JSON.stringify(receipt)).not.toMatch(/correctOptionId|private/);
    const row=[...f.stored.values()][0];
    expect(row.answers_json).not.toContain('correctOptionId');
    expect(row.passed).toBe(1);
  });
  it('replays exactly the same event without a second D1 INSERT',async()=>{
    const f=await fixture();
    await f.call();
    const twice=await f.call();
    expect(twice.state).toBe('IDEMPOTENT_REPLAY');
    expect(f.stored.size).toBe(1);
    await expect(f.call({eventId:'other-event'})).rejects.toMatchObject({
      code:'STAGE_REPLAY_CONFLICT',
    });
  });
  it('allows module 2 to start at attempt 1 independently of module 1',async()=>{
    const f=await fixture();
    await f.call();
    expect((await f.call({stageId:'m2',eventId:'m2event',
      answers:[{questionId:'q3',optionId:'o1'}]})).stagePassed).toBe(true);
    expect(f.stored.size).toBe(2);
  });
  it('stores a failed official attempt as a failure and allows the next number',async()=>{
    const f=await fixture();
    const failure=await f.call({answers:[
      {questionId:'q1',optionId:'o0'},{questionId:'q2',optionId:'o0'},
    ]});
    expect(failure).toMatchObject({stagePassed:false,scorePct:50});
    await expect(f.call({attemptNumber:3,eventId:'attempt3'})).rejects
      .toMatchObject({code:'STAGE_SEQUENCE_CONFLICT'});
    expect((await f.call({attemptNumber:2,eventId:'attempt2'})).stagePassed).toBe(true);
  });
  it('rejects client-supplied grade, extra answer, and bad enrollment scope',async()=>{
    const f=await fixture();
    await expect(f.call({answers:[{questionId:'q1',optionId:'o1',scorePct:100}]}))
      .rejects.toBeInstanceOf(Player3StageWriteError);
    await expect(f.call({answers:[{questionId:'q1',optionId:'o1'},{questionId:'q3',optionId:'o1'}]}))
      .rejects.toMatchObject({code:'STAGE_EVIDENCE_INVALID'});
    await expect(f.call({actorUserId:0})).rejects.toMatchObject({code:'STAGE_REQUEST_INVALID'});
    expect(f.stored.size).toBe(0);
  });
  it('fails closed when private policy or bank object is missing',async()=>{
    const f=await fixture();
    f.bucket.get.mockResolvedValueOnce(null);
    await expect(f.call()).rejects.toMatchObject({code:'PRIVATE_ASSET_UNAVAILABLE'});
    expect(f.stored.size).toBe(0);
  });
});
