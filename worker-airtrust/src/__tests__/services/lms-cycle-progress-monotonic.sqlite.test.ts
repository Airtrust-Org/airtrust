import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { syncMatriculaCycleProgressMonotonic } from '../../services/lms-matricula-cycle';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

describe('learner PATCH progress -> current cycle, tenant-scoped and evidence-preserving', () => {
  it('advances PPTX without reducing SCORM cycle progress, scores or qualifications', async () => {
    const db = new SqliteD1Database(); opened.push(db);
    db.database.exec(`
      CREATE TABLE lms_matriculas (id INTEGER, empresa_id INTEGER, status TEXT, progresso_pct INTEGER,
        data_inicio TEXT, deleted_at TEXT);
      CREATE TABLE lms_matricula_ciclos (id INTEGER, matricula_id INTEGER, empresa_id INTEGER,
        ciclo_atual INTEGER, deleted_at TEXT, status TEXT, progresso_pct INTEGER,
        data_inicio TEXT, score_final INTEGER, tentativas INTEGER, qualificacao_historico_id INTEGER,
        updated_at TEXT);
      INSERT INTO lms_matriculas VALUES
        (1390,6,'EM_ANDAMENTO',2,'2026-11-13 01:43:21',NULL),
        (385,6,'EM_ANDAMENTO',58,'2026-10-01',NULL),
        (2057,7,'EM_ANDAMENTO',5,'2026-10-02',NULL);
      INSERT INTO lms_matricula_ciclos VALUES
        (2671,1390,6,1,NULL,'NAO_INICIADO',0,NULL,NULL,0,NULL,NULL),
        (508,385,6,1,NULL,'EM_ANDAMENTO',100,'2026-09-01',100,3,900,NULL),
        (2305,2057,7,1,NULL,'EM_ANDAMENTO',2,NULL,0,1,NULL,NULL);
    `);
    await syncMatriculaCycleProgressMonotonic(db as unknown as D1Database, {matriculaId:1390,empresaId:6});
    await syncMatriculaCycleProgressMonotonic(db as unknown as D1Database, {matriculaId:385,empresaId:6});
    await syncMatriculaCycleProgressMonotonic(db as unknown as D1Database, {matriculaId:2057,empresaId:6});
    const read = (id:number) => db.database.prepare('SELECT * FROM lms_matricula_ciclos WHERE id=?').get(id) as Record<string,unknown>;
    expect(read(2671)).toMatchObject({status:'EM_ANDAMENTO',progresso_pct:2,data_inicio:'2026-11-13 01:43:21'});
    expect(read(508)).toMatchObject({status:'EM_ANDAMENTO',progresso_pct:100,score_final:100,tentativas:3,qualificacao_historico_id:900,data_inicio:'2026-09-01'});
    expect(read(2305)).toMatchObject({status:'EM_ANDAMENTO',progresso_pct:2});
    await syncMatriculaCycleProgressMonotonic(db as unknown as D1Database, {matriculaId:2057,empresaId:7});
    expect(read(2305).progresso_pct).toBe(5);
  });
});
