// source_reference: 0438 schema-v2 unit tests
// operational_decision: test-only schema-v2 manifest and apply verification
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/0438-rdv-coordination-workflow-production.json';
const MIGRATION = 'worker-airtrust/migrations/0438_controle_voos_rdv_coordenacao_workflow.sql';
const BASE_0410 = 'worker-airtrust/migrations/0410_controle_voos_n1_schema.sql';
const BASE_0411 = 'worker-airtrust/migrations/0411_controle_voos_sigvoos_integration_schema.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function schemaV2Sql() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return readFileSync(manifest.filePath, 'utf8');
}

function disposableBase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(BASE_0410, 'utf8'));
  db.exec(readFileSync(BASE_0411, 'utf8'));
  return db;
}

function tableExists(db, table) {
  return Boolean(
    db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(table),
  );
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function seedFlight(db, empresaId = 1) {
  const airportId = Number(
    db.prepare('INSERT INTO cv_aeroportos (empresa_id, codigo, nome) VALUES (?, ?, ?)')
      .run(empresaId, `APT-${empresaId}`, `Aeroporto ${empresaId}`).lastInsertRowid,
  );
  const tipoId = Number(
    db.prepare('INSERT INTO cv_tipos_voo (empresa_id, codigo, nome) VALUES (?, ?, ?)')
      .run(empresaId, `TIPO-${empresaId}`, `Tipo ${empresaId}`).lastInsertRowid,
  );
  const naturezaId = Number(
    db.prepare('INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome) VALUES (?, ?, ?)')
      .run(empresaId, `NAT-${empresaId}`, `Natureza ${empresaId}`).lastInsertRowid,
  );

  return Number(
    db.prepare(`
      INSERT INTO cv_voos (
        empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada
      ) VALUES (?, ?, '2026-08-30', ?, ?, ?, ?, '08:00', '09:00')
    `).run(
      empresaId,
      `PT-${empresaId}`,
      airportId,
      airportId,
      tipoId,
      naturezaId,
    ).lastInsertRowid,
  );
}

test('pins reviewed hashes for 0438-rdv-coordination-workflow-production', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, '0438-rdv-coordination-workflow-production');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(
    manifest.filePath,
    'worker-airtrust/schema-v2/changes/0438_controle_voos_rdv_coordenacao_workflow.sql',
  );
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0438 touches no existing table destructively — only additive DDL plus scratch guards', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  for (const sql of [change, migration]) {
    const body = executable(sql);

    // The RDV coordination markers the mounted Worker routes depend on.
    assert.match(body, /ALTER TABLE cv_rdv_operacional ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'rascunho'/);
    assert.match(body, /ALTER TABLE cv_rdv_operacional ADD COLUMN versao INTEGER NOT NULL DEFAULT 1/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_rdv_aprovacoes/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_rdv_revisoes/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_rdv_alertas/);
    assert.match(body, /CREATE TABLE IF NOT EXISTS cv_voo_abastecimentos/);
    assert.match(
      body,
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero_unique/,
    );

    // No ALTER against any existing table other than the additive cv_rdv_operacional columns.
    for (const m of body.matchAll(/ALTER TABLE\s+(\w+)/gi)) {
      assert.equal(m[1], 'cv_rdv_operacional');
    }

    // Every DROP targets only the transient preflight/rollback guard tables.
    for (const m of body.matchAll(/DROP TABLE IF EXISTS\s+(\w+)/gi)) {
      assert.match(m[1], /^_(?:preflight|rollback)_0438_/);
    }
    assert.doesNotMatch(body, /\bDROP\s+(?:INDEX|TRIGGER|VIEW|COLUMN)\b/i);
    assert.doesNotMatch(body, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(body, /\bREPLACE\s+INTO\b/i);

    // The only INSERTs are the fail-closed guard probes into the scratch tables.
    for (const m of body.matchAll(/INSERT INTO\s+(\w+)/gi)) {
      assert.match(m[1], /^_(?:preflight|rollback)_0438_/);
    }
  }
});

