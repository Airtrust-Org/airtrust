import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const SqliteDatabase = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new(location: string): DatabaseSync;
};
const migration = readFileSync(resolve(process.cwd(),
  'schema-v2/changes/0565_lms_player3_resume_credit_ledger.sql'), 'utf8');

function fixture() {
  const db = new SqliteDatabase(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,tipo_conteudo TEXT,ativo INTEGER,publicado INTEGER,deleted_at TEXT);
    CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,status TEXT,deleted_at TEXT);
    CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,matricula_id INTEGER,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,ciclo_atual INTEGER,status TEXT,deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY);
    CREATE TABLE usuarios(id INTEGER PRIMARY KEY,active INTEGER,deleted_at TEXT);
    CREATE TABLE usuarios_empresas_perfis(usuario_id INTEGER,empresa_id INTEGER,perfil TEXT,ativo INTEGER);
    CREATE TABLE lms_native_catalog_activation(curso_id INTEGER,empresa_id INTEGER);
    CREATE TABLE lms_native_edicoes(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,artifact_sha256 TEXT,status TEXT);
    CREATE TABLE lms_native_matricula_edicoes(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,matricula_id INTEGER,ciclo_id INTEGER,edicao_id INTEGER);
    INSERT INTO lms_cursos VALUES(20,6,'scorm',1,1,NULL);
    INSERT INTO lms_matriculas VALUES(30,6,20,40,'EM_ANDAMENTO',NULL);
    INSERT INTO lms_matricula_ciclos VALUES(50,30,6,20,40,1,'EM_ANDAMENTO',NULL);
    INSERT INTO funcionarios VALUES(40);
    INSERT INTO usuarios VALUES(90,1,NULL),(91,1,NULL),(92,1,NULL);
    INSERT INTO usuarios_empresas_perfis VALUES(90,6,'GESTOR',1),(91,6,'ADMIN',1),(92,7,'ADMIN',1);
    INSERT INTO lms_native_catalog_activation VALUES(20,6);
    INSERT INTO lms_native_edicoes VALUES(70,6,20,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','PUBLISHED');
    INSERT INTO lms_native_matricula_edicoes VALUES(80,6,20,30,50,70);
  `);
  db.exec(migration);
  return db;
}
const record = (overrides: Record<string, unknown> = {}) => ({
  idempotency_key: 'a'.repeat(64), decision_key: 'a'.repeat(64),
  empresa_id: 6, curso_id: 20, matricula_id: 30, ciclo_id: 50,
  funcionario_id: 40, binding_id: 80,
  source_snapshot_sha256: 'c'.repeat(64), source_t0_sha256: 'd'.repeat(64),
  source_row_sha256: 'e'.repeat(64), original_edition_sha256: 'f'.repeat(64),
  destination_edition_sha256: 'b'.repeat(64), source_updated_at: '2026-10-22T12:00:00Z',
  source_scorm_commit_at: null, historical_progress_pct: 80, resume_unit_id: 'unit-33',
  manager_user_id: 90, second_reviewer_user_id: 91, approved_at: '2026-10-22T12:30:00Z',
  justification: 'Revisão independente para restabelecer apenas a posição de retomada.',
  grants_completion: 0,
  ...overrides,
});
function insert(db: DatabaseSync, values: ReturnType<typeof record>) {
  db.prepare(`INSERT INTO lms_player3_resume_credit_ledger
    (idempotency_key,decision_key,empresa_id,curso_id,matricula_id,ciclo_id,funcionario_id,binding_id,
     source_snapshot_sha256,source_t0_sha256,source_row_sha256,original_edition_sha256,destination_edition_sha256,
     source_updated_at,source_scorm_commit_at,historical_progress_pct,resume_unit_id,manager_user_id,
     second_reviewer_user_id,approved_at,justification,grants_completion)
    VALUES(:idempotency_key,:decision_key,:empresa_id,:curso_id,:matricula_id,:ciclo_id,:funcionario_id,:binding_id,
     :source_snapshot_sha256,:source_t0_sha256,:source_row_sha256,:original_edition_sha256,:destination_edition_sha256,
     :source_updated_at,:source_scorm_commit_at,:historical_progress_pct,:resume_unit_id,:manager_user_id,
     :second_reviewer_user_id,:approved_at,:justification,:grants_completion)`).run(
    Object.fromEntries(Object.entries(values).filter(([key]) =>
      ['idempotency_key','decision_key','empresa_id','curso_id','matricula_id','ciclo_id',
        'funcionario_id','binding_id','source_snapshot_sha256','source_t0_sha256',
        'source_row_sha256','original_edition_sha256','destination_edition_sha256',
        'source_updated_at','source_scorm_commit_at','historical_progress_pct','resume_unit_id',
        'manager_user_id','second_reviewer_user_id','approved_at','justification','grants_completion'].includes(key))));
}

describe('Schema V2 0565 — Player3 resume credit ledger', () => {
  let db: DatabaseSync | null = null;
  afterEach(() => { db?.close(); db = null; });

  it('pins the review-only manifest to the exact SQL and recovery plan', () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(),
      'schema-v2/lms-player3-resume-credit-0565.json'), 'utf8'));
    const plan = readFileSync(resolve(process.cwd(),
      'schema-v2/plans/lms-player3-resume-credit-0565.md'));
    const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
    expect(manifest).toMatchObject({
      changeId: 'lms-player3-resume-credit-0565',
      reviewStatus: 'REVIEW_ONLY',
      fileHash: hash(migration),
      planHash: hash(plan),
    });
  });

  it('records only a tenant-scoped current-cycle position credit and preserves the source enrollment', () => {
    db = fixture();
    insert(db, record());
    expect(db.prepare('SELECT historical_progress_pct,resume_unit_id,grants_assessment_pass,grants_completion,grants_qualification,grants_certificate FROM lms_player3_resume_credit_ledger').get()).toEqual({
      historical_progress_pct: 80, resume_unit_id: 'unit-33',
      grants_assessment_pass: 0, grants_completion: 0,
      grants_qualification: 0, grants_certificate: 0,
    });
    expect(db.prepare('SELECT status,deleted_at FROM lms_matriculas WHERE id=30').get())
      .toEqual({ status: 'EM_ANDAMENTO', deleted_at: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM lms_matricula_ciclos WHERE matricula_id=30').get()).toEqual({ n: 1 });
  });

  it('requires two different tenant-scoped reviewers and a manager profile', () => {
    db = fixture();
    expect(() => insert(db!, record({ manager_user_id: 91, second_reviewer_user_id: 90 })))
      .toThrow(/PLAYER3_RESUME_CREDIT_SCOPE_DENIED/);
    expect(() => insert(db!, record({ manager_user_id: 90, second_reviewer_user_id: 92 })))
      .toThrow(/PLAYER3_RESUME_CREDIT_SCOPE_DENIED/);
    expect(() => insert(db!, record({ second_reviewer_user_id: 90 })))
      .toThrow(/CHECK constraint failed/);
  });

  it('rejects cross-tenant enrollment, stale cycle and wrong destination edition', () => {
    db = fixture();
    for (const invalid of [
      record({ empresa_id: 7 }), record({ ciclo_id: 999 }),
      record({ destination_edition_sha256: '9'.repeat(64) }),
    ]) expect(() => insert(db!, invalid)).toThrow(/PLAYER3_RESUME_CREDIT_SCOPE_DENIED/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM lms_player3_resume_credit_ledger').get()).toEqual({ n: 0 });
  });

  it('rejects all completion flags and duplicate/idempotency collisions', () => {
    db = fixture();
    expect(() => insert(db!, record({ grants_completion: 1 }))).toThrow(/PLAYER3_RESUME_CREDIT_NO_COMPLETION/);
    insert(db, record());
    expect(() => insert(db!, record({ resume_unit_id: 'different-unit' })))
      .toThrow(/UNIQUE constraint failed/);
    expect(() => db!.exec('UPDATE lms_player3_resume_credit_ledger SET historical_progress_pct=0'))
      .toThrow(/PLAYER3_RESUME_CREDIT_IMMUTABLE/);
    expect(() => db!.exec('DELETE FROM lms_player3_resume_credit_ledger'))
      .toThrow(/PLAYER3_RESUME_CREDIT_IMMUTABLE/);
  });

  it('refuses a credit when the original cycle is completed', () => {
    db = fixture();
    db.exec("UPDATE lms_matriculas SET status='CONCLUIDO' WHERE id=30; UPDATE lms_matricula_ciclos SET status='CONCLUIDO' WHERE id=50;");
    expect(() => insert(db!, record())).toThrow(/PLAYER3_RESUME_CREDIT_SCOPE_DENIED/);
  });
});
