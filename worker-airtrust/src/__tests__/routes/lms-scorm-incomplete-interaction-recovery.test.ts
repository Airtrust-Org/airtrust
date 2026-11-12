import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../middleware/error-handler';
import type { Env } from '../../types';

const mocks = vi.hoisted(() => ({
  manifest: vi.fn(),
  resolveFuncionario: vi.fn(),
}));
vi.mock('../../services/lms-completion-manifest-evidence', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/lms-completion-manifest-evidence')>(),
  readActiveCompletionManifest: mocks.manifest,
}));
vi.mock('../../services/lms-learner-identity', () => ({
  resolveLmsFuncionarioId: mocks.resolveFuncionario,
}));
import { registerLmsIncompleteInteractionRecoveryRoute } from
  '../../routes/lms-scorm-incomplete-interaction-recovery';

const prefix = 'lms/scorm/17/68/_candidates/synthetic/';
const ids = ['intro','missing-scenario','study','end'];
const model = {
  packageVersion:'edition-A',
  slides:[
    {id:'intro',kind:'lesson'},
    {id:'missing-scenario',kind:'scenario',requiredDecision:true},
    {id:'study',kind:'lesson'},
    {id:'end',kind:'study_end'},
  ],
};
function row() {
  const suspend = JSON.stringify({v:4,p:'edition-A',a:3,d:[0,1,2],s:{},g:[],h:{},vs:{},q:{},c:false});
  return {
    id:2058,curso_id:68,funcionario_id:37,status:'EM_ANDAMENTO',
    scorm_assessment_policy:'FORMATIVE',scorm_package_r2_prefix:prefix,
    cmi_json:JSON.stringify({
      'cmi.suspend_data':suspend,'cmi.core.lesson_status':'incomplete',
      'cmi.core.lesson_location':'4/4','airtrust.total_slides':4,
    }),
    suspend_data:suspend,lesson_status:'incomplete',
  };
}
function fakeDb(enrollment: ReturnType<typeof row> | null) {
  const statements: Array<{sql:string; args:unknown[]}> = [];
  const db = {
    prepare(sql:string) {
      const stmt = {sql,args:[] as unknown[]};
      statements.push(stmt);
      const api = {
        bind(...values:unknown[]) {stmt.args=values;return api;},
        async first(){return enrollment;},
      };
      return api;
    },
    batch:vi.fn(async () => statements.slice(-3).map(() => ({
      success:true,meta:{changes:1},
    }))),
  };
  return {db:db as unknown as D1Database,batch:db.batch,statements};
}
function fixture(opts:{role?:string;enrollment?:ReturnType<typeof row>|null}={}) {
  const app = new Hono<{Bindings:Env}>();
  app.onError(errorHandler);
  app.use('*',async (c,next) => {
    c.set('empresaId' as never,17 as never);
    c.set('userId' as never,81 as never);
    c.set('userRole' as never,(opts.role??'admin') as never);
    await next();
  });
  registerLmsIncompleteInteractionRecoveryRoute(app);
  const {db,batch,statements}=fakeDb(opts.enrollment===undefined?row():opts.enrollment);
  const bucket={
    get:vi.fn(async () => ({
      size:300,text:async()=>`window.COURSE_DATA=${JSON.stringify(model)};`,
    })),
  };
  const env = {
    DB:db,BUCKET:bucket as unknown as R2Bucket,
    LMS_SCORM_EDITION_HANDOFF_ENABLED:'true',
  } as Env;
  const post=()=>app.request('/2058/scorm-missing-interactions-recover',
    {method:'POST'},env);
  return {post,batch,bucket,statements};
}
describe('authenticated recovery of missing authored interactions', () => {
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.manifest.mockResolvedValue({
      packageVersion:'edition-A',requiredSlideIds:ids,
      assessmentMode:'NONE',workerApprovalRequired:true,
    });
    mocks.resolveFuncionario.mockResolvedValue(37);
  });
  it('rewinds only missing proof, writes no score, completion or certificate, and audits',async()=>{
    const t=fixture();
    const response=await t.post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success:true,data:{resume_position:2,missing_scenarios:1,qualification_granted:false},
    });
    expect(t.batch).toHaveBeenCalledTimes(1);
    const updates=t.statements.slice(-3);
    expect(updates[0].sql).toContain('UPDATE lms_progresso_scorm');
    expect(updates[1].sql).toContain('UPDATE lms_matriculas');
    expect(updates[2].sql).toContain('SCORM_MISSING_DECISION_RECOVERY');
    const cmi=JSON.parse(String(updates[0].args[0]));
    expect(cmi['cmi.core.lesson_status']).toBe('incomplete');
    expect(JSON.parse(cmi['cmi.suspend_data']).d).toEqual([0,2]);
    expect(JSON.parse(cmi['cmi.suspend_data']).s).toEqual({});
  });
  it('rejects foreign learner and performs no writes',async()=>{
    mocks.resolveFuncionario.mockResolvedValue(99);
    const t=fixture({role:'ALUNO'});
    expect((await t.post()).status).toBe(403);
    expect(t.batch).not.toHaveBeenCalled();
  });
  it('rejects already-completed enrollment without mutation',async()=>{
    const t=fixture({enrollment:{...row(),status:'CONCLUIDO'}});
    expect((await t.post()).status).toBe(409);
    expect(t.batch).not.toHaveBeenCalled();
  });
  it('rejects missing R2 manifest or course mismatch without mutation',async()=>{
    mocks.manifest.mockResolvedValue(null);
    const t=fixture();
    expect((await t.post()).status).toBe(409);
    expect(t.batch).not.toHaveBeenCalled();
  });
});
