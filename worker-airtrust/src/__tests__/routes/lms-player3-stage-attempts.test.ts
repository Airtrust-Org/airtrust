import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';

const mock=vi.hoisted(()=>({commit:vi.fn()}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(c:{
    req:{header(name:string):string|undefined};
    set(key:string,value:unknown):void;
    json(body:unknown,status:401):Response;
  },next:()=>Promise<void>)=>{
    const user=c.req.header('x-test-user'),tenant=c.req.header('x-test-tenant');
    if(!user||!tenant)return c.json({success:false,code:'UNAUTHORIZED'},401);
    c.set('userId',Number(user));c.set('empresaId',Number(tenant));await next();
  },
}));
vi.mock('../../services/lms-player3-module-attempt-writer',async original=>{
  const actual=await original<typeof import('../../services/lms-player3-module-attempt-writer')>();
  return {...actual,commitPlayer3StageAttempt:mock.commit};
});
import nativeRoutes from '../../routes/lms-native';

function request(opts:{
  env?:'production'|'staging';tenant?:number;user?:number;anonymous?:boolean;
  enabled?:string;preview?:string;writes?:string;
  stage?:string;enrollment?:string;body?:unknown;contentType?:string;
  rawBody?:string;
}={}){
  const parent=new Hono<{Bindings:Env}>();
  parent.route('/api/lms/native',nativeRoutes);
  const headers:Record<string,string>={
    'content-type':opts.contentType??'application/json',
  };
  if(!opts.anonymous){
    headers['x-test-tenant']=String(opts.tenant??6);
    headers['x-test-user']=String(opts.user??44);
  }
  return parent.fetch(new Request(
    'http://localhost/api/lms/native/matriculas/'+(opts.enrollment??'911')+
    '/etapas/'+(opts.stage??'mod1')+'/tentativas',{
      method:'POST',headers,body:opts.rawBody??JSON.stringify(opts.body??{
        eventId:'proof-001',attemptNumber:1,
        answers:[{questionId:'q1',optionId:'o1'}],
      }),
    }),{
      ENVIRONMENT:opts.env??'staging',
      NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:opts.preview??'6',
      NATIVE_LEARNER_WRITE_ENABLED_TENANTS:opts.writes??'6',
      PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:opts.enabled??'6',
      DB:{} as D1Database,BUCKET:{} as R2Bucket,
    } as unknown as Env);
}
describe('Player3 modular stage endpoint, independent and fail-closed',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mock.commit.mockResolvedValue({
      state:'APPLIED',stageId:'mod1',attemptNumber:1,
      editionSha256:'a'.repeat(64),scorePct:100,stagePassed:true,
      completionSupported:false,
    });
  });
  it('rejects production and absent or wildcard capability without contacting DB',async()=>{
    for(const cfg of [
      {env:'production' as const},
      {enabled:''},{enabled:'*'},{preview:''},{writes:''},{enabled:'60'},
    ]){
      const response=await request(cfg);
      expect(response.status).toBe(404);
    }
    expect(mock.commit).not.toHaveBeenCalled();
  });
  it('requires parent authentication and a valid learner identity',async()=>{
    expect((await request({anonymous:true})).status).toBe(401);
    expect((await request({user:0})).status).toBe(403);
    expect((await request({stage:'../bad'})).status).toBe(404);
    expect((await request({enrollment:'NaN'})).status).toBe(400);
    expect(mock.commit).not.toHaveBeenCalled();
  });
  it('rejects client grade/completion and forged context fields',async()=>{
    for(const body of [
      {eventId:'proof',attemptNumber:1,scorePct:100,answers:[{questionId:'q1',optionId:'o1'}]},
      {eventId:'proof',attemptNumber:1,completion:true,answers:[{questionId:'q1',optionId:'o1'}]},
      {eventId:'proof',attemptNumber:1,empresa_id:7,answers:[{questionId:'q1',optionId:'o1'}]},
      {eventId:'proof',attemptNumber:1,answers:[{questionId:'q1',optionId:'o1',correct:true}]},
    ]){
      expect((await request({body})).status).toBe(400);
    }
    expect(mock.commit).not.toHaveBeenCalled();
  });
  it('accepts a stage submission but never certifies the course',async()=>{
    const response=await request();
    expect(response.status).toBe(201);
    const data=await response.json() as {data:Record<string,unknown>};
    expect(data.data).toMatchObject({
      stage_id:'mod1',stage_passed:true,completion_supported:false,
      score_pct:100,attempt_number:1,
    });
    expect(data.data).not.toHaveProperty('certificate');
    expect(data.data).not.toHaveProperty('correctOptionId');
    expect(mock.commit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId:44,empresaId:6,matriculaId:911,stageId:'mod1',
    }));
  });
  it('returns HTTP 200 on idempotent duplicate submission',async()=>{
    mock.commit.mockResolvedValueOnce({
      state:'IDEMPOTENT_REPLAY',stageId:'mod1',attemptNumber:1,
      editionSha256:'a'.repeat(64),scorePct:100,stagePassed:true,
      completionSupported:false,
    });
    expect((await request()).status).toBe(200);
  });
  it('rejects oversized or non-json submissions before contacting writer',async()=>{
    expect((await request({rawBody:'{bad'})).status).toBe(400);
    expect((await request({contentType:'text/plain'})).status).toBe(400);
    expect((await request({rawBody:' '.repeat(140000)})).status).toBe(400);
    expect(mock.commit).not.toHaveBeenCalled();
  });
});
