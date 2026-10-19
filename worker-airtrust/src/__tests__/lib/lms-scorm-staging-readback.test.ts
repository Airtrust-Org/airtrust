import { describe, it, expect } from 'vitest';
import {assertScormQaReadbackAccess,readScormQaBackendEvidence}
  from '../../lib/lms/lms-scorm-staging-readback';

const secret='test-staging-f5-readback-secret-at-least-32-characters';
const access=()=>({
  environment:'staging',tenantId:997,authorizedTenant:'997',
  secret,providedSecret:secret,runtimeSha:'b'.repeat(40),
});
const qsha='c'.repeat(64),pkg='123e4567-e89b-42d3-a456-426614174001';
function dbMock({binding=true,history=[],candidate=true,table=true,
  launchedSha=qsha,committedSha=qsha}:{
  binding?:boolean;history?:Array<{id:number;certificado_arquivo_id:number|null}>;
  candidate?:boolean;table?:boolean;
  launchedSha?:string|null;committedSha?:string|null;
}={}){
  const statements:{sql:string;args:unknown[]}[]=[];
  const fake={
    prepare(sql:string){
      const record={sql,args:[] as unknown[]}; statements.push(record);
      return {bind(...args:unknown[]){record.args=args;return this;},
        async first(){
          if(sql.includes('FROM lms_scorm_package_versions p'))
            return candidate?{id:pkg,empresa_id:997,curso_id:15,package_sha256:qsha,
              r2_prefix:'lms/scorm/997/15/_candidates/'+pkg+'/',
              launch_file:'index.html',scorm_versao:'1.2',status:'VALIDATED',
              active_prefix:'lms/scorm/997/15/_active/'}:null;
          if(sql.includes('sqlite_master'))return table?{name:'lms_scorm_qa_evidence_bindings'}:null;
          if(sql.includes('FROM lms_scorm_qa_evidence_bindings b'))
            return binding?{ciclo_id:555,staging_runtime_sha:'b'.repeat(40),
              approval_receipt_sha256:'f'.repeat(64),run_id:pkg,
              expires_at:'2999-01-01',
              launched_package_sha256:launchedSha,
              last_committed_package_sha256:committedSha,
              matricula_status:'EM_ANDAMENTO',numero_ciclo:1}:null;
          if(sql.includes('FROM lms_progresso_scorm'))
            return {cmi_json:'{"cmi":"real"}',suspend_data:'resume-01',lesson_status:'incomplete',
              completion_status:null,success_status:null,score_raw:null,
              session_count:2,last_commit_at:'2026-10-19T12:00:00Z'};
          return null;
        },
        async all(){return {results:history};},
      };
    },
  };
  return {db:fake as unknown as D1Database,statements};
}
describe('SCORM staging-only readback (no package activation or mutation)',()=>{
  it('denies prod, missing secret, other tenants, stale SHA',()=>{
    expect(()=>assertScormQaReadbackAccess(access())).not.toThrow();
    for(const bad of [
      {environment:'production'}, {secret:undefined},
      {providedSecret:'wrong'}, {authorizedTenant:'998'},
      {runtimeSha:'not-a-commit'}, {tenantId:998},
    ])expect(()=>assertScormQaReadbackAccess({...access(),...bad})).toThrow();
  });
  it('fails closed without governed Schema V2 binding table or exact binding',async()=>{
    for(const cfg of [{table:false},{binding:false},{candidate:false},
      {launchedSha:null},{committedSha:'0'.repeat(64)}]){
      const {db}=dbMock(cfg);
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow();
    }
  });
  it('never returns CMI content or answers and binds every D1 query to tenant',async()=>{
    const {db,statements}=dbMock({history:[{id:700,certificado_arquivo_id:900}]});
    const result=await readScormQaBackendEvidence({
      db,empresaId:997,cursoId:15,packageId:pkg,packageSha256:qsha,
      matriculaId:88,runtimeSha:'b'.repeat(40),
    });
    expect(result.source).toBe('WORKER_D1_STAGING_READBACK');
    expect(result.cycleId).toBe(555);
    expect(result.servedPackageSha256).toBe(qsha);
    expect(result.committedPackageSha256).toBe(qsha);
    expect(result.qualificationHistoryId).toBe(700);
    expect(result.certificateDocument?.documentId).toBe('900');
    expect(result.certificateDocument?.sha256).toBeNull();
    expect(result.cmiSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('resume-01');
    expect(JSON.stringify(result)).not.toContain('real');
    expect(statements.filter(s=>s.sql.includes('FROM qualificacoes_historico'))[0].args)
      .toEqual([997,88,555]);
    expect(statements.some(s=>/\b(?:INSERT|UPDATE|DELETE)\b/i.test(s.sql))).toBe(false);
  });
  it('rejects duplicate qualification instead of passing synthetic replay',async()=>{
    const {db}=dbMock({history:[{id:700,certificado_arquivo_id:900},
      {id:701,certificado_arquivo_id:901}]});
    await expect(readScormQaBackendEvidence({db,empresaId:997,
      cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)})).rejects.toThrow(/DUPLICATE_QUALIFICATION/);
  });
});
