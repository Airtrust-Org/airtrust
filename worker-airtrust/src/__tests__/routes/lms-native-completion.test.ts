import { beforeEach,describe,expect,it,vi } from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),complete:vi.fn()}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(c:{req:{header(k:string):string|undefined};
    set(k:string,v:unknown):void;json(v:unknown,code:401):Response},
    next:()=>Promise<void>)=>{
    if(!c.req.header('x-test-user')||!c.req.header('x-test-tenant'))
      return c.json({code:'UNAUTHORIZED'},401);
    c.set('userId',Number(c.req.header('x-test-user')));
    c.set('empresaId',Number(c.req.header('x-test-tenant')));
    await next();
  },
}));
vi.mock('../../routes/escalas-shared',()=>({
  getEmpresaIdSafe:(c:{get(k:string):number})=>c.get('empresaId'),
}));
vi.mock('../../services/lms-native-terminal-preparer',()=>({
  prepareNativeTerminalGuard:mocks.prepare,
}));
vi.mock('../../services/lms-completion',()=>({
  LmsCompletionRejectedError:class LmsCompletionRejectedError extends Error{},
  completeLmsMatricula:mocks.complete,
}));
import nativeRoutes from '../../routes/lms-native';
function call(opts:{stage?:string;tenant?:number;actor?:number;flag?:string;
  marker?:string;preview?:string;write?:string;id?:string;
  body?:string;anonymous?:boolean}={}){
  const app=new Hono<{Bindings:Env}>();
  app.route('/api/lms/native',nativeRoutes);
  const headers:Record<string,string>=opts.anonymous?{}:{
    'x-test-user':String(opts.actor??900),'x-test-tenant':String(opts.tenant??6),
  };
  return app.fetch(new Request('http://localhost/api/lms/native/matriculas/'+
    (opts.id??'101')+'/concluir',{
      method:'POST',headers,body:opts.body,
    }),{
      ENVIRONMENT:opts.stage??'staging',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:opts.marker??'6',
      NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:opts.preview??'6',
      NATIVE_LEARNER_WRITE_ENABLED_TENANTS:opts.write??'6',
      NATIVE_COMPLETION_WRITE_ENABLED_TENANTS:opts.flag??'6',
      DB:{} as D1Database,BUCKET:{} as R2Bucket,
    } as Env);
}
const snapshot={
  empresaId:6,cursoId:31,matriculaId:101,cicloId:1001,
  funcionarioId:51,editionHash:'a'.repeat(64),cursoTitulo:'Native',
  gerarQualificacaoAoConcluir:true,
  qualificacaoTipoId:44,qualificacaoCategoriaId:45,
  qualificacaoCodigo:'QUAL-N',qualificacaoNome:'Qualificação Native',
  qualificacaoCategoria:'EAD',qualificacaoCategoriaCodigo:'EAD',
  validade:12,vencimentoFimMes:1,
  existingHistoricoId:null,
  evidenceSnapshot:{
    eventCount:8,distinctLessonCount:6,latestAttemptNumber:2,scorePct:85,
  },
};
const anchor={
  empresaId:6,cursoId:31,matriculaId:101,cicloId:1001,funcionarioId:51,
  actorUserId:900,edicaoId:77,editionHash:'a'.repeat(64),bindingId:202,
  latestAttemptId:88,latestAttemptNumber:2,answersHash:'b'.repeat(64),
  scorePct:85,eventCount:8,distinctLessonCount:6,
  gerarQualificacaoAoConcluir:true,qualificacaoTipoId:44,
  qualificacaoCategoriaId:45,
};
describe('Native terminal HTTP entry: fifth gate and server-issued proof only',()=>{
  beforeEach(()=>{
    mocks.prepare.mockReset().mockResolvedValue({
      ready:true,canonical:snapshot,terminalAnchor:anchor,
    });
    mocks.complete.mockReset().mockResolvedValue({
      matriculaId:101,outcome:'qualification_created',qualificacaoHistoricoId:333,
    });
  });
  it('never executes without staging and all exact-tenant flags',async()=>{
    for(const opts of [{stage:'production'},{flag:''},{flag:'*'},{flag:'60'},
      {marker:''},{preview:''},{write:''},{tenant:7}]){
      const r=await call(opts);
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({code:'NATIVE_COMPLETION_NOT_ENABLED'});
    }
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('never allows a browser-provided employee, grade, status or edition',async()=>{
    expect((await call({anonymous:true})).status).toBe(401);
    expect((await call({id:'9e2'})).status).toBe(400);
    expect((await call({actor:0})).status).toBe(403);
    for(const body of ['{}','{"scoreFinal":100}','{"funcionario_id":17}',
      '{"status":"CONCLUIDO"}','{"edicao_id":50}']){
      expect((await call({body})).status).toBe(400);
    }
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('sends only server-owned proof and canonical qualification to one writer',async()=>{
    const r=await call();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(await r.json()).toEqual({success:true,data:{
      matricula_id:101,status:'CONCLUIDO',
      qualification_outcome:'qualification_created',
      certificate_state:'REQUIRES_VERIFICATION',
    }});
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      empresaId:6,matriculaId:101,actorUserId:900,
    }));
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      funcionarioId:51,cursoId:31,scoreFinal:85,
      qualificacaoCategoriaId:45,vencimentoFimMes:1,
      nativeTerminalAnchor:anchor,action:'LMS_NATIVE_CANONICAL_CONCLUIDA',
      progressoPct:100,
    }));
  });
  it('does not fabricate a qualification or certificate for a formative-only course',async()=>{
    mocks.prepare.mockResolvedValueOnce({ready:true,canonical:{
      ...snapshot,gerarQualificacaoAoConcluir:false,
      qualificacaoTipoId:null,qualificacaoCategoriaId:null,
      qualificacaoCodigo:null,qualificacaoNome:null,
      qualificacaoCategoria:null,qualificacaoCategoriaCodigo:null,
      validade:null,vencimentoFimMes:null,
      evidenceSnapshot:{...snapshot.evidenceSnapshot,scorePct:null},
    },terminalAnchor:{...anchor,gerarQualificacaoAoConcluir:false,
      qualificacaoTipoId:null,qualificacaoCategoriaId:null,scorePct:null}});
    mocks.complete.mockResolvedValueOnce({matriculaId:101,
      outcome:'qualification_not_required',qualificacaoHistoricoId:null});
    const r=await call();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({success:true,data:{
      matricula_id:101,status:'CONCLUIDO',
      qualification_outcome:'qualification_not_required',
      certificate_state:'NOT_APPLICABLE',
    }});
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      gerarQualificacaoAoConcluir:false,qualificacaoTipoId:null,
      scoreFinal:null,vencimentoFimMes:null,
    }));
  });
  it('returns no success when readiness/qualification is not proven',async()=>{
    mocks.prepare.mockResolvedValueOnce({ready:false,reason:'ASSESSMENT_NOT_SATISFIED'});
    const r=await call();
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({code:'NATIVE_COMPLETION_NOT_READY'});
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('maps a guarded canonical batch rejection to conflict, never success',async()=>{
    const {LmsCompletionRejectedError}=await import('../../services/lms-completion');
    mocks.complete.mockRejectedValueOnce(new LmsCompletionRejectedError('batch rejected'));
    const r=await call();
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({success:false,
      code:'NATIVE_COMPLETION_TRANSACTION_REJECTED'});
  });
  it('never reports 200 on a terminal batch rejection or runtime failure',async()=>{
    mocks.complete.mockRejectedValueOnce(new Error('D1 complete failed'));
    const r=await call();
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({code:'NATIVE_COMPLETION_UNAVAILABLE'});
  });
});
