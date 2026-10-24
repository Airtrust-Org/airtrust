import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { provisionScormF0QaBinding } from '../../lib/lms/lms-scorm-f0-staging-provision';
import { commitF0CandidateSuspend, readF0CandidateRuntimeState,
  validateF0IncompleteCommit, witnessF0CandidateLaunch,
} from '../../lib/lms/lms-scorm-f0-staging-runtime';

const SqliteDatabaseSync=createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new(path:string):DatabaseSync;
};
const pkg='12345678-1234-1234-1234-123456789abc';
const run='abcdefab-1234-1234-1234-abcdefabcdef';
const sha='a'.repeat(64);
const runtime='b'.repeat(40);
const now=Date.now();
const scope={
  tenantId:111,courseId:15,packageId:pkg,packageSha256:sha,
  enrollmentId:23,runtimeSha:runtime,
};
const bindingInput={
  ...scope,cycleId:24,runId:run,approvalReceiptSha256:'c'.repeat(64),
  expiresAt:new Date(now+30*60_000).toISOString(),
  grantId:'6378307802',actorId:3,
};
function fixture(){
  const db=new SqliteDatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE lms_cursos(
      id INTEGER PRIMARY KEY,empresa_id INTEGER,titulo TEXT,publicado INTEGER,
      ativo INTEGER,scorm_package_r2_prefix TEXT,deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,nome TEXT,deleted_at TEXT);
    CREATE TABLE lms_matriculas(
      id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,
      status TEXT,observacoes TEXT,qualificacao_historico_id INTEGER,
      score_final REAL,progresso_pct REAL,tentativas INTEGER,deleted_at TEXT,
      data_inicio TEXT,updated_at TEXT);
    CREATE TABLE lms_matricula_ciclos(
      id INTEGER PRIMARY KEY,matricula_id INTEGER,empresa_id INTEGER,curso_id INTEGER,
      ciclo_atual INTEGER,numero_ciclo INTEGER,status TEXT,deleted_at TEXT,updated_at TEXT);
    CREATE TABLE lms_scorm_package_versions(
      id TEXT PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      package_sha256 TEXT,r2_prefix TEXT,status TEXT);
    CREATE TABLE lms_progresso_scorm(
      matricula_id INTEGER PRIMARY KEY,empresa_id INTEGER,
      lesson_status TEXT,completion_status TEXT,success_status TEXT,
      score_raw REAL,score_max REAL,score_min REAL,score_scaled REAL,
      session_time TEXT,total_time TEXT,suspend_data TEXT,launch_data TEXT,
      cmi_json TEXT,session_count INTEGER,last_commit_at TEXT,updated_at TEXT);
    CREATE TABLE qualificacoes_historico(
      id INTEGER PRIMARY KEY,empresa_id INTEGER,lms_matricula_id INTEGER,deleted_at TEXT);
    CREATE TABLE audit_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,
      action TEXT,entity_type TEXT,entity_id INTEGER,old_values TEXT,
      new_values TEXT,empresa_id INTEGER,created_at TEXT);
  `);
  db.exec(readFileSync(fileURLToPath(new URL(
    '../../../schema-v2/changes/0568_lms_scorm_qa_evidence_bindings.sql',
    import.meta.url).href),'utf8'));
  db.prepare('INSERT INTO lms_cursos(id,empresa_id,titulo,publicado,ativo) VALUES(15,111,?,0,1)')
    .run('QA SCORM F0 synthetic');
  db.prepare('INSERT INTO funcionarios(id,empresa_id,nome) VALUES(41,111,?)')
    .run('QA-PARTICIPANTE-ALFA');
  db.prepare(`INSERT INTO lms_scorm_package_versions
    (id,empresa_id,curso_id,package_sha256,r2_prefix,status)
    VALUES(?,111,15,?,?,'VALIDATED')`)
    .run(pkg,sha,`lms/scorm/111/15/_candidates/${pkg}/`);
  db.prepare(`INSERT INTO lms_matriculas
    (id,empresa_id,curso_id,funcionario_id,status,observacoes,progresso_pct,tentativas)
    VALUES(23,111,15,41,'NAO_INICIADO',?,0,0)`).run(`QA_SCORM_F0:${run}`);
  db.exec(`INSERT INTO lms_matricula_ciclos
    (id,matricula_id,empresa_id,curso_id,ciclo_atual,numero_ciclo,status)
    VALUES(24,23,111,15,1,1,'NAO_INICIADO')`);
  class Prepared {
    constructor(private query:string,private vals:unknown[]=[]){}
    bind(...v:unknown[]){return new Prepared(this.query,v);}
    run(){
      if(/^\s*SELECT\b/i.test(this.query)) {
        const results=db.prepare(this.query).all(...this.vals as (string|number|null)[]);
        return {meta:{changes:0},results};
      }
      const data=db.prepare(this.query).run(...this.vals as (string|number|null)[]);
      return {meta:{changes:Number(data.changes)},results:[]};
    }
    async first<T>(){return (db.prepare(this.query).get(
      ...this.vals as (string|number|null)[])??null) as T|null;}
  }
  class Shim {
    prepare(query:string){return new Prepared(query);}
    async batch(q:Prepared[]){
      db.exec('BEGIN IMMEDIATE');
      try{const result=q.map(statement=>statement.run());
        db.exec('COMMIT');return result;
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
  }
  const count=(table:string)=>Number((db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as {n:number}).n);
  return {db,d1:new Shim() as unknown as D1Database,count};
}
const commitBody=(location:string,suspend:string)=>({
  matricula_id:23,ciclo_id:24,lesson_status:'incomplete',
  completion_status:'incomplete',success_status:'unknown',
  suspend_data:suspend,
  cmi_json:JSON.stringify({
    'cmi.core.lesson_status':'incomplete','cmi.core.lesson_location':location,
    'cmi.suspend_data':suspend,
  }),commit_event:'SCORM_COMMIT',
});

describe('F0 staging-only real candidate launch/commit/resume with Schema V2 0568',()=>{
  it('records server launch and two actual suspend commits without activation, grades or certificates',async()=>{
    const f=fixture();
    try{
      await provisionScormF0QaBinding(f.d1,bindingInput,now);
      const before=await readF0CandidateRuntimeState(f.d1,scope);
      expect(before.launchedSha).toBeNull();
      await witnessF0CandidateLaunch(f.d1,scope,before);
      const first=await commitF0CandidateSuspend(f.d1,scope,commitBody('1/2','{"step":1}'));
      expect(first).toMatchObject({source:'F0_CANDIDATE_INCOMPLETE_COMMIT_V1',
        sessionCount:1,scoreWritten:false,completionWritten:false,certificateIssued:false});
      const reopened=await readF0CandidateRuntimeState(f.d1,scope);
      expect(reopened.cmiJson).toContain('1/2');
      expect(reopened.suspendData).toBe('{"step":1}');
      const second=await commitF0CandidateSuspend(f.d1,scope,
        commitBody('2/2','{"step":2,"visited":[1,2]}'));
      expect(second.sessionCount).toBe(2);
      const resumed=await readF0CandidateRuntimeState(f.d1,scope);
      expect(resumed.cmiJson).toContain('2/2');
      expect(resumed.suspendData).toContain('"step":2');
      expect(resumed.committedSha).toBe(sha);
      expect(f.count('lms_progresso_scorm')).toBe(1);
      expect(f.count('qualificacoes_historico')).toBe(0);
      const enroll=f.db.prepare('SELECT status,score_final,qualificacao_historico_id FROM lms_matriculas WHERE id=23')
        .get() as Record<string,unknown>;
      expect(enroll).toMatchObject({status:'EM_ANDAMENTO',score_final:null,qualificacao_historico_id:null});
      expect((f.db.prepare('SELECT scorm_package_r2_prefix as p FROM lms_cursos WHERE id=15')
        .get() as {p:string|null}).p).toBeNull();
      expect(f.count('audit_logs')).toBe(4);
    }finally{f.db.close();}
  });
  it('rejects commits before candidate launch, foreign scope, terminal grade, forged CMI and cycle',async()=>{
    const f=fixture();
    try{
      await provisionScormF0QaBinding(f.d1,bindingInput,now);
      await expect(commitF0CandidateSuspend(f.d1,scope,commitBody('1/2','hello')))
        .rejects.toThrow('SCORM_F0_CANDIDATE_NOT_LAUNCHED');
      const binding=await readF0CandidateRuntimeState(f.d1,scope);
      await witnessF0CandidateLaunch(f.d1,scope,binding);
      for(const row of [
        {...commitBody('1/2','state'),lesson_status:'passed'},
        {...commitBody('1/2','state'),score_raw:100},
        {...commitBody('1/2','state'),ciclo_id:22},
        {...commitBody('1/2','state'),cmi_json:JSON.stringify({'cmi.core.lesson_status':'passed'})},
      ]) await expect(commitF0CandidateSuspend(f.d1,scope,row)).rejects.toThrow();
      await expect(readF0CandidateRuntimeState(f.d1,{...scope,tenantId:112}))
        .rejects.toThrow('SCORM_F0_RUNTIME_BINDING_OR_EDITION_INVALID');
      expect(f.count('lms_progresso_scorm')).toBe(0);
      expect(f.count('qualificacoes_historico')).toBe(0);
      expect(f.count('audit_logs')).toBe(2);
    }finally{f.db.close();}
  });
  it('rolls back the entire D1 batch when the current synthetic cycle cannot update',async()=>{
    const f=fixture();
    try{
      await provisionScormF0QaBinding(f.d1,bindingInput,now);
      const original=await readF0CandidateRuntimeState(f.d1,scope);
      await witnessF0CandidateLaunch(f.d1,scope,original);
      // Deliberately change the cycle status after F0 launch to reproduce a
      // concurrent state change. Previously the binding and CMI could commit
      // while the cycle update touched zero rows, then JS threw too late.
      f.db.exec("UPDATE lms_matricula_ciclos SET status='CONCLUIDO' WHERE id=24");
      await expect(commitF0CandidateSuspend(f.d1,scope,commitBody('1/2','held')))
        .rejects.toThrow();
      const row=f.db.prepare(`SELECT last_committed_package_sha256 AS committed
        FROM lms_scorm_qa_evidence_bindings LIMIT 1`).get() as {committed:string|null};
      expect(row.committed).toBeNull();
      expect(f.count('lms_progresso_scorm')).toBe(0);
      expect(f.count('audit_logs')).toBe(2); // bind + launch, no commit audit
      expect((f.db.prepare('SELECT status FROM lms_matriculas WHERE id=23')
        .get() as {status:string}).status).toBe('NAO_INICIADO');
    }finally{f.db.close();}
  });
  it('rejects bad CMI payloads and enforces candidate edition immutability',()=>{
    expect(()=>validateF0IncompleteCommit({...commitBody('1/2','state'),cmi_json:'not-json'},23,24))
      .toThrow('SCORM_F0_CMI_INVALID');
    expect(()=>validateF0IncompleteCommit({...commitBody('1/2','state'),
      cmi_json:JSON.stringify({'cmi.core.score.raw':'100'})},23,24))
      .toThrow('SCORM_F0_TERMINAL_OR_SCORE_FORBIDDEN');
  });
});
