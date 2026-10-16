import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { applyTrainingRosterPlan } from '../../services/training-compliance-roster-sync';
import type { RosterPlan } from '../../services/training-compliance-roster-plan';

const dbs:SqliteD1Database[]=[];
afterEach(()=>{for (const db of dbs.splice(0)) db.close();});

function fixture() {
  const db=new SqliteD1Database();dbs.push(db);
  db.database.exec(`
    ALTER TABLE qualificacoes_historico ADD COLUMN lms_matricula_id INTEGER;
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'NAO_INICIADO',deleted_at TEXT,
      progresso_pct INTEGER DEFAULT 0,data_inicio TEXT,data_conclusao TEXT,
      qualificacao_historico_id INTEGER,updated_at TEXT
    );
    CREATE TABLE lms_progresso_scorm (id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER);
    CREATE TABLE lms_xapi_statements (id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER);
    CREATE TABLE lms_completion_diagnostics_snapshots (id INTEGER PRIMARY KEY, empresa_id INTEGER,matricula_id INTEGER);
    CREATE TABLE lms_matricula_ciclos (id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE notificacoes_inapp (id TEXT PRIMARY KEY,empresa_id INTEGER,referencia_id TEXT,referencia_tipo TEXT,tipo TEXT,deleted_at TEXT);
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,
      old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT
    );
    INSERT INTO lms_matriculas(id,empresa_id,funcionario_id,curso_id,status) VALUES
      (10,6,101,56,'NAO_INICIADO'),
      (11,6,102,56,'EM_ANDAMENTO'),
      (12,6,103,56,'CONCLUIDO'),
      (13,6,104,56,'NAO_INICIADO'),
      (14,7,201,56,'NAO_INICIADO');
    UPDATE lms_matriculas SET progresso_pct=20 WHERE id=13;
    INSERT INTO lms_matricula_ciclos(id,empresa_id,matricula_id,ciclo_atual,status)
      VALUES (101,6,10,1,'NAO_INICIADO');
    INSERT INTO notificacoes_inapp(id,empresa_id,referencia_id,referencia_tipo,tipo)
      VALUES ('n1',6,'10','lms_matricula','lms_nova_matricula');
  `);
  return db;
}
function plan(ids:number[]):RosterPlan {
  return {
    enroll:[], remove:ids.map(id=>({matriculaId:id,funcionarioId:101,cursoId:56,motivo:'EVIDENCIA_VALIDA' as const})),
    protectedCount:0,skippedAmbiguousCourses:0,skippedPendingEvidence:0,skippedManualModality:0,
  };
}
describe('Governed all-course cleanup D1 — transactional and tenant-scoped',()=>{
  it('soft-removes only untouched enrollment, hides notification and retains audit/cycle',async()=>{
    const db=fixture();
    const result=await applyTrainingRosterPlan(db.asD1(),6,plan([10]),4);
    expect(result).toMatchObject({removed:1,enrolled:0,email_enviado:false});
    expect(db.database.prepare('SELECT status,deleted_at FROM lms_matriculas WHERE id=10').get())
      .toMatchObject({status:'CANCELADO',deleted_at:expect.any(String)});
    expect(db.database.prepare('SELECT status FROM lms_matricula_ciclos WHERE matricula_id=10').get())
      .toMatchObject({status:'CANCELADO'});
    expect(db.database.prepare('SELECT deleted_at FROM notificacoes_inapp WHERE id=?').get('n1'))
      .toMatchObject({deleted_at:expect.any(String)});
    expect(db.database.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE empresa_id=6').get())
      .toMatchObject({n:1});
  });
  it('does not remove in-progress, concluded, evidenced or cross-tenant rows',async()=>{
    const db=fixture();
    const result=await applyTrainingRosterPlan(db.asD1(),6,plan([11,12,13,14]),10);
    expect(result.removed).toBe(0);
    expect(result.ignored).toBe(4);
    expect(db.database.prepare('SELECT COUNT(*) AS n FROM lms_matriculas WHERE deleted_at IS NOT NULL').get())
      .toMatchObject({n:0});
    expect(db.database.prepare('SELECT COUNT(*) AS n FROM audit_logs').get())
      .toMatchObject({n:0});
  });
  it('does not cancel untouched status when SCORM/xAPI or historical proof exists',async()=>{
    const db=fixture();
    db.database.exec(`INSERT INTO lms_progresso_scorm VALUES (1,6,10);`);
    const result=await applyTrainingRosterPlan(db.asD1(),6,plan([10]),10);
    expect(result.removed).toBe(0);
    expect(db.database.prepare('SELECT deleted_at FROM lms_matriculas WHERE id=10').get())
      .toMatchObject({deleted_at:null});
  });
  it('rejects an attempt to write another tenant',async()=>{
    const db=fixture();
    await expect(applyTrainingRosterPlan(db.asD1(),7,plan([14]),10))
      .rejects.toThrow('ROSTER_TENANT_NOT_AUTHORIZED');
  });
});
