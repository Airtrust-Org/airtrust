#!/usr/bin/env node
// source_reference: PR #110 eDB isolated persisted lifecycle; worker-airtrust/migrations/0477-0480 and worker-airtrust/wrangler.dev.toml.
// operational_decision: execute synthetic DML only against Wrangler local D1 with the tracked dummy database id to prove schema parity and immutability; never target remote staging/production or external ANAC services.
// dry_run_required: this CI validator is itself an isolated validation run; all DML is confined to a fresh temporary --local --persist-to directory and Cloudflare credentials are removed before every Wrangler invocation.
// rollback_plan_required: delete the temporary local D1 persistence directory in the finally block; no remote rollback exists or is needed because remote writes are structurally disallowed.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '../..');
const workerDir = join(rootDir, 'worker-airtrust');
const configPath = join(workerDir, 'wrangler.dev.toml');
const stateDir = mkdtempSync(join(tmpdir(), 'airtrust-edb-local-d1-'));
const databaseName = 'airtrust-db-local';

const expectedTables = [
  'edb_diarios',
  'edb_volumes',
  'edb_situacoes_tecnicas',
  'edb_ciencias_tecnicas_pic',
  'edb_registro_revisoes',
  'edb_registro_estado',
  'edb_assinaturas',
  'edb_discrepancias_tecnicas',
  'edb_acoes_manutencao',
  'edb_auditoria_eventos',
  'edb_anac_outbox',
  'edb_anac_recibos',
  'edb_incidentes_integridade',
];

const expectedTriggers = [
  'trg_edb_ciencia_require_snapshot_binding',
  'trg_edb_revisao_require_scope_and_chain',
  'trg_edb_assinatura_require_lifecycle',
  'trg_edb_estado_transition_guard',
  'trg_edb_anac_outbox_require_operator_signed',
  'trg_edb_anac_outbox_identity_immutable',
  'trg_edb_anac_outbox_no_delete',
  'trg_edb_anac_recibo_require_outbox_scope',
  'trg_edb_anac_recibos_no_update',
  'trg_edb_anac_recibos_no_delete',
  'trg_edb_volume_require_diary_scope',
  'trg_edb_discrepancia_require_revision_scope',
  'trg_edb_acao_manutencao_require_discrepancy_scope',
  'trg_edb_auditoria_require_scope_and_chain',
  'trg_edb_incidente_require_diary_scope',
  'trg_edb_diario_identity_immutable',
  'trg_edb_diario_status_transition_guard',
  'trg_edb_diario_no_delete',
  'trg_edb_volume_status_transition_guard',
  'trg_edb_volume_closure_shape_guard',
  'trg_edb_volume_closed_evidence_immutable',
  'trg_edb_volume_no_delete',
  'trg_edb_incidente_progress_guard',
  'trg_edb_incidente_status_transition_guard',
  'trg_edb_incidente_no_delete',
  'trg_edb_situacoes_tecnicas_no_update',
  'trg_edb_situacoes_tecnicas_no_delete',
];

function fail(message) {
  throw new Error(message);
}

function sanitizedEnv() {
  const env = { ...process.env, CI: 'true' };
  for (const key of [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_D1_MIGRATION_API_TOKEN',
    'CLOUDFLARE_WORKER_API_TOKEN',
    'CF_API_TOKEN',
    'CF_ACCOUNT_ID',
  ]) {
    delete env[key];
  }
  return env;
}

