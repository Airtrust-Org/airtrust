import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';
import {ApiError} from '../../middleware/error-handler';

const {admissionMock,cycleMock}=vi.hoisted(()=>({
  admissionMock:vi.fn(),cycleMock:vi.fn(),
}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(_c:unknown,next:()=>Promise<void>)=>{await next();},
}));
vi.mock('../../middleware/rbac',async(importOriginal)=>{
  const original=await importOriginal<typeof import('../../middleware/rbac')>();
  return {...original,hasRole:()=>true,
    requirePermission:()=>async(_c:unknown,next:()=>Promise<void>)=>{await next();}};
});
vi.mock('../../routes/escalas-shared',()=>({getEmpresaIdSafe:()=>6}));
vi.mock('../../services/lms-native-catalog-legacy-guard',()=>({
  isNativeForLegacyLmsPath:vi.fn(async()=>false),
}));
vi.mock('../../services/lms-scorm-cycle-guard',()=>({
  assertScormCommitCycle:cycleMock,
}));
vi.mock('../../services/lms-scorm-player3-admission',()=>({
  resolveScormPlayer3Admission:admissionMock,
}));
import routes from '../../routes/lms-matriculas';

function fixture(){
  const writes=vi.fn();
  const enrollment={
    id:101,empresa_id:6,funcionario_id:77,status:'EM_ANDAMENTO',
    progresso_pct:22,tentativas:0,qualificacao_historico_id:null,
    curso_id:9,tipo_conteudo:'scorm',scorm_versao:'1.2',
    scorm_package_r2_prefix:'lms/scorm/6/9/_candidates/edition-123/',
    scorm_mastery_score:70,scorm_assessment_policy:'FORMATIVE',
    gerar_qualificacao_ao_concluir:1,qualificacao_tipo_id:7,
    curso_titulo:'Score curso exemplo',
    qualificacao_codigo:'EXAMPLE',qualificacao_nome:'Score exemplo',
    qualificacao_categoria:'EAD',qualificacao_validade:12,
    qualificacao_vencimento_fim_mes:null,
  };
  const prepare=vi.fn((query:string)=>({
    bind:(...args:unknown[])=>({
      first:async()=>{
        if(args[0]!==101||args[1]!==6)throw Error('UNSCOPED_SQL');
        if(query.includes('FROM lms_progresso_scorm'))return null;
        if(query.includes('FROM lms_matriculas m'))return enrollment;
        throw Error('UNEXPECTED_QUERY');
      },
      run:writes,
    }),
  }));
  const app=new Hono<{Bindings:Env}>();
  app.onError((e,c)=>e instanceof ApiError?
    c.json({success:false,error:e.message},e.statusCode as 403):
    c.json({success:false,code:'UNEXPECTED_SERVER_ERROR'},500));
  app.route('/',routes);
  const send=(method:string,endpoint:string,payload?:unknown)=>app.fetch(
    new Request('http://localhost'+endpoint,{
      method,headers:{'content-type':'application/json'},
      body:payload===undefined?undefined:JSON.stringify(payload),
    }),{DB:{prepare},BUCKET:{}} as unknown as Env,{} as ExecutionContext);
  return {send,writes,prepare};
}
describe('Score SCORM study mode cannot certify through legacy terminal endpoints',()=>{
  beforeEach(()=>{
    admissionMock.mockReset().mockResolvedValue({kind:'SCORM_STUDY'});
    cycleMock.mockReset().mockResolvedValue(undefined);
  });
  it('rejects a forged SCORM passed/score commit before any D1 mutation',async()=>{
    const {send,writes}=fixture();
    const r=await send('POST','/scorm/commit',{
      matricula_id:101,ciclo_id:1,lesson_status:'passed',
      score_raw:100,score_max:100,suspend_data:'{"study":true}',
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({code:'SCORM_STUDY_CANNOT_CERTIFY'});
    expect(writes).not.toHaveBeenCalled();
  });
  it('rejects manual finalization of a Score study enrollment',async()=>{
    const {send,writes}=fixture();
    const r=await send('POST','/101/finalizar',{});
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({code:'SCORM_STUDY_NOT_TERMINAL'});
    expect(writes).not.toHaveBeenCalled();
  });
  it('rejects administrator CONCLUIDO override despite supplied reason',async()=>{
    const {send,writes}=fixture();
    const r=await send('PATCH','/101/status',{
      status:'CONCLUIDO',observacoes:'Motivo administrativo de QA independente',
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({code:'SCORM_STUDY_NOT_TERMINAL'});
    expect(writes).not.toHaveBeenCalled();
  });
  it('blocks all three paths when candidate evidence is unverified',async()=>{
    admissionMock.mockResolvedValue({kind:'BLOCKED',reason:'CANDIDATE_UNVERIFIED'});
    const {send,writes}=fixture();
    const r=await send('POST','/scorm/commit',{matricula_id:101,lesson_status:'incomplete'});
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({code:'SCORM_PLAYER3_PROFILE_NOT_ADMITTED'});
    expect(writes).not.toHaveBeenCalled();
  });
});
