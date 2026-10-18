import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(c:{
    req:{header(name:string):string|undefined};
    set(key:string,value:unknown):void;
    json(body:unknown,status:401):Response;
  },next:()=>Promise<void>)=>{
    const user=c.req.header('x-test-user'),tenant=c.req.header('x-test-tenant');
    if(!user||!tenant)return c.json({success:false,code:'UNAUTHORIZED'},401);
    c.set('userId',Number(user));c.set('empresaId',Number(tenant));
    await next();
  },
}));
vi.mock('../../services/lms-player3-qa-evidence-reader',()=>({
  readPlayer3QaSnapshot:mock.read,
}));
import nativeRoutes from '../../routes/lms-native';
const get=(opts:{
  env?:'staging'|'production';tenant?:number;user?:number;anonymous?:boolean;
  qa?:string;preview?:string;id?:string;
}={})=>{
  const app=new Hono<{Bindings:Env}>();
  app.route('/api/lms/native',nativeRoutes);
  const headers:Record<string,string>={};
  if(!opts.anonymous){
    headers['x-test-user']=String(opts.user??44);
    headers['x-test-tenant']=String(opts.tenant??6);
  }
  return app.fetch(new Request(
    'http://localhost/api/lms/native/matriculas/'+(opts.id??'911')+
    '/etapas/qa-evidencias',{headers}),{
    ENVIRONMENT:opts.env??'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:opts.preview??'6',
    PLAYER3_QA_READ_ENABLED_TENANTS:opts.qa??'6',
    DB:{} as D1Database,BUCKET:{} as R2Bucket,
  } as unknown as Env);
};
describe('Player3 QA snapshot isolation and fail-closed routing',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mock.read.mockResolvedValue({
      empresa_id:6,matricula_id:911,ciclo_id:1000,
      edition_sha256:'a'.repeat(64),status:'EM_ANDAMENTO',
      progresso_pct:30,completed_unit_ids:['u1'],
      attempts:[{stage_id:'mod1',attempt_number:1,passed:false,score_pct:20}],
      qualificacao_historico_id:null,certificate_id:null,
    });
  });
  it('rejects production, disabled, wildcard and other-tenant calls before D1/R2',async()=>{
    for(const opts of [
      {env:'production' as const},{qa:''},{qa:'*'},{qa:'60'},
      {preview:''},{preview:'*'},{tenant:7},
    ]){
      expect((await get(opts)).status).toBe(404);
    }
    expect(mock.read).not.toHaveBeenCalled();
  });
  it('requires inherited authentication and valid enrollment and user context',async()=>{
    expect((await get({anonymous:true})).status).toBe(401);
    expect((await get({id:'NaN'})).status).toBe(400);
    expect((await get({user:0})).status).toBe(403);
    expect(mock.read).not.toHaveBeenCalled();
  });
  it('returns only the server-produced learner-owned snapshot',async()=>{
    const response=await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body=await response.json() as {data:Record<string,unknown>};
    expect(body.data).toMatchObject({status:'EM_ANDAMENTO',progresso_pct:30});
    expect(JSON.stringify(body)).not.toMatch(/answers_json|answerKey|correctOptionId|privateBank|gabarito/i);
    expect(mock.read).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId:44,empresaId:6,matriculaId:911,
    }));
  });
  it('does not leak backend failure reasons',async()=>{
    mock.read.mockRejectedValueOnce(new Error('secret R2 path'));
    const response=await get();
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
  });
});