function wrangler(extraArgs, { expectFailure = false } = {}) {
  const args = [
    'wrangler',
    'd1',
    'execute',
    databaseName,
    '--local',
    '--persist-to',
    stateDir,
    '--config',
    'wrangler.dev.toml',
    '--yes',
    ...extraArgs,
  ];
  const result = spawnSync('npx', args, {
    cwd: workerDir,
    env: sanitizedEnv(),
    encoding: 'utf8',
  });

  if (expectFailure) {
    if (result.status === 0) {
      fail(`Expected local D1 command to fail but it succeeded: npx ${args.join(' ')}`);
    }
    return `${result.stdout || ''}\n${result.stderr || ''}`;
  }

  if (result.status !== 0) {
    fail(
      `Local D1 command failed (${result.status}): npx ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout || '';
}

function parseRows(stdout) {
  const trimmed = String(stdout || '').trim();
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start < 0 || end <= start) fail(`Wrangler JSON output not found:\n${trimmed}`);
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = envelope?.results;
  if (!Array.isArray(rows)) fail(`Wrangler JSON results missing: ${JSON.stringify(parsed)}`);
  return rows;
}

function queryRows(sql) {
  return parseRows(wrangler(['--json', '--command', sql]));
}

function assertObject(type, name) {
  const safeName = name.replaceAll("'", "''");
  const rows = queryRows(
    `SELECT COUNT(*) AS total FROM sqlite_master WHERE type='${type}' AND name='${safeName}';`,
  );
  if (Number(rows[0]?.total) !== 1) fail(`Missing local D1 ${type}: ${name}`);
}

function assertColumn(table, column) {
  const rows = queryRows(
    `SELECT COUNT(*) AS total FROM pragma_table_info('${table}') WHERE name='${column}';`,
  );
  if (Number(rows[0]?.total) !== 1) fail(`Missing local D1 column: ${table}.${column}`);
}

try {
  const config = readFileSync(configPath, 'utf8');
  if (!config.includes('database_name = "airtrust-db-local"')) fail('Local D1 database name guard failed');
  if (!config.includes('database_id = "00000000-0000-0000-0000-000000000001"')) {
    fail('Local D1 dummy database id guard failed');
  }
  if (!config.includes('ENVIRONMENT = "development"')) fail('Local environment guard failed');

  wrangler([
    '--command',
    'CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY); CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY);',
  ]);

  for (const migration of [
    '0477_edb_operational_core.sql',
    '0478_edb_anac_receipt_integrity.sql',
    '0479_edb_relational_integrity.sql',
    '0480_edb_diary_lifecycle_integrity.sql',
  ]) {
    wrangler(['--file', `./migrations/${migration}`]);
  }

  for (const table of expectedTables) assertObject('table', table);
  for (const trigger of expectedTriggers) assertObject('trigger', trigger);

  for (const column of [
    'tempo_voo_diurno_minutos',
    'tempo_voo_noturno_minutos',
    'tempo_voo_total_minutos',
    'tempo_ifr_real_minutos',
    'tempo_ifr_simulado_minutos',
    'tempo_ifr_nao_classificado_minutos',
    'pousos_total',
    'ciclos',
    'combustivel_antes_partida_motor',
    'pessoas_a_bordo_total',
    'carga_regulatoria_kg',
    'ocorrencias_json',
  ]) {
    assertColumn('cv_voo_etapas', column);
  }
  assertColumn('cv_voo_tripulantes', 'codigo_funcao_anac');
  for (const column of ['voo_id', 'situacao_tecnica_id', 'actor_json']) {
    assertColumn('edb_auditoria_eventos', column);
  }

  wrangler([
    '--command',
    `INSERT INTO edb_situacoes_tecnicas (
      id, empresa_id, voo_id, aeronave_id, aircraft_json, maintenance_json,
      technical_content_sha256, canonical_snapshot_sha256, captured_at, created_by
    ) VALUES (
      'qa-local-d1-tech-1', 991001, 991002, 991003, '{}', '{}',
      '${'0'.repeat(64)}', '${'1'.repeat(64)}', '2026-08-30T20:00:00.000Z', 991004
    );`,
  ]);

  const immutableFailure = wrangler(
    [
      '--command',
      "UPDATE edb_situacoes_tecnicas SET aircraft_json='{\"mutated\":true}' WHERE id='qa-local-d1-tech-1';",
    ],
    { expectFailure: true },
  );
  if (!immutableFailure.includes('EDB_TECHNICAL_SITUATION_IMMUTABLE')) {
    fail(`Expected immutability trigger evidence not found:\n${immutableFailure}`);
  }

  const receiptCount = queryRows('SELECT COUNT(*) AS total FROM edb_anac_recibos;');
  if (Number(receiptCount[0]?.total) !== 0) fail('Local D1 unexpectedly contains ANAC receipts');

  console.log(
    `EDB_LOCAL_D1_PARITY_PASS tables=${expectedTables.length} triggers=${expectedTriggers.length} remoteWrites=0 anacTransmission=0`,
  );
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