test('the migration/ copy and the schema-v2 change carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (sql) => executable(sql).replace(/\s+/g, ' ').trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('official Schema V2 apply builder accepts 0438 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0438-')),
    '0438-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: '0438-rdv-coordination-workflow-production',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, '0438-rdv-coordination-workflow-production');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero_unique/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'0438-rdv-coordination-workflow-production'/);
  assert.match(applied, /'production-d1-baseline-v2-20260714'/);
});

test('0438 applies on a disposable database built from the real 0410/0411 base and enforces its guards', () => {
  const db = disposableBase();
  try {
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'workflow_status'), false);
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'versao'), false);
    for (const table of ['cv_rdv_aprovacoes', 'cv_rdv_revisoes', 'cv_rdv_alertas', 'cv_voo_abastecimentos']) {
      assert.equal(tableExists(db, table), false, `${table} must be absent before 0438`);
    }

    const change = schemaV2Sql();
    db.exec(change);

    assert.equal(columnExists(db, 'cv_rdv_operacional', 'workflow_status'), true);
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'versao'), true);
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'motivo_devolucao'), true);
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'motivo_cancelamento'), true);
    for (const table of ['cv_rdv_aprovacoes', 'cv_rdv_revisoes', 'cv_rdv_alertas', 'cv_voo_abastecimentos']) {
      assert.equal(tableExists(db, table), true, `${table} must exist after 0438`);
    }

    const vooId = seedFlight(db, 1);
    const rdvId = Number(
      db.prepare(`
        INSERT INTO cv_rdv_operacional (empresa_id, voo_id, numero, data_voo)
        VALUES (1, ?, 'RDV-0438-1', '2026-08-30')
      `).run(vooId).lastInsertRowid,
    );

    db.prepare(`
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, status)
      VALUES (1, ?, 1, 'APROVADO')
    `).run(rdvId);

    assert.throws(
      () => db.prepare('UPDATE cv_rdv_aprovacoes SET observacao = ? WHERE rdv_id = ?').run('mutacao', rdvId),
      /append-only/i,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, status)
        VALUES (2, ?, 1, 'APROVADO')
      `).run(rdvId),
      /empresa_id mismatch/i,
    );
    assert.throws(
      () => db.prepare("UPDATE cv_rdv_operacional SET workflow_status = 'estado_invalido' WHERE id = ?")
        .run(rdvId),
      /workflow_status invalido/i,
    );

    db.prepare('INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa) VALUES (1, ?, 1)')
      .run(vooId);
    assert.throws(
      () => db.prepare('INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa) VALUES (1, ?, 1)')
        .run(vooId),
      /UNIQUE constraint failed|constraint/i,
    );

    // Raw reapplication is deliberately fail-closed before duplicate ALTER TABLE operations.
    assert.throws(() => db.exec(change), /constraint/i);
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'workflow_status'), true);
  } finally {
    db.close();
  }
});

test('0438 preflight rejects duplicate active etapa numbers before any schema marker is added', () => {
  const db = disposableBase();
  try {
    const vooId = seedFlight(db, 1);
    const insertEtapa = db.prepare(
      'INSERT INTO cv_voo_etapas (empresa_id, voo_id, numero_etapa) VALUES (1, ?, 1)',
    );
    insertEtapa.run(vooId);
    insertEtapa.run(vooId);

    assert.equal(columnExists(db, 'cv_rdv_operacional', 'workflow_status'), false);
    assert.equal(tableExists(db, 'cv_rdv_aprovacoes'), false);

    assert.throws(() => db.exec(schemaV2Sql()), /constraint/i);

    // The fail-closed probe runs before ALTER/CREATE statements that carry 0438 markers.
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'workflow_status'), false);
    assert.equal(columnExists(db, 'cv_rdv_operacional', 'versao'), false);
    assert.equal(tableExists(db, 'cv_rdv_aprovacoes'), false);
    assert.equal(tableExists(db, 'cv_rdv_revisoes'), false);
  } finally {
    db.close();
  }
});
