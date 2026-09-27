// source_reference: test fixture for governed Schema V2 qualification-expiry-email-stages-0515
// operational_decision: validate idempotent 45d/30d EMAIL stage activation without tenant data
// dry_run_required: false (local disposable SQLite test only)
// rollback_plan_required: false (local disposable SQLite test only)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/qualification-expiry-email-stages-0515.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runSql(dbPath, sql) {
  return spawnSync('sqlite3', [dbPath], { input: sql, encoding: 'utf8' });
}

function query(dbPath, sql) {
  const r = spawnSync('sqlite3', ['-noheader', dbPath, sql], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('0515 manifest pins reviewed SQL and plan hashes', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'qualification-expiry-email-stages-0515');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0515 activates exactly the intended email stages and is idempotent', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath, 'utf8');
  const dir = mkdtempSync(path.join(tmpdir(), 'airtrust-0515-'));
  const dbPath = path.join(dir, 'db.sqlite');
  const setup = `
    CREATE TABLE notificacoes_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      dias_antes INTEGER NOT NULL,
      urgencia TEXT,
      destinatarios TEXT,
      template TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    INSERT INTO notificacoes_config(tipo,ativo,dias_antes,urgencia,destinatarios,template)
    VALUES ('EMAIL',0,30,'medium','["legacy@example.com"]','legacy 30');
  `;
  assert.equal(runSql(dbPath, setup).status, 0);
  assert.equal(runSql(dbPath, sql).status, 0);
  assert.equal(runSql(dbPath, sql).status, 0, '0515 must be idempotent');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM notificacoes_config WHERE tipo='EMAIL' AND dias_antes=45 AND urgencia='low' AND ativo=1 AND deleted_at IS NULL;`), '1');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM notificacoes_config WHERE tipo='EMAIL' AND dias_antes=30 AND urgencia='medium' AND ativo=1 AND deleted_at IS NULL;`), '1');
  assert.equal(query(dbPath, `SELECT destinatarios FROM notificacoes_config WHERE tipo='EMAIL' AND dias_antes=30 AND urgencia='medium' LIMIT 1;`), '["legacy@example.com"]');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM notificacoes_config WHERE tipo<>'EMAIL';`), '0');
});

test('Schema V2 builder accepts 0515 and appends exactly one ledger row', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0515-bundle-')), 'apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath: out,
    expectedChangeId: 'qualification-expiry-email-stages-0515',
    githubSha: 'b'.repeat(40),
  });
  assert.equal(result.changeId, 'qualification-expiry-email-stages-0515');
  const applied = readFileSync(out, 'utf8');
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /dias_antes = 45/);
  assert.match(applied, /dias_antes = 30/);
});
