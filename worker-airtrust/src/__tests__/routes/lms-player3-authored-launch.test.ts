import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';
import routes from '../../routes/lms-player3-stage-attempts';
import {canWritePlayer3Stage,loadApprovedPlayer3StageContext}
  from '../../services/lms-player3-module-attempt-writer';
import {readPlayer3ModuleSession}
  from '../../services/lms-player3-module-progress-reader';

vi.mock('../../routes/escalas-shared',()=>({getEmpresaIdSafe:()=>6}));
vi.mock('../../services/lms-player3-module-attempt-writer',()=>({
  canWritePlayer3Stage:vi.fn(),
  loadApprovedPlayer3StageContext:vi.fn(),
  commitPlayer3StageAttempt:vi.fn(),
  Player3StageWriteError:class extends Error{},
}));
vi.mock('../../services/lms-player3-module-progress-reader',()=>({
  readPlayer3ModuleSession:vi.fn(),
}));
const allow=vi.mocked(canWritePlayer3Stage);
const load=vi.mocked(loadApprovedPlayer3StageContext);
const progress=vi.mocked(readPlayer3ModuleSession);
const sha=(s:string)=>s.repeat(64);
const content={
  schema:'AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1',
  sourceSha256:sha('b'),contentSha256:sha('c'),
  sourceStageCrosswalkSha256:sha('d'),
  answersStripped:true,legacyScormDisabled:true,
  reviewedImmutableRelease:true,
};
const approved={
  course:{
    cursoId:57,editionHash:sha('a'),cicloId:333,mode:'LEARN',
    artifact:{
      questions:[{id:'q1',prompt:'Pergunta autenticada',
        options:[{id:'x',text:'Alternativa X'},{id:'y',text:'Alternativa Y'}],
        correctOptionId:'x',feedbackCorrect:'SECRET DO WORKER'}],
    },
  },
  binding:{source_sha256:sha('b')},
  policy:{
    learnerContent:content,
    stages:[{stageId:'module1',requiredQuestionIds:['q1']}],
  },
  bank:{questions:[{id:'q1',stageId:'module1',
    options:['x','y'],correctOptionId:'x',feedbackCorrect:'SECRET DO BANK'}]},
};
const session={
  editionSha256:sha('a'),cycleId:333,allOfficialStagesPassed:false,
  stages:[{stageId:'module1',passed:false}],
};
const app=new Hono<{Bindings:Env}>();
app.use('*',async(c,next)=>{
  c.set('userId' as never, 12 as never);
  await next();
});
app.route('/',routes);
const env={
  ENVIRONMENT:'staging',
  PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS:'6',
  PLAYER3_AUTHORED_CONTENT_ORIGIN:'https://isolated.example',
} as unknown as Env;
const url='http://localhost/matriculas/911/etapas/lancamento';
const request=(bindings:Env=env)=>app.request(url,{method:'GET'},bindings);

describe('Player3 authenticated authored stage launch GET',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    allow.mockReturnValue(true);
    load.mockResolvedValue(approved as never);
    progress.mockResolvedValue(session as never);
  });
  it('stays 404 with independent flag OFF, before touching stage context',async()=>{
    const res=await request({...env,PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS:undefined});
    expect(res.status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });
  it('returns only scoped learner alternatives, not private answer keys',async()=>{
    const res=await request();
    expect(res.status).toBe(200);
    const text=await res.text();
    expect(text).not.toContain('correctOptionId');
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('sourceSha256');
    const body=JSON.parse(text);
    expect(body.data).toMatchObject({
      empresa_id:6,matricula_id:911,curso_id:57,ciclo_id:333,
      edition_sha256:sha('a'),
      content_url:'https://isolated.example/player3/6/57/'+sha('a')+'/'+sha('c')+'/index.html',
      assessment_presentation:'authored-html5',
      official_stages_passed:false,completion_supported:false,
      pending_assessment:{stage_id:'module1',questions:[
        {id:'q1',prompt:'Pergunta autenticada',options:[
          {id:'x',text:'Alternativa X'},{id:'y',text:'Alternativa Y'},
        ]},
      ]},
    });
  });
  it('fails closed if source is unapproved, edition wrong or answers differ',async()=>{
    load.mockResolvedValueOnce({...approved,policy:{
      ...approved.policy,learnerContent:{...content,answersStripped:false},
    }} as never);
    expect((await request()).status).toBe(409);
    load.mockResolvedValueOnce({...approved,course:{
      ...approved.course,editionHash:sha('9'),
    }} as never);
    progress.mockResolvedValueOnce(session as never);
    expect((await request()).status).toBe(409);
    load.mockResolvedValueOnce({...approved,bank:{
      questions:[{...approved.bank.questions[0],options:['y','x']}],
    }} as never);
    expect((await request()).status).toBe(409);
  });
  it('only offers terminal controls after all official stages were persisted',async()=>{
    progress.mockResolvedValueOnce({
      ...session,allOfficialStagesPassed:true,
      stages:[{stageId:'module1',passed:true}],
    } as never);
    const res=await request();
    expect(res.status).toBe(200);
    const body=await res.json() as {data:Record<string,unknown>};
    expect(body.data.official_stages_passed).toBe(true);
    expect(body.data.pending_assessment).toBeNull();
  });
});
