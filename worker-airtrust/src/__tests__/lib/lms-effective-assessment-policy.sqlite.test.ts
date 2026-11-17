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
      ciclo_atual INTEGER, status TEXT, assessment_policy TEXT, deleted_at TEXT);
    INSERT INTO lms_cursos VALUES
      (26,6,'FORMATIVE'), (26,7,'SCORED');
    INSERT INTO lms_matriculas VALUES
      (10,6,26),(11,6,26),(12,6,26),(13,6,26),
      (14,6,26),(15,6,26),(20,7,26),(21,7,26);
    INSERT INTO lms_matricula_ciclos VALUES
      (100,6,10,1,'CONCLUIDO','SCORED',NULL),
      (101,6,11,1,'EM_ANDAMENTO','SCORED',NULL),
      (102,6,12,1,'NAO_INICIADO','SCORED',NULL),
      (103,6,13,1,'REPROVADO','SCORED',NULL),
      (104,6,14,1,'CONCLUIDO','SCORED','2026-11-01'),
      (105,6,15,1,'SUSPENSO','SCORED',NULL),
      (200,7,20,1,'EM_ANDAMENTO','FORMATIVE',NULL),
      (201,7,21,1,'CONCLUIDO','FORMATIVE',NULL);
  `);
  db.database.exec(`
    ALTER TABLE lms_matricula_ciclos ADD COLUMN data_conclusao TEXT;
    CREATE TABLE lms_scorm_package_versions (
      id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      assessment_policy TEXT);
    CREATE TABLE lms_scorm_package_audit_log (
      id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      package_id TEXT, action TEXT, created_at TEXT);
    INSERT INTO lms_scorm_package_versions VALUES
      ('old-6',6,26,'SCORED'), ('form-6',6,26,'FORMATIVE'),
      ('old-7',7,26,'FORMATIVE'), ('scored-7',7,26,'SCORED');
    INSERT INTO lms_scorm_package_audit_log VALUES
      ('a-old-6',6,26,'old-6','ACTIVATED','2026-10-01 00:00:00'),
      ('b-form-6',6,26,'form-6','ACTIVATED','2026-11-01 00:00:00'),
      ('a-old-7',7,26,'old-7','ACTIVATED','2026-10-01 00:00:00'),
      ('b-scored-7',7,26,'scored-7','ACTIVATED','2026-11-01 00:00:00');
    UPDATE lms_matricula_ciclos SET data_conclusao='2026-10-15 12:00:00'
      WHERE id=100;
    UPDATE lms_matricula_ciclos SET data_conclusao='2026-10-15 12:00:00'
      WHERE id=201;
  `);
  return db;
}
function effective(db: SqliteD1Database, enrollmentId: number, tenantId: number): string | undefined {
  return (db.database.prepare(`SELECT ${EFFECTIVE_ASSESSMENT_POLICY_SQL}
    FROM lms_matriculas m
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE m.id=? AND m.empresa_id=?`)
    .get(enrollmentId,tenantId) as { scorm_assessment_policy: string } | undefined)
    ?.scorm_assessment_policy;
}

describe('effective SCORM assessment policy for pre-existing cycles', () => {
  it('uses the active FORMATIVE edition for open cycles incorrectly pinned as SCORED', () => {
    const db = fixture();
    expect(effective(db, 11, 6)).toBe('FORMATIVE');
    expect(effective(db, 12, 6)).toBe('FORMATIVE');
  });

  it('uses the active SCORED edition for open cycles incorrectly pinned as FORMATIVE', () => {
    const db = fixture();
    expect(effective(db, 20, 7)).toBe('SCORED');
  });

  it('preserves pinned history for terminal or unknown cycle status', () => {
    const db = fixture();
    expect(effective(db, 10, 6)).toBe('SCORED');
    expect(effective(db, 13, 6)).toBe('SCORED');
    expect(effective(db, 15, 6)).toBe('SCORED');
    expect(effective(db, 21, 7)).toBe('FORMATIVE');
  });

  it('does not revert to a stale pin after a genuine open-to-completed transition', () => {
    const db = fixture();
    expect(effective(db, 11, 6)).toBe('FORMATIVE');
    db.database.prepare(`UPDATE lms_matricula_ciclos
      SET status='CONCLUIDO',data_conclusao='2026-11-17 12:00:00'
      WHERE id=101`).run();
    expect(db.database.prepare('SELECT assessment_policy AS p FROM lms_matricula_ciclos WHERE id=101')
      .get()).toMatchObject({ p: 'SCORED' });
    expect(effective(db, 11, 6)).toBe('FORMATIVE');
    // A later active SCORED edition must not reclassify this completed cycle.
    db.database.exec(`
      INSERT INTO lms_scorm_package_versions VALUES ('scored-new-6',6,26,'SCORED');
      INSERT INTO lms_scorm_package_audit_log VALUES
        ('c-scored-new-6',6,26,'scored-new-6','ACTIVATED','2026-12-01 00:00:00');
      UPDATE lms_cursos SET scorm_assessment_policy='SCORED' WHERE id=26 AND empresa_id=6;
    `);
    expect(effective(db, 11, 6)).toBe('FORMATIVE');
    expect(effective(db, 12, 6)).toBe('SCORED');
    expect(effective(db, 10, 6)).toBe('SCORED');
  });

  it('also preserves SCORED when it was active at completion despite stale FORMATIVE pin', () => {
    const db = fixture();
    expect(effective(db, 20, 7)).toBe('SCORED');
    db.database.prepare(`UPDATE lms_matricula_ciclos
      SET status='CONCLUIDO',data_conclusao='2026-11-17 12:00:00'
      WHERE id=200`).run();
    expect(db.database.prepare('SELECT assessment_policy AS p FROM lms_matricula_ciclos WHERE id=200')
      .get()).toMatchObject({ p: 'FORMATIVE' });
    expect(effective(db, 20, 7)).toBe('SCORED');
    expect(effective(db, 21, 7)).toBe('FORMATIVE');
  });

  it('falls back to immutable terminal pin when activation history is absent', () => {
    const db = fixture();
    db.database.exec(`
      DELETE FROM lms_scorm_package_audit_log WHERE empresa_id=6;
      UPDATE lms_matricula_ciclos
        SET status='CONCLUIDO',data_conclusao='2026-11-17 12:00:00' WHERE id=101;
    `);
    expect(effective(db, 11, 6)).toBe('SCORED');
  });

  it('ignores deleted cycles and never crosses the tenant boundary', () => {
    const db = fixture();
    expect(effective(db, 14, 6)).toBe('FORMATIVE');
    expect(effective(db, 20, 6)).toBeUndefined();
    expect(effective(db, 11, 7)).toBeUndefined();
  });
});
