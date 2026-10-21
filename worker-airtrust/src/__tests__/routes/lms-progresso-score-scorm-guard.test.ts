import {beforeEach,describe,expect,it,vi} from 'vitest';
import {Hono} from 'hono';
import type {Env} from '../../types';

const {admissionMock}=vi.hoisted(()=>({admissionMock:vi.fn()}));
vi.mock('../../middleware/auth',()=>({
  auth:()=>async(_c:unknown,next:()=>Promise<void>)=>{await next();},
}));
vi.mock('../../middleware/rbac',()=>({hasRole:()=>true}));
vi.mock('../../routes/escalas-shared',()=>({getEmpresaIdSafe:()=>6}));
vi.mock('../../services/lms-native-catalog-legacy-guard',()=>({
  isNativeForLegacyLmsPath:vi.fn(async()=>false),
}));
vi.mock('../../services/lms-scorm-player3-admission',()=>({
  resolveScormPlayer3Admission:admissionMock,
}));
import routes from '../../routes/lms-progresso';

function createApp(){
  const writes=vi.fn();
  const prepare=vi.fn((query:string)=>({
    bind:(...args:unknown[])=>({
      first:async()=>{
        if(!query.includes('FROM lms_matriculas m')||
           !query.includes('m.empresa_id = ?')||
           args[0]!==101||args[1]!==6)throw Error('UNSCOPED_XAPI_SQL');
        return {
          id:101,funcionario_id:77,curso_id:9,status:'EM_ANDAMENTO',
          empresa_id:6,tipo_conteudo:'scorm',scorm_versao:'1.2',
          scorm_package_r2_prefix:'lms/scorm/6/9/_candidates/edition-123/',
        };
      },
      run:writes,
    }),
  }));
  const app=new Hono<{Bindings:Env}>();
  app.route('/',routes);
  const run=()=>app.fetch(new Request('http://localhost/xapi/statements',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({
      matricula_id:101,actor:{name:'QA'},
      verb:{id:'http://adlnet.gov/expapi/verbs/passed'},
      object:{id:'airtrust:course:9'},
      result:{completion:true,success:true,score:{raw:100,max:100}},
    }),
  }),{DB:{prepare},BUCKET:{}} as unknown as Env,{} as ExecutionContext);
  return {run,writes,prepare};
}
describe('Score V4 SCORM study-only cannot be certified by xAPI',()=>{
  beforeEach(()=>admissionMock.mockReset());
  for(const kind of ['SCORM_STUDY','BLOCKED'] as const){
    it('denies '+kind+' before any persisted xAPI evidence or qualification',async()=>{
      admissionMock.mockResolvedValue({kind,reason:'STUDY_ONLY'});
      const {run,writes}=createApp();
      const response=await run();
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        success:false,code:'SCORM_STUDY_REQUIRES_SCORM_COMMIT',
      });
      expect(writes).not.toHaveBeenCalled();
      expect(admissionMock).toHaveBeenCalledWith(expect.objectContaining({
        tenant:6,course:9,reviewedForProduction:false,
      }));
    });
  }
});
