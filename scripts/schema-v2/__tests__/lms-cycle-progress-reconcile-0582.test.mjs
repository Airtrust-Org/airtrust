// source_reference: GitHub #2215 production tenant-6 snapshot and PR #2253.
// operational_decision: test-only SQL fixture; production writes via Schema V2 guarded runner.
// dry_run_required: exact live D1 preflight before any apply.
// rollback_plan_required: D1 Time Travel recovery point and reviewed plan 0582.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const sql = readFileSync(new URL('../../../worker-airtrust/schema-v2/changes/0582_lms_cycle_progress_reconcile.sql', import.meta.url), 'utf8');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE lms_matriculas (id INTEGER,empresa_id INTEGER,deleted_at TEXT,curso_id INTEGER,funcionario_id INTEGER,status TEXT,progresso_pct INTEGER,data_inicio TEXT);
    CREATE TABLE lms_matricula_ciclos (id INTEGER,matricula_id INTEGER,empresa_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT,status TEXT,progresso_pct INTEGER,data_inicio TEXT,qualificacao_historico_id INTEGER,score_final INTEGER,tentativas INTEGER,updated_at TEXT);
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT);
    INSERT INTO lms_matriculas VALUES
      (1390,6,NULL,22,3,'EM_ANDAMENTO',2,'2026-11-13 01:43:21'),
      (2057,6,NULL,68,35,'EM_ANDAMENTO',5,'2026-10-16 15:08:46'),
      (385,6,NULL,34,88,'EM_ANDAMENTO',58,'2026-06-30 16:12:59'),
      (1390,7,NULL,22,3,'EM_ANDAMENTO',20,'2026-11-13 01:43:21');
    INSERT INTO lms_matricula_ciclos VALUES
      (2671,1390,6,1,NULL,'NAO_INICIADO',0,NULL,NULL,NULL,0,NULL),
      (2305,2057,6,1,NULL,'EM_ANDAMENTO',2,'2026-10-16 15:08:46',NULL,0,1,NULL),
      (508,385,6,1,NULL,'EM_ANDAMENTO',100,'2026-06-30 16:12:59',NULL,100,3,NULL),
      (2671,1390,7,1,NULL,'NAO_INICIADO',19,NULL,NULL,91,2,NULL);
  `);
  return db;
}
function row(db,id,empresa=6) {
  return db.prepare('SELECT * FROM lms_matricula_ciclos WHERE id=? AND empresa_id=?').get(id,empresa);
}
function auditCount(db) {
  return db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='LMS_CYCLE_PROGRESS_RECONCILED_0582'").get().n;
}

describe('Schema V2 #2215 — exact, one-shot cycle repair', () => {
  it('repairs only two approved cycles, preserves existing 100% evidence and tenant 7', () => {
    const db = fixture();
    db.exec(sql);
    assert.deepEqual([row(db,2671).status,row(db,2671).progresso_pct,row(db,2671).data_inicio],
      ['EM_ANDAMENTO',2,'2026-11-13 01:43:21']);
    assert.equal(row(db,2305).progresso_pct,5);
    assert.deepEqual([row(db,508).status,row(db,508).progresso_pct,row(db,508).score_final,row(db,508).tentativas],
      ['EM_ANDAMENTO',100,100,3]);
    assert.equal(row(db,2671,7).progresso_pct,19);
    assert.equal(auditCount(db),2);
    assert.throws(()=>db.exec(sql),/malformed JSON/);
    assert.equal(auditCount(db),2);
    db.close();
  });

  it('rejects progress changes between review and apply without writing', () => {
    const db = fixture();
    db.exec('UPDATE lms_matriculas SET progresso_pct=6 WHERE id=2057 AND empresa_id=6');
    assert.throws(()=>db.exec(sql),/malformed JSON/);
    assert.equal(auditCount(db),0);
    assert.equal(row(db,2671).progresso_pct,0);
    db.close();
  });

  it('rejects different current cycle or high-watermark without writing', () => {
    const db = fixture();
    db.exec('UPDATE lms_matricula_ciclos SET progresso_pct=99 WHERE id=508 AND empresa_id=6');
    assert.throws(()=>db.exec(sql),/malformed JSON/);
    assert.equal(auditCount(db),0);
    assert.equal(row(db,2305).progresso_pct,2);
    db.close();
  });

  it('rejects an incorrect tenant on a reviewed row', () => {
    const db = fixture();
    db.exec('UPDATE lms_matricula_ciclos SET empresa_id=8 WHERE id=2305 AND empresa_id=6');
    assert.throws(()=>db.exec(sql),/malformed JSON/);
    assert.equal(auditCount(db),0);
    db.close();
  });
});


describe('Schema V2 0582 production guard wiring', () => {
  it('requires official eight-gate verification before D1 mutation', () => {
    const flow=readFileSync(new URL('../../../.github/workflows/apply-schema-change-v2.yml',import.meta.url),'utf8');
    const gate=flow.indexOf('Verify eight official gates for sensitive production data corrections');
    const apply=flow.indexOf('Apply schema and ledger atomically');
    assert.ok(gate>=0 && apply>gate);
    assert.match(flow.slice(gate,gate+650),/inputs\.change_id == 'lms-cycle-progress-reconcile-0582'/);
    assert.match(flow.slice(gate,apply),/node scripts\/ci\/verify-release-gates\.mjs/);
  });
});
