import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {SqliteD1Database} from '../helpers/qualification-history-sqlite-d1';
import {writeScormEditionHandoff} from '../../services/lms-scorm-edition-handoff-writer';

const opened:SqliteD1Database[]=[];
afterEach(()=>{for(const db of opened.splice(0))db.close()});

function fixture(){
  const db=new SqliteD1Database();opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,tipo_conteudo TEXT,
      scorm_package_r2_prefix TEXT,deleted_at TEXT);
    CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      funcionario_id INTEGER,status TEXT,deleted_at TEXT,qualificacao_historico_id INTEGER,
      progresso_pct INTEGER,score_final REAL,tentativas INTEGER,data_matricula TEXT,
      data_inicio TEXT,data_conclusao TEXT,data_expiracao TEXT,ultimo_slide INTEGER,
      ultima_pagina INTEGER,updated_at TEXT);
    CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,
      curso_id INTEGER,funcionario_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT,status TEXT,
      progresso_pct INTEGER,score_final REAL,tentativas INTEGER,data_matricula TEXT,
      data_inicio TEXT,data_conclusao TEXT,data_expiracao TEXT,qualificacao_historico_id INTEGER,
      observacoes TEXT,created_at TEXT,updated_at TEXT,
      FOREIGN KEY(matricula_id) REFERENCES lms_matriculas(id));
    CREATE TABLE lms_scorm_package_versions(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      r2_prefix TEXT,package_sha256 TEXT,status TEXT);
    CREATE TABLE lms_scorm_package_audit_log(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
      package_id INTEGER,action TEXT,created_at TEXT);
    CREATE TABLE lms_progresso_scorm(id INTEGER PRIMARY KEY AUTOINCREMENT,matricula_id INTEGER,empresa_id INTEGER,lesson_status TEXT,
      completion_status TEXT,success_status TEXT,score_raw REAL,score_max REAL,score_min REAL,
      score_scaled REAL,suspend_data TEXT,cmi_json TEXT,session_time TEXT,total_time TEXT,
      launch_data TEXT,session_count INTEGER,last_commit_at TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE lms_completion_diagnostics_snapshots(id INTEGER PRIMARY KEY,empresa_id INTEGER,
      matricula_id INTEGER,tentativa INTEGER,diagnostics_json TEXT);
    CREATE TABLE audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT,
      entity_type TEXT,entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT);
  `);
  const migration=readFileSync(resolve(process.cwd(),'schema-v2/changes/0566_lms_scorm_edition_handoffs.sql'),'utf8');
  db.database.exec(migration);
  const activeSha='b'.repeat(64),previousSha='a'.repeat(64);
  db.database.prepare(`INSERT INTO lms_cursos VALUES(88,6,'scorm','lms/scorm/6/88/active/',NULL)`).run();
  db.database.prepare(`INSERT INTO lms_matriculas VALUES
    (100,6,88,48,'EM_ANDAMENTO',NULL,NULL,75,82,3,'2026-10-01','2026-10-01',NULL,NULL,30,30,'old')`).run();
  db.database.prepare(`INSERT INTO lms_matricula_ciclos VALUES
    (17,6,100,88,48,1,NULL,'EM_ANDAMENTO',75,82,3,'2026-10-01','2026-10-01',NULL,NULL,NULL,
     'historic notes','created','updated')`).run();
  db.database.prepare(`INSERT INTO lms_scorm_package_versions VALUES
    (1,6,88,'lms/scorm/6/88/prior/',?,'ARCHIVED'),
    (2,6,88,'lms/scorm/6/88/active/',?,'ACTIVE')`).run(previousSha,activeSha);
  db.database.prepare(`INSERT INTO lms_scorm_package_audit_log VALUES
    (1,6,88,1,'ACTIVATED','2026-09-01 00:00:00')`).run();
  db.database.prepare(`INSERT INTO lms_progresso_scorm
    (matricula_id,empresa_id,lesson_status,completion_status,success_status,score_raw,score_max,
     score_min,score_scaled,suspend_data,cmi_json,session_time,total_time,launch_data,session_count,
     last_commit_at,created_at,updated_at) VALUES
    (100,6,'incomplete','incomplete','unknown',82,100,0,.82,'old suspend',
     '{"cmi.location":"30/37"}','00:30:00','00:30:00','{}',3,'commit','created','updated')`).run();
  db.database.prepare(`INSERT INTO lms_completion_diagnostics_snapshots
    VALUES(9,6,100,3,'{"assessment":"historical"}')`).run();
  return {db,activeSha};
}

const input=(targetSha256:string)=>({empresaId:6,matriculaId:100,actorId:9,
  operationId:'op_20261022_cycle_100',targetSha256,
  resumePlanJson:JSON.stringify({status:'MATCHED_ANCHOR',targetPosition:30,activeTotal:43,
    canMarkComplete:false,canTransferScore:false})});
const row=(db:SqliteD1Database,sql:string)=>db.database.prepare(sql).get() as Record<string,unknown>;

describe('SCORM edition handoff — D1 batch rollback with SQLite',()=>{
  it('archives all previous evidence and resets only the current runtime in one transaction',async()=>{
    const {db,activeSha}=fixture();
    const receipt=await writeScormEditionHandoff(db.asD1(),input(activeSha));
    expect(receipt).toMatchObject({id:1,cycleId:17,alreadyApplied:false});
    const archive=row(db,'SELECT * FROM lms_scorm_edition_handoffs WHERE id=1');
    expect(JSON.parse(String(archive.previous_enrollment_json))).toMatchObject({
      enrollment:{status:'EM_ANDAMENTO',progresso_pct:75,score_final:82,tentativas:3},
      cycle:{status:'EM_ANDAMENTO',progresso_pct:75,score_final:82,observacoes:'historic notes'},
      previous_package_sha256:'a'.repeat(64),
    });
    expect(JSON.parse(String(archive.previous_scorm_json))).toMatchObject({
      lesson_status:'incomplete',score_raw:82,suspend_data:'old suspend',
      cmi_json:'{"cmi.location":"30/37"}',
    });
    expect(archive.previous_package_prefix).toBe('lms/scorm/6/88/prior/');
    expect(row(db,'SELECT status,progresso_pct,score_final,tentativas,data_inicio,data_conclusao FROM lms_matriculas WHERE id=100'))
      .toEqual({status:'NAO_INICIADO',progresso_pct:0,score_final:null,tentativas:0,data_inicio:null,data_conclusao:null});
    expect(row(db,'SELECT status,progresso_pct,score_final,tentativas,data_inicio,data_conclusao FROM lms_matricula_ciclos WHERE id=17'))
      .toEqual({status:'NAO_INICIADO',progresso_pct:0,score_final:null,tentativas:0,data_inicio:null,data_conclusao:null});
    expect(row(db,'SELECT lesson_status,cmi_json,session_count FROM lms_progresso_scorm WHERE matricula_id=100'))
      .toEqual({lesson_status:null,cmi_json:null,session_count:0});
    expect(row(db,'SELECT COUNT(*) AS n FROM lms_completion_diagnostics_snapshots WHERE matricula_id=100'))
      .toEqual({n:0});
    expect(row(db,"SELECT COUNT(*) AS n FROM audit_logs WHERE action='SCORM_EDITION_IN_CYCLE_HANDOFF'"))
      .toEqual({n:1});
    expect(await writeScormEditionHandoff(db.asD1(),input(activeSha)))
      .toMatchObject({id:1,alreadyApplied:true});
  });

  it('rolls back snapshot, CMI clearing, cycle reset, and audit when a late statement fails',async()=>{
    const {db,activeSha}=fixture();
    db.database.exec(`CREATE TRIGGER fail_cycle_reset BEFORE UPDATE ON lms_matricula_ciclos
      BEGIN SELECT RAISE(ABORT,'SIMULATED_HANDOFF_FINAL_WRITE_FAILURE'); END;`);
    await expect(writeScormEditionHandoff(db.asD1(),input(activeSha)))
      .rejects.toThrow('SIMULATED_HANDOFF_FINAL_WRITE_FAILURE');
    expect(row(db,'SELECT status,progresso_pct,score_final,tentativas,data_inicio FROM lms_matriculas WHERE id=100'))
      .toMatchObject({status:'EM_ANDAMENTO',progresso_pct:75,score_final:82,tentativas:3,data_inicio:'2026-10-01'});
    expect(row(db,'SELECT lesson_status,cmi_json,session_count FROM lms_progresso_scorm WHERE matricula_id=100'))
      .toMatchObject({lesson_status:'incomplete',session_count:3,cmi_json:'{"cmi.location":"30/37"}'});
    expect(row(db,'SELECT COUNT(*) AS n FROM lms_scorm_edition_handoffs')).toEqual({n:0});
    expect(row(db,'SELECT COUNT(*) AS n FROM lms_completion_diagnostics_snapshots WHERE matricula_id=100'))
      .toEqual({n:1});
    expect(row(db,'SELECT COUNT(*) AS n FROM audit_logs')).toEqual({n:0});
  });

  it('serializes concurrent requests for the same operation to one immutable receipt',async()=>{
    const {db,activeSha}=fixture();
    const results=await Promise.all([
      writeScormEditionHandoff(db.asD1(),input(activeSha)),
      writeScormEditionHandoff(db.asD1(),input(activeSha)),
    ]);
    expect(results.map(result=>result.id)).toEqual([1,1]);
    expect(results.filter(result=>!result.alreadyApplied)).toHaveLength(1);
    expect(row(db,'SELECT COUNT(*) AS n FROM lms_scorm_edition_handoffs')).toEqual({n:1});
    expect(row(db,"SELECT COUNT(*) AS n FROM audit_logs WHERE action='SCORM_EDITION_IN_CYCLE_HANDOFF'"))
      .toEqual({n:1});
  });
});
