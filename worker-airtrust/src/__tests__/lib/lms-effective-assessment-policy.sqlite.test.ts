import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { EFFECTIVE_ASSESSMENT_POLICY_SQL } from '../../lib/lms/lms-effective-assessment-policy';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos (
      id INTEGER, empresa_id INTEGER, scorm_assessment_policy TEXT,
      PRIMARY KEY (empresa_id,id));
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER);
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER,
      ciclo_atual INTEGER, status TEXT, assessment_policy TEXT, deleted_at TEXT,
      data_conclusao TEXT);
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, action TEXT, entity_type TEXT,
      entity_id INTEGER, new_values TEXT);
    INSERT INTO lms_cursos VALUES (26,6,'FORMATIVE'), (26,7,'SCORED');
    INSERT INTO lms_matriculas VALUES
      (10,6,26),(11,6,26),(12,6,26),(13,6,26),
      (14,6,26),(15,6,26),(20,7,26),(21,7,26);
    INSERT INTO lms_matricula_ciclos
      (id,empresa_id,matricula_id,ciclo_atual,status,assessment_policy,deleted_at,data_conclusao)
      VALUES
      (100,6,10,1,'CONCLUIDO','SCORED',NULL,'2026-10-15'),
      (101,6,11,1,'EM_ANDAMENTO','SCORED',NULL,NULL),
      (102,6,12,1,'NAO_INICIADO','SCORED',NULL,NULL),
      (103,6,13,1,'REPROVADO','SCORED',NULL,'2026-10-15'),
      (104,6,14,1,'CONCLUIDO','SCORED','2026-11-01','2026-11-01'),
      (105,6,15,1,'SUSPENSO','SCORED',NULL,NULL),
      (200,7,20,1,'EM_ANDAMENTO','FORMATIVE',NULL,NULL),
      (201,7,21,1,'CONCLUIDO','FORMATIVE',NULL,'2026-10-15');
  `);
  return db;
}
function effective(db: SqliteD1Database, id: number, tenantId: number): string | undefined {
  return (db.database.prepare(`SELECT ${EFFECTIVE_ASSESSMENT_POLICY_SQL}
    FROM lms_matriculas m
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE m.id=? AND m.empresa_id=?`)
    .get(id,tenantId) as { scorm_assessment_policy: string } | undefined)
    ?.scorm_assessment_policy;
}
function snapshot(db: SqliteD1Database, cycleId: number, tenantId: number, policy: string) {
  db.database.prepare(`INSERT INTO audit_logs (empresa_id,action,entity_type,entity_id,new_values)
    VALUES (?,'LMS_SCORM_COMPLETION_POLICY_SNAPSHOT','lms_matricula_ciclos',?,?)`)
    .run(tenantId,cycleId,JSON.stringify({policy,course_id:26}));
}

describe('effective assessment policy of open and terminal SCORM cycles', () => {
  it('uses the active FORMATIVE policy for open cycles incorrectly pinned SCORED', () => {
    const db = fixture();
    expect(effective(db, 11, 6)).toBe('FORMATIVE');
    expect(effective(db, 12, 6)).toBe('FORMATIVE');
  });

  it('uses the active SCORED policy for open cycles incorrectly pinned FORMATIVE', () => {
    const db = fixture();
    expect(effective(db, 20, 7)).toBe('SCORED');
  });

  it('never reclassifies historical terminal pins without new completion evidence', () => {
    const db = fixture();
    expect(effective(db, 10, 6)).toBe('SCORED');
    expect(effective(db, 13, 6)).toBe('SCORED');
    expect(effective(db, 15, 6)).toBe('SCORED');
    expect(effective(db, 21, 7)).toBe('FORMATIVE');
  });

  it('keeps FORMATIVE after open-to-completed transition with an atomic audit snapshot', () => {
    const db = fixture();
    expect(effective(db, 11, 6)).toBe('FORMATIVE');
    snapshot(db,101,6,'FORMATIVE');
    db.database.exec("UPDATE lms_matricula_ciclos SET status='CONCLUIDO', data_conclusao='2026-11-17' WHERE id=101");
    expect(db.database.prepare('SELECT assessment_policy AS p FROM lms_matricula_ciclos WHERE id=101')
      .get()).toMatchObject({p:'SCORED'});
    expect(effective(db,11,6)).toBe('FORMATIVE');
    db.database.exec("UPDATE lms_cursos SET scorm_assessment_policy='SCORED' WHERE id=26 AND empresa_id=6");
    expect(effective(db,11,6)).toBe('FORMATIVE');
    expect(effective(db,12,6)).toBe('SCORED');
    expect(effective(db,10,6)).toBe('SCORED');
  });

  it('keeps SCORED after open-to-completed when the legacy pin was FORMATIVE', () => {
    const db = fixture();
    expect(effective(db,20,7)).toBe('SCORED');
    snapshot(db,200,7,'SCORED');
    db.database.exec("UPDATE lms_matricula_ciclos SET status='CONCLUIDO',data_conclusao='2026-11-17' WHERE id=200");
    expect(effective(db,20,7)).toBe('SCORED');
    expect(effective(db,21,7)).toBe('FORMATIVE');
  });

  it('rejects cross-tenant, wrong-cycle and invalid evidence and keeps the terminal pin', () => {
    const db = fixture();
    db.database.exec("UPDATE lms_matricula_ciclos SET status='CONCLUIDO',data_conclusao='2026-11-17' WHERE id=101");
    snapshot(db,101,7,'FORMATIVE');
    snapshot(db,102,6,'FORMATIVE');
    expect(effective(db,11,6)).toBe('SCORED');
    db.database.exec("INSERT INTO audit_logs (empresa_id,action,entity_type,entity_id,new_values) VALUES (6,'LMS_SCORM_COMPLETION_POLICY_SNAPSHOT','lms_matricula_ciclos',101,'{invalid json')");
    expect(effective(db,11,6)).toBe('SCORED');
  });

  it('ignores deleted cycles and never crosses tenant boundaries', () => {
    const db = fixture();
    expect(effective(db,14,6)).toBe('FORMATIVE');
    expect(effective(db,20,6)).toBeUndefined();
    expect(effective(db,11,7)).toBeUndefined();
  });
});
