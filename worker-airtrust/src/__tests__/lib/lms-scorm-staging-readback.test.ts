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
  syntheticEmployee=true,syntheticEnrollment=true,unpublishedCourse=true,
  incompleteEnrollment=true,incompleteCycle=true,
  enrollmentProgressPct=1,enrollmentCompletedAt=null,
  launchedSha=qsha,committedSha=qsha,
  enrollmentScoreFinal=null,enrollmentQualificationHistoryId=null,
  scormScoreRaw=null,scormScoreMax=null,scormScoreMin=null,scormScoreScaled=null,
  enrollmentAttempts=0,cycleAttempts=0,cycleScoreFinal=null,
  cycleQualificationHistoryId=null,xapiCount=0,xapiUnavailable=false,
  qualificationCount=undefined,qualificationUnavailable=false,
  scormCmiJson='{"cmi":"real"}',scormSuspendData='resume-01',
  lessonStatus='incomplete',completionStatus=null,successStatus=null,
  scormSessionCount=2,scormLastCommitAt='2026-10-19T12:00:00Z'}:{
  binding?:boolean;history?:Array<{id:number;certificado_arquivo_id:number|null}>;
  candidate?:boolean;table?:boolean;
  syntheticEmployee?:boolean;syntheticEnrollment?:boolean;unpublishedCourse?:boolean;
  incompleteEnrollment?:boolean;incompleteCycle?:boolean;
  enrollmentProgressPct?:number|null;enrollmentCompletedAt?:string|null;
  launchedSha?:string|null;committedSha?:string|null;
  enrollmentScoreFinal?:number|null;enrollmentQualificationHistoryId?:number|null;
  scormScoreRaw?:number|null;scormScoreMax?:number|null;
  scormScoreMin?:number|null;scormScoreScaled?:number|null;
  enrollmentAttempts?:number;cycleAttempts?:number;cycleScoreFinal?:number|null;
  cycleQualificationHistoryId?:number|null;
  xapiCount?:number|null;xapiUnavailable?:boolean;
  qualificationCount?:number|null;qualificationUnavailable?:boolean;
  scormCmiJson?:string|null;scormSuspendData?:string|null;
  lessonStatus?:string|null;completionStatus?:string|null;successStatus?:string|null;
  scormSessionCount?:number|null;scormLastCommitAt?:string|null;
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
          if(sql.includes('FROM lms_scorm_qa_evidence_bindings b')) {
            if(!table)throw new Error('D1_ERROR: no such table: lms_scorm_qa_evidence_bindings');
            // Simulate D1 JOIN/WHERE predicates: if the guard is removed,
            // a contaminated fixture would incorrectly return a binding.
            const guarded =
              (syntheticEmployee || !sql.includes("f.nome LIKE 'QA-PARTICIPANTE-%'")) &&
              (syntheticEnrollment || !sql.includes("m.observacoes = 'QA_SCORM_F0:' || b.run_id")) &&
              (unpublishedCourse || !sql.includes('c.publicado = 0')) &&
              (incompleteEnrollment || !sql.includes("m.status IN ('NAO_INICIADO','EM_ANDAMENTO')")) &&
              (incompleteCycle || !sql.includes("cy.status IN ('NAO_INICIADO','EM_ANDAMENTO')"));
            return binding && guarded?{ciclo_id:555,staging_runtime_sha:'b'.repeat(40),
              approval_receipt_sha256:'f'.repeat(64),run_id:pkg,
              expires_at:'2999-01-01',
              launched_package_sha256:launchedSha,
              last_committed_package_sha256:committedSha,
              matricula_status:'EM_ANDAMENTO',numero_ciclo:1,
              enrollment_progress_pct:enrollmentProgressPct,
              enrollment_completed_at:enrollmentCompletedAt,
              enrollment_score_final:enrollmentScoreFinal,
              enrollment_qualification_history_id:enrollmentQualificationHistoryId,
              enrollment_attempts:enrollmentAttempts,cycle_attempts:cycleAttempts,
              cycle_score_final:cycleScoreFinal,
              cycle_qualification_history_id:cycleQualificationHistoryId}:null;
          }
          if(sql.includes('FROM lms_xapi_statements')) {
            if (xapiUnavailable) throw new Error('D1_ERROR: xAPI unavailable');
            return xapiCount === null ? null : {total:xapiCount};
          }
          if(sql.includes('FROM qualificacoes_historico')) {
            if (qualificationUnavailable) throw new Error('D1_ERROR: qualification unavailable');
            const total=qualificationCount === undefined ? history.length : qualificationCount;
            return total === null ? null : {total};
          }
          if(sql.includes('FROM lms_progresso_scorm'))
            return {cmi_json:scormCmiJson,suspend_data:scormSuspendData,lesson_status:lessonStatus,
              completion_status:completionStatus,success_status:successStatus,score_raw:scormScoreRaw,
              score_max:scormScoreMax,score_min:scormScoreMin,score_scaled:scormScoreScaled,
              session_count:scormSessionCount,last_commit_at:scormLastCommitAt};
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
  it('rejects a synthetic flag attached to a non-QA learner, course or cycle',async()=>{
    for (const bad of [
      {syntheticEmployee:false}, {syntheticEnrollment:false},
      {unpublishedCourse:false}, {incompleteEnrollment:false},
      {incompleteCycle:false},
    ]) {
      const {db}=dbMock(bad);
      await expect(readScormQaBackendEvidence({db,empresaId:997,
        cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)}))
        .rejects.toThrow(/SCORM_QA_F0_BINDING_WITNESS_INVALID/);
    }
    const {db,statements}=dbMock();
    await readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
      packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)});
    const query=statements.find(row=>row.sql.includes('FROM lms_scorm_qa_evidence_bindings b'));
    expect(query?.sql).toContain("f.nome LIKE 'QA-PARTICIPANTE-%'");
    expect(query?.sql).toContain("m.observacoes = 'QA_SCORM_F0:' || b.run_id");
    expect(query?.sql).toContain('c.publicado = 0');
    expect(query?.sql).toContain("m.status IN ('NAO_INICIADO','EM_ANDAMENTO')");
    expect(query?.sql).toContain("cy.status IN ('NAO_INICIADO','EM_ANDAMENTO')");
    expect(query?.args).toEqual([997,15,pkg,qsha,88,'b'.repeat(40)]);
  });
  it('requires exact package provenance for timestamp-only SCORM commits',async()=>{
    const emptyProgress={scormCmiJson:null,scormSuspendData:null,
      scormSessionCount:0,scormLastCommitAt:'2026-10-19T12:00:00Z'};
    // The binding witness already rejects non-matching hashes. These two
    // cases are witness-valid yet had an unproven commit edition when only
    // last_commit_at was persisted.
    for(const mismatch of [
      {committedSha:null}, {launchedSha:null,committedSha:null},
    ]) {
      const {db}=dbMock({...emptyProgress,...mismatch});
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_COMMIT_EDITION_UNPROVEN/);
    }
    // A genuinely pristine row without a commit is still readable before
    // the first F0 launch; the new guard must not invent a prior commit.
    const {db}=dbMock({...emptyProgress,scormLastCommitAt:null,
      launchedSha:null,committedSha:null});
    const result=await readScormQaBackendEvidence({db,empresaId:997,
      cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)});
    expect(result.lastCommitAt).toBeNull();
    expect(result.committedPackageSha256).toBeNull();
  });
  it('never returns CMI content or answers and binds every D1 query to tenant',async()=>{
    const {db,statements}=dbMock();
    const result=await readScormQaBackendEvidence({
      db,empresaId:997,cursoId:15,packageId:pkg,packageSha256:qsha,
      matriculaId:88,runtimeSha:'b'.repeat(40),
    });
    expect(result.source).toBe('WORKER_D1_STAGING_READBACK');
    expect(result.cycleId).toBe(555);
    // ISO-8601 and SQLite datetime text do not sort chronologically.
    // Comparing numeric Julian days is mandatory for candidate expiry.
    expect(statements.find(s=>s.sql.includes('FROM lms_scorm_qa_evidence_bindings b'))?.sql)
      .toContain("julianday(b.expires_at) > julianday('now')");
    expect(result.servedPackageSha256).toBe(qsha);
    expect(result.committedPackageSha256).toBe(qsha);
    expect(result.qualificationHistoryCount).toBe(0);
    expect(result.qualificationHistoryId).toBeNull();
    expect(result.certificateDocument).toBeNull();
    expect(result.cmiSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('resume-01');
    expect(JSON.stringify(result)).not.toContain('real');
    const qualificationQuery=statements.find(s=>s.sql.includes('FROM qualificacoes_historico'));
    expect(qualificationQuery?.args).toEqual([997,88]);
    expect(qualificationQuery?.sql).not.toMatch(/deleted_at|lms_matricula_ciclo_id/);
    const xapiQuery = statements.find(s=>s.sql.includes('FROM lms_xapi_statements'));
    expect(xapiQuery?.sql).toMatch(/WHERE empresa_id = \? AND matricula_id = \?/);
    expect(xapiQuery?.args).toEqual([997,88]);
    expect(statements.some(s=>/\b(?:INSERT|UPDATE|DELETE)\b/i.test(s.sql))).toBe(false);
    expect(statements.some(s=>s.sql.includes('sqlite_master'))).toBe(false);
  });
  it('rejects every independently stored grade and enrollment qualification link',async()=>{
    for (const contaminated of [
      {enrollmentScoreFinal:0},
      {enrollmentQualificationHistoryId:901},
      {scormScoreRaw:0},
      {scormScoreMax:100},
      {scormScoreMin:0},
      {scormScoreScaled:0.9},
      {cycleScoreFinal:0},
      {cycleQualificationHistoryId:701},
    ]) {
      const {db}=dbMock(contaminated);
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_GRADED_STATE_PRESENT/);
    }
  });
  it('rejects stale completion progress/date despite incomplete enrollment status',async()=>{
    for (const contaminated of [
      {enrollmentProgressPct:2}, {enrollmentProgressPct:100},
      {enrollmentProgressPct:-1}, {enrollmentProgressPct:null},
      {enrollmentProgressPct:0.5}, {enrollmentProgressPct:Number.NaN},
      {enrollmentCompletedAt:'2026-10-19T12:00:00Z'},
    ]) {
      const {db}=dbMock(contaminated);
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)}))
        .rejects.toThrow(/SCORM_QA_ENROLLMENT_COMPLETION_STATE_PRESENT/);
    }
    for (const enrollmentProgressPct of [0,1]) {
      const {db}=dbMock({enrollmentProgressPct});
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).resolves.toMatchObject({completionStatus:'EM_ANDAMENTO'});
    }
  });
  it('rejects terminal SCORM runtime states despite incomplete enrollment and cycle',async()=>{
    for (const contaminated of [
      {lessonStatus:'completed'}, {lessonStatus:'passed'}, {lessonStatus:'failed'},
      {completionStatus:'completed'}, {successStatus:'passed'},
      {successStatus:'failed'},
    ]) {
      const {db}=dbMock(contaminated);
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_TERMINAL_STATE_PRESENT/);
    }
    const {db}=dbMock({lessonStatus:'incomplete',completionStatus:'incomplete',
      successStatus:'unknown'});
    const row=await readScormQaBackendEvidence({db,empresaId:997,
      cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)});
    expect(row.lessonStatus).toBe('incomplete');
    expect(row.scormCompletionStatus).toBe('incomplete');
    expect(row.successStatus).toBe('unknown');
  });
  it('fails closed on malformed F0 session counts and missing commit time',async()=>{
    for (const scormSessionCount of [null,-1,0.5,Number.NaN,Number.POSITIVE_INFINITY,0]) {
      const {db}=dbMock({scormSessionCount});
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_SESSION_STATE_UNPROVEN/);
    }
    const {db}=dbMock({scormSessionCount:2,scormLastCommitAt:null});
    await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
      packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_SESSION_STATE_UNPROVEN/);
    // Before the first launch, a zero-session empty snapshot is still valid.
    const {db:pristine}=dbMock({scormCmiJson:null,scormSuspendData:null,
      scormSessionCount:0,scormLastCommitAt:null,launchedSha:null,committedSha:null});
    await expect(readScormQaBackendEvidence({db:pristine,empresaId:997,cursoId:15,
      packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)})).resolves.toMatchObject({sessionCount:0,lastCommitAt:null});
  });
  it('rejects persisted enrollment/cycle attempts and foreign xAPI records',async()=> {
    for(const [config,reason] of [
      [{enrollmentAttempts:1},/SCORM_QA_ATTEMPT_STATE_PRESENT/],
      [{cycleAttempts:1},/SCORM_QA_ATTEMPT_STATE_PRESENT/],
      [{xapiCount:1},/SCORM_QA_XAPI_STATE_PRESENT/],
      [{xapiCount:null},/SCORM_QA_XAPI_READBACK_UNPROVEN/],
      [{xapiCount:-1},/SCORM_QA_XAPI_READBACK_UNPROVEN/],
      [{xapiCount:0.5},/SCORM_QA_XAPI_READBACK_UNPROVEN/],
      [{xapiCount:Number.NaN},/SCORM_QA_XAPI_READBACK_UNPROVEN/],
      [{xapiCount:Number.POSITIVE_INFINITY},/SCORM_QA_XAPI_READBACK_UNPROVEN/],
      [{xapiUnavailable:true},/SCORM_QA_XAPI_READBACK_UNAVAILABLE/],
    ] as const) {
      const {db}=dbMock(config);
      await expect(readScormQaBackendEvidence({db,empresaId:997,cursoId:15,
        packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(reason);
    }
  });
  it('rejects any qualification from the enrollment, including archived/other cycles',async()=>{
    for(const history of [
      [{id:700,certificado_arquivo_id:null}],
      [{id:700,certificado_arquivo_id:900}],
      [{id:700,certificado_arquivo_id:900},{id:701,certificado_arquivo_id:901}],
    ]) {
      const {db}=dbMock({history});
      await expect(readScormQaBackendEvidence({db,empresaId:997,
        cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_QUALIFICATION_STATE_PRESENT/);
    }
  });
  it('fails closed for missing, invalid or unavailable qualification counts',async()=>{
    for(const qualificationCount of [null,-1,0.5,Number.NaN,Number.POSITIVE_INFINITY]) {
      const {db}=dbMock({qualificationCount});
      await expect(readScormQaBackendEvidence({db,empresaId:997,
        cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
        runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_QUALIFICATION_READBACK_UNPROVEN/);
    }
    const {db}=dbMock({qualificationUnavailable:true});
    await expect(readScormQaBackendEvidence({db,empresaId:997,
      cursoId:15,packageId:pkg,packageSha256:qsha,matriculaId:88,
      runtimeSha:'b'.repeat(40)})).rejects.toThrow(/SCORM_QA_QUALIFICATION_READBACK_UNAVAILABLE/);
  });
});
