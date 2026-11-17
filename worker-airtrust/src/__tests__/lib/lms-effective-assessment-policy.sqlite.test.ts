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

  it('ignores deleted cycles and never crosses the tenant boundary', () => {
    const db = fixture();
    expect(effective(db, 14, 6)).toBe('FORMATIVE');
    expect(effective(db, 20, 6)).toBeUndefined();
    expect(effective(db, 11, 7)).toBeUndefined();
  });
});
