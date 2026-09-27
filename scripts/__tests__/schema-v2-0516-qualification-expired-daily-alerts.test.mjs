// source_reference: governed Schema V2 qualification-expired-daily-alerts-0516
// operational_decision: validate corrected 30d wording + explicit daily expired EMAIL stage
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

const MANIFEST = 'worker-airtrust/schema-v2/qualification-expired-daily-alerts-0516.json';

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

test('0516 manifest pins reviewed SQL and plan hashes', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, 'qualification-expired-daily-alerts-0516');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
});

test('0516 adds tenant-configurable fields, corrects 30-day template, and creates expired stage', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath, 'utf8');
  const dir = mkdtempSync(path.join(tmpdir(), 'airtrust-0516-'));
  const dbPath = path.join(dir, 'db.sqlite');
  const setup = `
    CREATE TABLE notificacoes_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      dias_antes INTEGER NOT NULL,
      urgencia TEXT,
      destinatarios TEXT,
      template TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    INSERT INTO notificacoes_config(tipo,ativo,dias_antes,urgencia,destinatarios,template)
    VALUES
      ('EMAIL',1,45,'low',NULL,'Aviso 45'),
      ('EMAIL',1,30,'medium','["legacy@example.com"]','Lembrete antigo'),
      ('EMAIL',1,15,'high',NULL,'Alerta 15'),
      ('EMAIL',1,7,'critical',NULL,'Urgente 7');
  `;
  assert.equal(runSql(dbPath, setup).status, 0);
  assert.equal(runSql(dbPath, sql).status, 0);
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM pragma_table_info('notificacoes_config') WHERE name IN ('empresa_id','codigo','assunto_template','frequencia','intervalo_dias');`), '5');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM notificacoes_config WHERE tipo='EMAIL' AND codigo IN ('QUALIFICACAO_45D','QUALIFICACAO_30D','QUALIFICACAO_15D','QUALIFICACAO_7D');`), '4');
  assert.equal(query(dbPath, `SELECT COUNT(*) FROM notificacoes_config WHERE tipo='EMAIL' AND urgencia='expired' AND ativo=1 AND deleted_at IS NULL;`), '1');
  assert.equal(query(dbPath, `SELECT dias_antes FROM notificacoes_config WHERE tipo='EMAIL' AND urgencia='expired' LIMIT 1;`), '0');
  assert.match(query(dbPath, `SELECT template FROM notificacoes_config WHERE tipo='EMAIL' AND urgencia='expired' LIMIT 1;`), /está vencida há \{\{dias_vencida\}\}/);
  assert.match(query(dbPath, `SELECT template FROM notificacoes_config WHERE tipo='EMAIL' AND dias_antes=30 AND urgencia='medium' LIMIT 1;`), /entrou no período de vencimento/);
  assert.equal(query(dbPath, `SELECT destinatarios FROM notificacoes_config WHERE tipo='EMAIL' AND dias_antes=30 AND urgencia='medium' LIMIT 1;`), '["legacy@example.com"]');
});

test('Schema V2 builder accepts 0516 and appends exactly one ledger row', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0516-bundle-')), 'apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath: out,
    expectedChangeId: 'qualification-expired-daily-alerts-0516',
    githubSha: 'c'.repeat(40),
  });
  assert.equal(result.changeId, 'qualification-expired-daily-alerts-0516');
  const applied = readFileSync(out, 'utf8');
  assert.equal((applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
  assert.match(applied, /QUALIFICACAO_VENCIDA/);
  assert.match(applied, /ALTER TABLE notificacoes_config ADD COLUMN empresa_id/);
  assert.match(applied, /entrou no período de vencimento/);
});
