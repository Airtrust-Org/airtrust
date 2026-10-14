import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';

const mocks=vi.hoisted(()=>({prepare:vi.fn(),complete:vi.fn()}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(c:{
    req:{header(name:string):string|undefined};
    set(name:string,value:unknown):void;
    json(body:unknown,code:401):Response;
  },next:()=>Promise<void>)=>{
    const user=c.req.header('x-test-user'),tenant=c.req.header('x-test-tenant');
    if(!user||!tenant)return c.json({success:false,code:'UNAUTHORIZED'},401);
    c.set('userId',Number(user));c.set('empresaId',Number(tenant));await next();
  },
}));
vi.mock('../../routes/escalas-shared',()=>({
  getEmpresaIdSafe:(c:{get(name:string):number})=>c.get('empresaId'),
}));
vi.mock('../../services/lms-player3-canonical-terminal-preparer',()=>({
  preparePlayer3CanonicalTerminal:mocks.prepare,
}));
vi.mock('../../services/lms-completion',()=>({
  LmsCompletionRejectedError:class LmsCompletionRejectedError extends Error{},
  completeLmsMatricula:mocks.complete,
}));
import nativeRoutes from '../../routes/lms-native';

const anchor={
  empresaId:6,matriculaId:101,cursoId:31,cicloId:1001,
  funcionarioId:51,actorUserId:900,bindingId:202,edicaoId:77,
  politicaId:25,editionHash:'a'.repeat(64),sourceHash:'b'.repeat(64),
  bankHash:'c'.repeat(64),policyHash:'d'.repeat(64),
  requiredLessonIds:['lesson-1'],recordedEventCount:1,
  officialStages:[{stageId:'mod1',attemptId:12,attemptNumber:1,
    answersHash:'e'.repeat(64),scorePct:85}],
  gerarQualificacaoAoConcluir:true,qualificacaoTipoId:44,
  qualificacaoCategoriaId:45,
};
const canonical={
  empresaId:6,matriculaId:101,cursoId:31,cicloId:1001,
  funcionarioId:51,cursoTitulo:'Doutrinamento',editionSha256:'a'.repeat(64),
  gerarQualificacaoAoConcluir:true,qualificacaoTipoId:44,
  qualificacaoCategoriaId:45,qualificacaoCodigo:'QUAL-A',
  qualificacaoNome:'Doutrinamento',qualificacaoCategoria:'EAD',
  qualificacaoCategoriaCodigo:'EAD',validade:12,vencimentoFimMes:1,
  existingHistoricoId:null,
};
function call(o:{stage?:string;tenant?:number;user?:number;anonymous?:boolean;
  preview?:string;write?:string;modular?:string;catalog?:string;
  terminal?:string;id?:string;body?:string}={}){
  const app=new Hono<{Bindings:Env}>();
  app.route('/api/lms/native',nativeRoutes);
  const headers:Record<string,string>=o.anonymous?{}:{
    'x-test-user':String(o.user??900),'x-test-tenant':String(o.tenant??6),
  };
  return app.fetch(new Request('http://localhost/api/lms/native/matriculas/'+
    (o.id??'101')+'/etapas/concluir',{method:'POST',headers,body:o.body}),{
      ENVIRONMENT:o.stage??'staging',
      NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS:o.preview??'6',
      NATIVE_LEARNER_WRITE_ENABLED_TENANTS:o.write??'6',
      PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS:o.modular??'6',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS:o.catalog??'6',
      PLAYER3_TERMINAL_WRITE_ENABLED_TENANTS:o.terminal,
      DB:{} as D1Database,BUCKET:{} as R2Bucket,
    } as Env);
}
describe('Player3 canonical terminal: independent staging-only gate',()=>{
  beforeEach(()=>{
    mocks.prepare.mockReset().mockResolvedValue({
      ready:true,canonical,terminalAnchor:anchor,
    });
    mocks.complete.mockReset().mockResolvedValue({
      matriculaId:101,outcome:'qualification_created',qualificacaoHistoricoId:333,
    });
  });
  it('defaults OFF and rejects production, wildcard and unmatched tenant without D1',async()=>{
    for(const o of [{},{terminal:'*'},{terminal:'60'},
      {terminal:'6',stage:'production'},{terminal:'6',preview:''},
      {terminal:'6',write:''},{terminal:'6',modular:''},
      {terminal:'6',catalog:''},{terminal:'6',tenant:7}]){
      const response=await call(o);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        code:'PLAYER3_TERMINAL_NOT_ENABLED',
      });
    }
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated users, malformed IDs, browser metadata and empty user',async()=>{
    expect((await call({terminal:'6',anonymous:true})).status).toBe(401);
    expect((await call({terminal:'6',user:0})).status).toBe(403);
    expect((await call({terminal:'6',id:'9x'})).status).toBe(400);
    for(const body of ['{}','{"scoreFinal":100}','{"certificate":true}',
      '{"edition":"forged"}']){
      expect((await call({terminal:'6',body})).status).toBe(400);
    }
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('constructs completion solely from server verified proof and returns no PDF claim',async()=>{
    const r=await call({terminal:'6'});
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(await r.json()).toEqual({success:true,data:{
      matricula_id:101,status:'CONCLUIDO',
      qualification_outcome:'qualification_created',
      certificate_state:'REQUIRES_VERIFICATION',
    }});
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId:900,empresaId:6,matriculaId:101,
    }));
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      player3TerminalAnchor:anchor,
      action:'LMS_PLAYER3_CANONICAL_CONCLUIDA',scoreFinal:null,
      progressoPct:100,funcionarioId:51,
      qualificacaoCategoriaCodigo:'EAD',
    }));
  });
  it('rejects false or cross-matricula completion receipt',async()=>{
    mocks.complete.mockResolvedValueOnce({
      matriculaId:102,outcome:'qualification_created',qualificacaoHistoricoId:333,
    });
    expect((await call({terminal:'6'})).status).toBe(503);
    mocks.complete.mockResolvedValueOnce({
      matriculaId:101,outcome:'qualification_failed',qualificacaoHistoricoId:null,
    });
    expect((await call({terminal:'6'})).status).toBe(503);
  });
  it('does not claim certificate for non-qualification course',async()=>{
    mocks.prepare.mockResolvedValueOnce({ready:true,
      canonical:{...canonical,gerarQualificacaoAoConcluir:false,
        qualificacaoTipoId:null,qualificacaoCategoriaId:null,
        qualificacaoCategoriaCodigo:null,validade:null,vencimentoFimMes:null},
      terminalAnchor:{...anchor,gerarQualificacaoAoConcluir:false,
        qualificacaoTipoId:null,qualificacaoCategoriaId:null},
    });
    mocks.complete.mockResolvedValueOnce({
      matriculaId:101,outcome:'qualification_not_required',qualificacaoHistoricoId:null,
    });
    const r=await call({terminal:'6'});
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({data:{certificate_state:'NOT_APPLICABLE'}});
  });
});
