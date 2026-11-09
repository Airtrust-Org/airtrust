// source_reference: incident #2078; worker-airtrust/schema-v2/plans/notificacoes-log-empresa-assunto-index-0576.md
// operational_decision: synthetic, in-memory SQLite fixtures only; no operational database writes.
// dry_run_required: no remote connection; schema applied to disposable :memory: database.
// rollback_plan_required: dispose SQLite in-memory database at test end; no production state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const sql = read('worker-airtrust/schema-v2/changes/0576_notificacoes_log_empresa_assunto_index.sql');
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('reviewed manifest pins the exact SQL and plan hashes', () => {
  const manifest = JSON.parse(read('worker-airtrust/schema-v2/notificacoes-log-empresa-assunto-index-0576.json'));
  assert.equal(manifest.changeId, 'notificacoes-log-empresa-assunto-index-0576');
  assert.equal(manifest.fileHash, sha(sql));
  assert.equal(manifest.planHash, sha(read(manifest.planPath)));
  const workflow = read('.github/workflows/staging-apply-schema-v2.yml');
  assert.ok(workflow.includes(manifest.fileHash));
  assert.ok(workflow.includes(manifest.planHash));
});

test('index is additive, preserves rows and lets SQLite SEARCH prefix ranges', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE notificacoes_log(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, assunto TEXT, status TEXT);
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 5000)
      INSERT INTO notificacoes_log(empresa_id, assunto, status) SELECT 6, NULL, 'erro' FROM n;
    INSERT INTO notificacoes_log(empresa_id, assunto, status) VALUES (6,'[COMPLIANCE_TREINAMENTO:1]','enviada');`);
  const before = db.prepare('SELECT COUNT(*) AS c FROM notificacoes_log').get().c;
  db.exec(sql);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM notificacoes_log').get().c, before);
  const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM notificacoes_log
    WHERE empresa_id = 6 AND assunto >= '[COMPLIANCE_TREINAMENTO:' AND assunto < '[COMPLIANCE_TREINAMENTO;'`).all()
    .map((r) => r.detail).join('\n');
  assert.match(plan, /SEARCH notificacoes_log USING (COVERING )?INDEX idx_notificacoes_log_empresa_assunto \(empresa_id=\? AND assunto>\? AND assunto<\?\)/);
  assert.throws(() => db.exec(sql), /already exists/);
});
