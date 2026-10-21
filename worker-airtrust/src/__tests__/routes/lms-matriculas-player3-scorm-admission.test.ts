import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';
import {ApiError} from '../../middleware/error-handler';

const {admissionMock}=vi.hoisted(()=>({admissionMock:vi.fn()}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(c:{set:(key:string,value:unknown)=>void},next:()=>Promise<void>)=>{
    c.set('funcionarioId',77);
    await next();
  },
}));
vi.mock('../../middleware/rbac',async(importOriginal)=>{
  const original=await importOriginal<typeof import('../../middleware/rbac')>();
  return {...original,hasRole:()=>false};
});
vi.mock('../../routes/escalas-shared',()=>({getEmpresaIdSafe:()=>6}));
vi.mock('../../services/lms-scorm-player3-admission',()=>({
  resolveScormPlayer3Admission:admissionMock,
}));

import routes from '../../routes/lms-matriculas';

function build(employeeId=77){
  const prepare=vi.fn((sql:string)=>({
    bind:vi.fn((...params:unknown[])=>({
      first:vi.fn(async()=>{
        if(!sql.includes('c.empresa_id=m.empresa_id')||
           !sql.includes('m.empresa_id=?')||
           params[0]!==101||params[1]!==6)
          throw Error('UNSCOPED_ENROLLMENT_QUERY');
        return {
          id:101,funcionario_id:employeeId,status:'EM_ANDAMENTO',
          curso_id:9,tipo_conteudo:'scorm',scorm_versao:'1.2',
          scorm_package_r2_prefix:'lms/scorm/6/9/_candidates/edition-123/',
          ativo:1,publicado:1,
        };
      }),
    })),
  }));
  const app=new Hono<{Bindings:Env}>();
  app.onError((e,c)=>e instanceof ApiError?
    c.json({success:false,error:e.message},e.statusCode as 403):
    c.json({success:false,code:'UNEXPECTED_SERVER_ERROR'},500));
  app.route('/',routes);
  const request=()=>app.fetch(
    new Request('http://localhost/101/player3-scorm-admissao'),
    {DB:{prepare},BUCKET:{}} as unknown as Env,
    {} as ExecutionContext,
  );
  return {prepare,request};
}
describe('SCORM original learner admission uses tenant-bound Worker profile',()=>{
  beforeEach(()=>admissionMock.mockReset());
  it('returns study-only mode but never certificate/score authorization',async()=>{
    admissionMock.mockResolvedValue({
      kind:'SCORM_STUDY',reason:'ACTIVE_PACKAGE_ADMITTED',
      packageSha256:'a'.repeat(64),packageVersion:'SCORE-V4',
    });
    const {request}=build();
    const r=await request();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({success:true,data:{
      mode:'SCORM_STUDY',matricula_id:101,curso_id:9,
      completion_authorized:false,exam_authorized:false,certificate_authorized:false,
    }});
    expect(admissionMock).toHaveBeenCalledWith(expect.objectContaining({
      tenant:6,course:9,reviewedForProduction:false,
    }));
  });
  it('denies a different employee before consulting package metadata',async()=>{
    const {request}=build(999);
    const r=await request();
    expect(r.status).toBe(403);
    expect(admissionMock).not.toHaveBeenCalled();
  });
  it('distinguishes genuine legacy from unverified candidate editions',async()=>{
    const a=build();
    admissionMock.mockResolvedValueOnce({
      kind:'LEGACY',reason:'NOT_A_SCORE_CANDIDATE',
    });
    const legacy=await a.request();
    expect(legacy.status).toBe(404);
    expect(await legacy.json()).toMatchObject({code:'SCORM_PLAYER3_NOT_APPLICABLE'});
    admissionMock.mockResolvedValueOnce({
      kind:'BLOCKED',reason:'CANDIDATE_UNVERIFIED',
    });
    const blocked=await a.request();
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({code:'CANDIDATE_UNVERIFIED'});
  });
});
