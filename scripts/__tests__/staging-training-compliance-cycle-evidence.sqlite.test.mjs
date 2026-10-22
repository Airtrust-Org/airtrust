// source_reference: F1 second-cycle staging fixture expiry contract.
// dry_run_required: execute the exact generated query against Node's isolated in-memory SQLite.
// rollback_plan_required: the database is disposable and never calls Wrangler or Cloudflare.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const code = 'QA-COMP-LIFE-39349812345';
const marker = 'QA_ONLY_TRAINING_COMPLIANCE_LIFECYCLE_39349812345';

function expirySql() {
  return JSON.parse(execFileSync(process.execPath, [
    'scripts/staging/qa-training-compliance-cycle-evidence.mjs',
    '--expire', '--print-expiry-sql-for-qa-test',
  ], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test',
    QA_LIFECYCLE_CODE: code, QA_LIFECYCLE_MARKER: marker,
    STAGING_D1_NAME: 'airtrust-db-staging-baseline-20260701' } }));
}

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE empresas(id INTEGER PRIMARY KEY,codigo TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula TEXT);
    CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,titulo TEXT,observacoes TEXT,qualificacao_tipo_id INTEGER,deleted_at TEXT);
    CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,status TEXT,deleted_at TEXT);
    CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,lms_matricula_id INTEGER,status TEXT,origem_tipo TEXT,data_vencimento TEXT,updated_at TEXT,observacoes TEXT,deleted_at TEXT);
    INSERT INTO empresas VALUES (1,'qa_examiner_training'),(2,'other_tenant');
    INSERT INTO funcionarios VALUES (11,1,'${code}-E1'),(12,1,'${code}-E2'),(21,2,'${code}-E1');
    INSERT INTO lms_cursos VALUES (31,1,'${code} EAD obrigatório','${marker}',41,NULL);
    INSERT INTO lms_matriculas VALUES
      (51,1,31,11,'CONCLUIDO',NULL),(52,1,31,12,'CONCLUIDO',NULL),
      (53,1,31,11,'EM_ANDAMENTO',NULL),(54,1,31,11,'CONCLUIDO',NULL),
      (55,2,31,21,'CONCLUIDO',NULL);
    INSERT INTO qualificacoes_historico VALUES
      (101,1,11,41,51,'CONCLUIDA','LMS','2099-01-01',NULL,'initial completion',NULL),
      (102,1,12,41,52,'CONCLUIDA','LMS','2099-01-01',NULL,'employee 2',NULL),
      (103,1,11,41,53,'CONCLUIDA','LMS','2099-01-01',NULL,'active enrollment',NULL),
      (104,1,11,41,54,'CANCELADA','LMS','2099-01-01',NULL,'cancelled evidence',NULL),
      (105,2,21,41,55,'CONCLUIDA','LMS','2099-01-01',NULL,'other tenant',NULL);
  `);
  return db;
}

test('controlled expiry selects and updates only the completed E1 qualification from this run', () => {
  const db = createDb();
  try {
    const sql = expirySql();
    const candidates = db.prepare(sql.select).all();
    assert.deepEqual(candidates.map((row) => row.id), [101]);
    const update = sql.update.replace('WHERE qh.id=1 ', 'WHERE qh.id=101 ');
    db.exec(update);
    const target = db.prepare('SELECT data_vencimento,observacoes FROM qualificacoes_historico WHERE id=101').get();
    assert.ok(target.data_vencimento < new Date().toISOString().slice(0, 10));
    assert.match(target.observacoes, new RegExp(`QA synthetic due date ${marker}`));
    for (const id of [102, 103, 104, 105]) {
      assert.equal(db.prepare('SELECT data_vencimento FROM qualificacoes_historico WHERE id=?').get(id).data_vencimento, '2099-01-01');
    }
    assert.deepEqual(db.prepare(sql.select).all(), []);
  } finally {
    db.close();
  }
});
