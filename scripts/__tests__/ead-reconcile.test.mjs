// source_reference: EAD reconciliation incident, PR #557.
// operational_decision: local SQLite fixture proves the allowlisted DML plan only.
// dry_run_required: YES — the reconciler is generated before any remote apply.
// rollback_plan_required: YES — every generated operation is restored exactly.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const reconciler = join(root, 'scripts/ead-reconcile.mjs');
const dir = mkdtempSync(join(tmpdir(), 'airtrust-ead-reconcile-'));
const db = join(dir, 'fixture.sqlite');
const apply = join(dir, 'apply.sql');
const rollback = join(dir, 'rollback.sql');
const manifest = join(dir, 'manifest.json');

function sqlite(sql) {
  execFileSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
}

function runReconciler(extra = []) {
  return execFileSync(
    'node',
    [
      reconciler,
      '--db-file',
      db,
      '--dry-run',
      '--manifest',
      manifest,
      '--apply-sql-output',
      apply,
      '--rollback-output',
      rollback,
      ...extra,
    ],
    { encoding: 'utf8' },
  );
}

function scalar(sql) {
  return execFileSync('sqlite3', [db, sql], { encoding: 'utf8' }).trim();
}

function createFixture() {
  const romuloIds = [5305, 5307, 5308, 5321, 5323, 5373, 5374, 5375, 5440];
  sqlite(`
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE qualificacoes_categorias (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, cor TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, codigo_anac TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER, categoria_id INTEGER, categoria TEXT, codigo TEXT, nome TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER, categoria_id INTEGER, categoria TEXT, deleted_at TEXT);
    INSERT INTO empresas VALUES (6, 'Costa do Sol Táxi Aéreo', NULL), (7, 'Tenant de teste', NULL);
    INSERT INTO qualificacoes_categorias VALUES (13, 6, 'EAD', '#0000FF', 0, NULL), (3, 6, 'Treinamento Teórico', '#999999', 1, NULL);
    INSERT INTO funcionarios VALUES (1, 6, 'Rômulo Harfield Castanheira de Menezes', '15722-4', NULL), (2, 6, 'Outro EAD', '000', NULL), (3, 7, 'Isolado', '999', NULL);
    INSERT INTO qualificacoes_tipos VALUES (100, 6, NULL, 'EAD', 'EAD-001', 'Curso EAD', NULL), (101, 6, 3, 'EAD', 'EAD-002', 'Curso LMS EAD', NULL), (110, 6, 3, 'Treinamento Teórico', 'TEO-001', 'Teórico legítimo', NULL), (200, 7, 3, 'EAD', 'TENANT-001', 'EAD isolado', NULL);
    ${romuloIds.map((id, index) => `INSERT INTO qualificacoes_historico VALUES (${id}, 6, 1, 100, ${index < 3 ? 3 : index === 3 ? 'NULL' : 13}, ${index < 3 ? "'Treinamento Teórico'" : "'EAD'"}, NULL);`).join('\n')}
    INSERT INTO qualificacoes_historico VALUES (6000, 6, 2, 101, 3, 'Treinamento Teórico', NULL);
    INSERT INTO qualificacoes_historico VALUES (6001, 6, 2, 110, 3, 'Treinamento Teórico', NULL);
    INSERT INTO qualificacoes_historico VALUES (6002, 7, 3, 200, 3, 'Treinamento Teórico', NULL);
  `);
}

after(() => rmSync(dir, { recursive: true, force: true }));

describe('ead-reconcile', () => {
  it('reconciles only verified empresa 6 EAD records when the display name is non-abbreviated, is idempotent, and rolls back exactly', () => {
    createFixture();
    runReconciler();
    const initialManifest = JSON.parse(readFileSync(manifest, 'utf8'));
    assert.equal(initialManifest.total_operations, 9);
    assert.deepEqual(
      initialManifest.romulo_historico_ids,
      [5305, 5307, 5308, 5321, 5323, 5373, 5374, 5375, 5440],
    );
    assert.equal(initialManifest.ignored_records_count, 5);
    assert.equal(initialManifest.fail_closed_divergences.length, 0);
    assert.match(readFileSync(apply, 'utf8'), /^UPDATE qualificacoes_/m);
    assert.doesNotMatch(readFileSync(apply, 'utf8'), /DELETE|DROP|ALTER/);

    sqlite(readFileSync(apply, 'utf8'));
    assert.equal(
      scalar('SELECT cor || ":" || ativo FROM qualificacoes_categorias WHERE id = 13'),
      '#EABA0C:1',
    );
    assert.equal(
      scalar(
        'SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id = 6 AND categoria = "EAD" AND categoria_id = 13',
      ),
      '2',
    );
    assert.equal(
      scalar(
        'SELECT COUNT(*) FROM qualificacoes_historico WHERE id IN (5305,5307,5308,5321,5323,5373,5374,5375,5440) AND categoria_id = 13',
      ),
      '9',
    );
    assert.equal(
      scalar(
        "SELECT COUNT(*) FROM qualificacoes_historico WHERE id IN (5305,5307,5308,5321,5323,5373,5374,5375,5440) AND categoria = 'EAD'",
      ),
      '9',
    );
    assert.equal(scalar('SELECT categoria_id FROM qualificacoes_historico WHERE id = 6000'), '13');
    assert.equal(scalar('SELECT categoria_id FROM qualificacoes_historico WHERE id = 6001'), '3');
    assert.equal(scalar('SELECT categoria_id FROM qualificacoes_historico WHERE id = 6002'), '3');

    const exactRollback = readFileSync(rollback, 'utf8');
    runReconciler();
    assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).total_operations, 0);

    sqlite(exactRollback);
    assert.equal(
      scalar('SELECT cor || ":" || ativo FROM qualificacoes_categorias WHERE id = 13'),
      '#0000FF:0',
    );
    assert.equal(scalar('SELECT categoria_id FROM qualificacoes_historico WHERE id = 5305'), '3');
    assert.equal(
      scalar('SELECT categoria_id IS NULL FROM qualificacoes_historico WHERE id = 5321'),
      '1',
    );
    assert.equal(scalar('SELECT categoria_id FROM qualificacoes_historico WHERE id = 6000'), '3');
  });

  it('fails closed on SQLite errors instead of treating them as zero records', () => {
    const missingDb = join(dir, 'missing.sqlite');
    const result = spawnSync(
      'node',
      [
        reconciler,
        '--db-file',
        missingDb,
        '--dry-run',
        '--apply-sql-output',
        join(dir, 'missing.sql'),
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /failed closed/i);
  });
});
