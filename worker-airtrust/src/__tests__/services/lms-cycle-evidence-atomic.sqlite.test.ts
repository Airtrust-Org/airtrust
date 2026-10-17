import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {SqliteD1Database} from '../helpers/qualification-history-sqlite-d1';
import {resetMatriculaForNewCycle} from '../../services/lms-matricula-cycle';

const opened: SqliteD1Database[] = [];
afterEach(()=>{for(const db of opened.splice(0))db.close()});

function fixture(withMigration=true) {
  const db=new SqliteD1Database(); opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY,empresa_id INTEGER,scorm_package_r2_prefix TEXT);
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,
      status TEXT,deleted_at TEXT,observacoes TEXT,data_matricula TEXT,data_inicio TEXT,
      data_conclusao TEXT,data_expiracao TEXT,progresso_pct INTEGER,score_final INTEGER,
      tentativas INTEGER,qualificacao_historico_id INTEGER,matriculado_por INTEGER,
      ultimo_slide INTEGER,ultima_pagina INTEGER,created_at TEXT,updated_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,curso_id INTEGER,
      funcionario_id INTEGER,numero_ciclo INTEGER,origem TEXT,status TEXT,ciclo_atual INTEGER,
      deleted_at TEXT,observacoes TEXT,data_matricula TEXT,progresso_pct INTEGER,
      tentativas INTEGER,created_at TEXT,updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_test_current ON lms_matricula_ciclos(matricula_id)
      WHERE ciclo_atual=1 AND deleted_at IS NULL;
    CREATE TABLE lms_progresso_scorm (
      matricula_id INTEGER,empresa_id INTEGER,lesson_status TEXT,lesson_location TEXT,
      completion_status TEXT,success_status TEXT,score_raw REAL,score_min REAL,
      score_max REAL,score_scaled REAL,session_time TEXT,total_time TEXT,
      suspend_data TEXT,launch_data TEXT,cmi_json TEXT,session_count INTEGER,
      last_commit_at TEXT,updated_at TEXT
    );
    CREATE TABLE lms_xapi_statements (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,actor_json TEXT,
      verb_id TEXT,verb_display TEXT,object_id TEXT,object_type TEXT,result_json TEXT,
      context_json TEXT,timestamp TEXT,created_at TEXT
    );
    CREATE TABLE lms_completion_diagnostics_snapshots (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,
      tentativa INTEGER,diagnostics_json TEXT
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity_type TEXT,
      entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT
    );
    INSERT INTO lms_cursos VALUES (34,1,'lms/scorm/1/34/v1');
    INSERT INTO lms_matriculas VALUES
      (384,1,34,77,'CONCLUIDO',NULL,'evidencia original','2026-10-01',
       '2026-10-02','2026-10-03',NULL,100,93,2,700,NULL,41,41,
       '2026-10-01','2026-10-03');
    INSERT INTO lms_matricula_ciclos
      (id,empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,
       origem,status,ciclo_atual,progresso_pct,tentativas)
      VALUES(99,1,384,34,77,1,'LMS','CONCLUIDO',1,100,2);
    INSERT INTO lms_progresso_scorm
      (matricula_id,empresa_id,lesson_status,lesson_location,completion_status,
       success_status,score_raw,suspend_data,cmi_json,session_count)
      VALUES(384,1,'passed','41/41','completed','passed',93,'opaque-old-state',
        '{"cmi.core.lesson_location":"41/41"}',2);
    INSERT INTO lms_xapi_statements
      (id,empresa_id,matricula_id,actor_json,verb_id,object_id,created_at)
      VALUES(500,1,384,'{}','https://example.test/passed','urn:test','2026-10-03');
    INSERT INTO lms_completion_diagnostics_snapshots
      VALUES(8,1,384,2,'{"explanation":"historical"}');
  `);
  if(withMigration){
    const sql=readFileSync(resolve(process.cwd(),'migrations/0557_lms_cycle_evidence_archive.sql'),'utf8');
    db.database.exec(sql);
  }
  return db;
}
function one(db:SqliteD1Database,sql:string){
  return db.database.prepare(sql).get() as Record<string,unknown>;
}
const reset=(db:SqliteD1Database,tenant=1)=>resetMatriculaForNewCycle(db.asD1(),{
  empresaId:tenant,matriculaId:384,origin:'AUTO_RENOVACAO',observacoes:'Renovação anual'});
describe('LMS immutable cycle evidence, D1 SQLite transaction',()=>{
  it('archives SCORM/diagnostics, retains xAPI original, and isolates the new active cycle',async()=>{
    const db=fixture();
    expect(await reset(db)).toBeGreaterThan(99);
    expect(one(db,"SELECT status,progresso_pct,qualificacao_historico_id FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'NAO_INICIADO',progresso_pct:0,qualificacao_historico_id:null});
    expect(one(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500"))
      .toEqual({archived_cycle_id:99});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_xapi_statements WHERE matricula_id=384"))
      .toEqual({n:1});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_xapi_statements WHERE archived_cycle_id IS NULL"))
      .toEqual({n:0});
    const archived=one(db,'SELECT enrollment_json,scorm_json,diagnostics_json,course_package_prefix FROM lms_ciclo_evidencias WHERE ciclo_id=99');
    expect(JSON.parse(String(archived.enrollment_json))).toMatchObject({status:'CONCLUIDO',progresso_pct:100,qualificacao_historico_id:700});
    expect(JSON.parse(String(archived.scorm_json))).toMatchObject({lesson_status:'passed',suspend_data:'opaque-old-state',score_raw:93});
    expect(JSON.parse(String(archived.diagnostics_json))).toEqual([{tentativa:2,diagnostics_json:'{"explanation":"historical"}'}]);
    expect(archived.course_package_prefix).toBe('lms/scorm/1/34/v1');
    expect(one(db,"SELECT cmi_json,lesson_status FROM lms_progresso_scorm WHERE matricula_id=384"))
      .toEqual({cmi_json:null,lesson_status:null});
    expect(one(db,"SELECT ciclo_atual,status FROM lms_matricula_ciclos WHERE id=99"))
      .toEqual({ciclo_atual:0,status:'CONCLUIDO'});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_matricula_ciclos WHERE matricula_id=384 AND ciclo_atual=1"))
      .toEqual({n:1});
    expect(one(db,"SELECT COUNT(*) AS n FROM audit_logs WHERE action='LMS_CYCLE_ATOMIC_RENEWAL'"))
      .toEqual({n:1});
  });
  it('prevents mutation/deletion of archived xAPI and immutable snapshots',async()=>{
    const db=fixture();
    await reset(db);
    expect(()=>db.database.exec("UPDATE lms_ciclo_evidencias SET scorm_json='{}' WHERE ciclo_id=99"))
      .toThrow('LMS_CYCLE_EVIDENCE_IMMUTABLE');
    expect(()=>db.database.exec("DELETE FROM lms_ciclo_evidencias WHERE ciclo_id=99"))
      .toThrow('LMS_CYCLE_EVIDENCE_IMMUTABLE');
    expect(()=>db.database.exec("UPDATE lms_xapi_statements SET archived_cycle_id=NULL WHERE id=500"))
      .toThrow('LMS_XAPI_HISTORICAL_IMMUTABLE');
    expect(()=>db.database.exec("DELETE FROM lms_xapi_statements WHERE id=500"))
      .toThrow('LMS_XAPI_HISTORICAL_IMMUTABLE');
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_xapi_statements WHERE id=500"))
      .toEqual({n:1});
  });
  it('enforces xAPI archived cycle tenant and matrícula match in D1',async()=>{
    const db=fixture();
    db.database.exec("INSERT INTO lms_matricula_ciclos (id,empresa_id,matricula_id,numero_ciclo,origem,status,ciclo_atual) VALUES(200,2,888,1,'LMS','CONCLUIDO',1)");
    expect(()=>db.database.exec("UPDATE lms_xapi_statements SET archived_cycle_id=200 WHERE id=500"))
      .toThrow('LMS_XAPI_ARCHIVE_TENANT_CYCLE_MISMATCH');
    expect(one(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500"))
      .toEqual({archived_cycle_id:null});
  });
  it('rejects missing Schema V2 and rolls back every operation',async()=>{
    const db=fixture(false);
    await expect(reset(db)).rejects.toThrow();
    expect(one(db,"SELECT status,progresso_pct FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'CONCLUIDO',progresso_pct:100});
    expect(one(db,"SELECT COUNT(*) AS n FROM audit_logs")).toEqual({n:0});
  });
  it('rolls back archive and marker when late write fails',async()=>{
    const db=fixture();
    db.database.exec(`CREATE TRIGGER reject_new_cycle BEFORE INSERT ON lms_matricula_ciclos
      BEGIN SELECT RAISE(ABORT,'SIMULATED_FINAL_WRITE_FAILURE'); END;`);
    await expect(reset(db)).rejects.toThrow('SIMULATED_FINAL_WRITE_FAILURE');
    expect(one(db,"SELECT status,progresso_pct FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'CONCLUIDO',progresso_pct:100});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_ciclo_evidencias")).toEqual({n:0});
    expect(one(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500"))
      .toEqual({archived_cycle_id:null});
    expect(one(db,"SELECT COUNT(*) AS n FROM audit_logs")).toEqual({n:0});
  });
  it('rejects cross-tenant attempts with no archived or mutated evidence',async()=>{
    const db=fixture();
    await expect(reset(db,2)).rejects.toThrow('LMS_CYCLE_ENROLLMENT_NOT_FOUND');
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_ciclo_evidencias")).toEqual({n:0});
    expect(one(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500"))
      .toEqual({archived_cycle_id:null});
  });
  it('a duplicate or concurrent reset cannot open another cycle',async()=>{
    const db=fixture();
    const outcomes=await Promise.allSettled([reset(db),reset(db)]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_ciclo_evidencias")).toEqual({n:1});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_matricula_ciclos")).toEqual({n:2});
    await expect(reset(db)).rejects.toThrow('LMS_CYCLE_ACTIVE_OR_UNKNOWN_STATUS');
  });
  it('preserves xAPI-only H5P history without inventing current cycle progress',async()=>{
    const db=fixture();
    db.database.exec("DELETE FROM lms_progresso_scorm WHERE matricula_id=384");
    await reset(db);
    expect(one(db,"SELECT scorm_json FROM lms_ciclo_evidencias WHERE ciclo_id=99"))
      .toEqual({scorm_json:null});
    expect(one(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500"))
      .toEqual({archived_cycle_id:99});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_xapi_statements WHERE archived_cycle_id IS NULL"))
      .toEqual({n:0});
  });
  it('fails closed on active enrollment without archiving or resetting',async()=>{
    const db=fixture();
    db.database.exec("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=384");
    await expect(reset(db)).rejects.toThrow('LMS_CYCLE_ACTIVE_OR_UNKNOWN_STATUS');
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_ciclo_evidencias")).toEqual({n:0});
    expect(one(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500"))
      .toEqual({archived_cycle_id:null});
  });
  it('retains old terminal cycle/score after renewal and does not promote 99% to conclusion',async()=>{
    const db=fixture();
    await reset(db);
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_matricula_ciclos WHERE matricula_id=384 AND status='CONCLUIDO'"))
      .toEqual({n:1});
    expect(one(db,"SELECT COUNT(*) AS n FROM lms_matriculas WHERE status='CONCLUIDO'")).toEqual({n:0});
  });
});
