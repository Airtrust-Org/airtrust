import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';
import routes from '../../routes/lms-player3-stage-attempts';
import {canWritePlayer3Stage,loadApprovedPlayer3StageContext}
  from '../../services/lms-player3-module-attempt-writer';
import {readPlayer3ModuleSession}
  from '../../services/lms-player3-module-progress-reader';
import {readNativeLearnerSession}
  from '../../services/lms-native-readiness-repository';

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
vi.mock('../../services/lms-native-readiness-repository',()=>({
  readNativeLearnerSession:vi.fn(),
}));
const allow=vi.mocked(canWritePlayer3Stage);
const load=vi.mocked(loadApprovedPlayer3StageContext);
const progress=vi.mocked(readPlayer3ModuleSession);
const native=vi.mocked(readNativeLearnerSession);
const sha=(s:string)=>s.repeat(64);
const content={
  schema:'AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1',
  sourceSha256:sha('b'),contentSha256:sha('c'),
  sourceStageCrosswalkSha256:sha('d'),
  orderedUnitIdsSha256:'',
  answersStripped:true,legacyScormDisabled:true,
  reviewedImmutableRelease:true,
};
const approved={
  course:{
    cursoId:57,editionHash:sha('a'),cicloId:333,mode:'LEARN',
    artifact:{
      units:[{id:'unit21',kind:'lesson'},{id:'unit22',kind:'lesson'},
        {id:'module1',kind:'assessment'}],
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
  beforeEach(async()=>{
    vi.clearAllMocks();
    const ids=approved.course.artifact.units.map(x=>x.id);
    const digest=await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(JSON.stringify(ids)));
    content.orderedUnitIdsSha256=[...new Uint8Array(digest)]
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    native.mockResolvedValue({summary:{
      editionHash:sha('a'),cicloId:333,mode:'LEARN',
      nextSequence:2,seenLessonIds:['unit21'],
      lastVisitedUnitId:'unit21',totalLessons:2,latestAttempt:null,
    }} as never);
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
      resume_next_unit_id:'unit22',last_visited_unit_id:'unit21',
      checkpoint_unit_ids:['unit21','unit22'],
      official_stages_passed:false,completion_supported:false,
      // The second lesson is not checkpointed yet: no official question leak.
      pending_assessment:null,
    });
  });
  it('discloses the official module only after all preceding lessons are persisted',async()=>{
    native.mockResolvedValueOnce({summary:{
      editionHash:sha('a'),cicloId:333,mode:'LEARN',
      nextSequence:3,seenLessonIds:['unit21','unit22'],
      lastVisitedUnitId:'unit22',totalLessons:2,latestAttempt:null,
    }} as never);
    const res=await request();
    expect(res.status).toBe(200);
    const body=await res.json() as {data:Record<string,unknown>};
    expect(body.data.resume_next_unit_id).toBe('module1');
    expect(body.data.pending_assessment).toEqual({
      stage_id:'module1',title:'module1',questions:[{
        id:'q1',prompt:'Pergunta autenticada',
        options:[{id:'x',text:'Alternativa X'},{id:'y',text:'Alternativa Y'}],
      }],
    });
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });
  it('keeps a later official assessment hidden until its own lesson prefix is complete',async()=>{
    const multi={...approved,course:{...approved.course,artifact:{
      ...approved.course.artifact,
      units:[
        {id:'unit21',kind:'lesson'},{id:'module1',kind:'assessment'},
        {id:'unit22',kind:'lesson'},{id:'module2',kind:'assessment'},
      ],
      questions:[...approved.course.artifact.questions,{
        id:'q2',prompt:'Questão segundo módulo',
        options:[{id:'x',text:'X'},{id:'y',text:'Y'}],
      }],
    }},policy:{...approved.policy,stages:[
      ...approved.policy.stages,{stageId:'module2',requiredQuestionIds:['q2']},
    ]},bank:{questions:[
      ...approved.bank.questions,{id:'q2',stageId:'module2',options:['x','y']},
    ]}};
    const ids=multi.course.artifact.units.map(unit=>unit.id);
    const digest=await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(JSON.stringify(ids)));
    content.orderedUnitIdsSha256=[...new Uint8Array(digest)]
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    load.mockResolvedValue(multi as never);
    progress.mockResolvedValue({...session,stages:[
      {stageId:'module1',passed:true},{stageId:'module2',passed:false},
    ]} as never);
    let res=await request();
    expect(res.status).toBe(200);
    const first=await res.json() as {data:{
      pending_assessment:unknown;resume_next_unit_id:string,
    }};
    expect(first.data.pending_assessment).toBeNull();
    // Module 1 is approved, so restart must NOT land on its exam again.
    expect(first.data.resume_next_unit_id).toBe('unit22');
    native.mockResolvedValueOnce({summary:{
      editionHash:sha('a'),cicloId:333,mode:'LEARN',
      nextSequence:3,seenLessonIds:['unit21','unit22'],
      lastVisitedUnitId:'unit22',totalLessons:2,latestAttempt:null,
    }} as never);
    res=await request();
    expect(res.status).toBe(200);
    expect((await res.json() as {data:{
      pending_assessment:{stage_id:string}|null,
    }}).data.pending_assessment?.stage_id).toBe('module2');
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
