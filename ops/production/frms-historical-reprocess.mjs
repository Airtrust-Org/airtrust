#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { recalcularPipeline } from '../../worker-airtrust/src/lib/frms/db-service-jornadas.ts';
import { carregarLimites } from '../../worker-airtrust/src/lib/frms/db-service-config.ts';

const JOB_NAME = 'frms_historical_reprocess_v2';
const PAGE_SIZE = 250;
const FORMULA_DEFAULT = 'frms-regulatory-integrity-20260804-v2';
const CALCULATED_JOURNEY_COLUMNS = [
  'duracao_jornada_minutos',
  'hora_acordou',
  'sono_efetivo_min',
  'fonte_sono',
  'acordou_na_wocl',
  'repouso_regulatorio_min',
  'updated_at',
];

function usage() {
  return [
    'Usage:',
    '  node frms-historical-reprocess.mjs --target sqlite --sqlite-file <db> --source-sha <sha> --report <json>',
    '  node frms-historical-reprocess.mjs --target remote --account-id <id> --database-id <id> --source-sha <sha> --approved-dry-run <json> --report <json>',
    '  node frms-historical-reprocess.mjs --target remote --operation rollback --scope-key <scope> --account-id <id> --database-id <id> --source-sha <sha> --report <json>',
    '',
    'The remote API token is read only from CLOUDFLARE_API_TOKEN.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    target: null,
    operation: 'execute',
    sqliteFile: null,
    accountId: null,
    databaseId: null,
    sourceSha: null,
    formulaVersion: FORMULA_DEFAULT,
    approvedDryRun: null,
    report: null,
    scopeKey: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target') args.target = argv[++index] ?? null;
    else if (arg === '--operation') args.operation = argv[++index] ?? null;
    else if (arg === '--sqlite-file') args.sqliteFile = argv[++index] ?? null;
    else if (arg === '--account-id') args.accountId = argv[++index] ?? null;
    else if (arg === '--database-id') args.databaseId = argv[++index] ?? null;
    else if (arg === '--source-sha') args.sourceSha = argv[++index] ?? null;
    else if (arg === '--formula-version') args.formulaVersion = argv[++index] ?? null;
    else if (arg === '--approved-dry-run') args.approvedDryRun = argv[++index] ?? null;
    else if (arg === '--report') args.report = argv[++index] ?? null;
    else if (arg === '--scope-key') args.scopeKey = argv[++index] ?? null;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['sqlite', 'remote'].includes(args.target)) {
    throw new Error('--target must be sqlite or remote.');
  }
  if (!['execute', 'rollback'].includes(args.operation)) {
    throw new Error('--operation must be execute or rollback.');
  }
  if (!args.sourceSha || !/^[0-9a-f]{40}$/.test(args.sourceSha)) {
    throw new Error('--source-sha must be an exact lowercase 40-character SHA.');
  }
  if (!args.formulaVersion || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(args.formulaVersion)) {
    throw new Error('--formula-version is invalid.');
  }
  if (!args.report) throw new Error('--report is required.');
  if (args.target === 'sqlite' && !args.sqliteFile) {
    throw new Error('--sqlite-file is required for sqlite target.');
  }
  if (args.target === 'remote') {
    if (!args.accountId || !args.databaseId) {
      throw new Error('--account-id and --database-id are required for remote target.');
    }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN is required for remote target.');
    }
    if (args.operation === 'execute' && !args.approvedDryRun) {
      throw new Error('--approved-dry-run is required for remote execution.');
    }
  }
  if (args.operation === 'rollback' && !args.scopeKey) {
    throw new Error('--scope-key is required for rollback.');
  }
  return args;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sanitizeError(error) {
  return (error instanceof Error ? error.message : String(error ?? 'UNKNOWN_ERROR'))
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 400);
}

function bindValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

class PreparedStatementAdapter {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new PreparedStatementAdapter(this.database, this.sql, params.map(bindValue));
  }

  async first(columnName) {
    const result = await this.database.execute(this.sql, this.params);
    const row = result.results[0] ?? null;
    return columnName && row ? row[columnName] : row;
  }

  async all() {
    const result = await this.database.execute(this.sql, this.params);
    return { success: true, results: result.results, meta: result.meta };
  }

  async run() {
    const result = await this.database.execute(this.sql, this.params);
    return { success: true, results: result.results, meta: result.meta };
  }

  async raw(options = {}) {
    const result = await this.database.execute(this.sql, this.params);
    if (options.columnNames && result.results.length > 0) {
      const columns = Object.keys(result.results[0]);
      return [columns, ...result.results.map((row) => columns.map((column) => row[column]))];
    }
    return result.results.map((row) => Object.values(row));
  }
}

class SqliteD1Adapter {
  constructor(file) {
    this.sqlite = new DatabaseSync(file);
  }

  prepare(sql) {
    return new PreparedStatementAdapter(this, sql);
  }

  async batch(statements) {
    const results = [];
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  async execute(sql, params) {
    const statement = this.sqlite.prepare(sql);
    const isQuery = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql);
    if (isQuery) {
      const results = statement.all(...params);
      return { results, meta: { changes: 0 } };
    }
    const outcome = statement.run(...params);
    return {
      results: [],
      meta: {
        changes: Number(outcome.changes ?? 0),
        last_row_id: Number(outcome.lastInsertRowid ?? 0),
      },
    };
  }

  close() {
    this.sqlite.close();
  }
}

class RemoteD1Adapter {
  constructor({ accountId, databaseId, token }) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.token = token;
  }

  prepare(sql) {
    return new PreparedStatementAdapter(this, sql);
  }

  async batch(statements) {
    const payload = statements.map((statement) => ({
      sql: statement.sql,
      params: statement.params,
    }));
    const entries = await this.request(payload);
    return entries.map((entry) => ({
      success: true,
      results: entry.results ?? [],
      meta: entry.meta ?? {},
    }));
  }

  async execute(sql, params) {
    const entries = await this.request({ sql, params });
    const entry = entries[0] ?? { results: [], meta: {} };
    return { results: entry.results ?? [], meta: entry.meta ?? {} };
  }

  async request(body) {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success) {
        const entries = Array.isArray(payload.result) ? payload.result : [payload.result];
        for (const entry of entries) {
          if (entry?.success === false) {
            throw new Error(`D1_QUERY_FAILED: ${JSON.stringify(entry.error ?? entry)}`);
          }
        }
        return entries.filter(Boolean);
      }
      lastError = new Error(
        `D1_HTTP_${response.status}: ${JSON.stringify(payload?.errors ?? payload ?? null)}`,
      );
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    throw lastError ?? new Error('D1_REQUEST_FAILED');
  }
}

async function queryRows(db, sql, ...params) {
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all();
  return result.results ?? [];
}

async function queryOne(db, sql, ...params) {
  return db
    .prepare(sql)
    .bind(...params)
    .first();
}

async function assertLedgerSchema(db) {
  const required = ['cron_job_state', 'cron_job_items', 'cron_job_runs'];
  for (const table of required) {
    const row = await queryOne(
      db,
      `SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = ?`,
      table,
    );
    if (Number(row?.total ?? 0) !== 1) {
      throw new Error(`FRMS_REPROCESS_LEDGER_SCHEMA_MISSING:${table}`);
    }
  }
}

async function loadInventory(db) {
  const overview = await queryOne(
    db,
    `SELECT COUNT(*) AS jornadas,
            COUNT(DISTINCT COALESCE(j.empresa_id, f.empresa_id)) AS empresas,
            MIN(j.data) AS primeira_data,
            MAX(j.data) AS ultima_data
       FROM frms_jornada j
       JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL
      WHERE j.deleted_at IS NULL`,
  );
  const mismatch = await queryOne(
    db,
    `SELECT COUNT(*) AS total
       FROM frms_jornada j
       LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL
      WHERE j.deleted_at IS NULL
        AND (f.id IS NULL OR (j.empresa_id IS NOT NULL AND j.empresa_id <> f.empresa_id))`,
  );
  const candidates = await queryOne(
    db,
    `SELECT
       SUM(CASE WHEN j.hora_apresentacao IS NOT NULL AND j.hora_termino IS NOT NULL
                     AND j.hora_termino <= j.hora_apresentacao THEN 1 ELSE 0 END) AS cruza_meia_noite,
       SUM(CASE WHEN COALESCE(ff.processado_com_bug, 0) = 1 THEN 1 ELSE 0 END) AS processado_com_bug,
       SUM(CASE WHEN a.repouso_anterior_min < 0 AND a.repouso_suficiente = 1 THEN 1 ELSE 0 END) AS repouso_fail_open,
       SUM(CASE WHEN COALESCE(j.horas_voo_minutos, 0) > 0 AND COALESCE(a.hv_dia_min, 0) = 0 THEN 1 ELSE 0 END) AS hv_dia_zero,
       SUM(CASE WHEN ABS(ff.fator_hv_basica_pct) > 1 THEN 1 ELSE 0 END) AS fator_hv_fora_escala,
       SUM(CASE WHEN j.hora_acordou IS NOT NULL AND COALESCE(j.fonte_sono, 'PADRAO') = 'PADRAO' THEN 1 ELSE 0 END) AS despertar_real_como_padrao,
       SUM(CASE WHEN ff.effectiveness_pct <= 0 OR ff.effectiveness_pct >= 100 THEN 1 ELSE 0 END) AS effectiveness_saturada
     FROM frms_jornada j
     JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL
     LEFT JOIN frms_fatorizacao_jornada ff ON ff.jornada_id = j.id AND ff.deleted_at IS NULL
     LEFT JOIN frms_acumulo_rolling a
       ON a.tripulante_id = j.tripulante_id AND a.data_referencia = j.data AND a.deleted_at IS NULL
    WHERE j.deleted_at IS NULL`,
  );
  const byMonth = await queryRows(
    db,
    `SELECT COALESCE(j.empresa_id, f.empresa_id) AS empresa_id,
            substr(j.data, 1, 7) AS periodo,
            COUNT(*) AS jornadas
       FROM frms_jornada j
       JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL
      WHERE j.deleted_at IS NULL
      GROUP BY COALESCE(j.empresa_id, f.empresa_id), substr(j.data, 1, 7)
      ORDER BY empresa_id, periodo`,
  );
  return {
    overview: {
      jornadas: Number(overview?.jornadas ?? 0),
      empresas: Number(overview?.empresas ?? 0),
      primeira_data: overview?.primeira_data ?? null,
      ultima_data: overview?.ultima_data ?? null,
    },
    tenant_mismatch: Number(mismatch?.total ?? 0),
    candidates: Object.fromEntries(
      Object.entries(candidates ?? {}).map(([key, value]) => [key, Number(value ?? 0)]),
    ),
    by_month: byMonth.map((row) => ({
      empresa_id: Number(row.empresa_id),
      periodo: row.periodo,
      jornadas: Number(row.jornadas),
    })),
  };
}

async function loadConfigFingerprint(db) {
  const rows = await queryRows(
    db,
    `SELECT nome, valor_numerico, unidade, ativo, updated_at
       FROM frms_configuracao_limites
      WHERE deleted_at IS NULL
      ORDER BY nome, id`,
  );
  return { rows, hash: sha256(stableJson(rows)) };
}

function scopeFor({ target, formulaVersion, sourceSha, runId }) {
  return target === 'remote' ? `formula:${formulaVersion}:sha:${sourceSha}` : `dry-run:${runId}`;
}

async function initializeRun(db, context) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO cron_job_state (
         job_name, scope_key, cursor_value, watermark_from, watermark_to,
         last_started_at, metadata_json, created_at, updated_at
       ) VALUES (?, ?, NULL, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      JOB_NAME,
      context.scopeKey,
      context.inventory.overview.primeira_data,
      context.inventory.overview.ultima_data,
      JSON.stringify({
        formula_version: context.formulaVersion,
        source_sha: context.sourceSha,
        config_hash: context.configHash,
        inventory: context.inventory.overview,
      }),
    )
    .run();

  await db
    .prepare(
      `UPDATE cron_job_items
          SET status = 'FAILED',
              stage = 'INTERRUPTED_RETRY',
              last_error_code = 'INTERRUPTED_PREVIOUS_RUN',
              available_at = datetime('now'),
              updated_at = datetime('now')
        WHERE job_name = ? AND scope_key = ? AND status = 'PROCESSING'`,
    )
    .bind(JOB_NAME, context.scopeKey)
    .run();

  await db
    .prepare(
      `INSERT INTO cron_job_runs (
         id, job_name, scope_key, lease_owner, outcome, started_at,
         cursor_before, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'RUNNING', datetime('now'), ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      context.runId,
      JOB_NAME,
      context.scopeKey,
      `workflow:${context.runId}`,
      null,
      JSON.stringify({
        formula_version: context.formulaVersion,
        source_sha: context.sourceSha,
        config_hash: context.configHash,
        target: context.target,
      }),
    )
    .run();
}

async function finishRun(db, context, summary, errorCode = null) {
  const outcome = errorCode
    ? 'FAILED'
    : summary.failed > 0 || summary.pending > 0
      ? 'PARTIAL'
      : 'SUCCEEDED';
  await db
    .prepare(
      `UPDATE cron_job_runs
          SET outcome = ?, finished_at = datetime('now'), duration_ms = ?,
              processed_count = ?, failed_count = ?, cursor_after = ?, error_code = ?,
              metadata_json = ?, updated_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(
      outcome,
      Date.now() - context.startedAt,
      summary.processed,
      summary.failed,
      summary.cursor ?? null,
      errorCode,
      JSON.stringify({
        formula_version: context.formulaVersion,
        source_sha: context.sourceSha,
        config_hash: context.configHash,
        summary,
      }),
      context.runId,
    )
    .run();

  await db
    .prepare(
      `UPDATE cron_job_state
          SET cursor_value = ?, last_success_at = CASE WHEN ? = 'SUCCEEDED' THEN datetime('now') ELSE last_success_at END,
              last_error_at = CASE WHEN ? <> 'SUCCEEDED' THEN datetime('now') ELSE last_error_at END,
              last_error_code = ?, consecutive_failures = CASE WHEN ? = 'SUCCEEDED' THEN 0 ELSE consecutive_failures + 1 END,
              processed_total = processed_total + ?, failed_total = failed_total + ?,
              metadata_json = ?, updated_at = datetime('now')
        WHERE job_name = ? AND scope_key = ?`,
    )
    .bind(
      summary.cursor ?? null,
      outcome,
      outcome,
      errorCode ?? (outcome === 'SUCCEEDED' ? null : 'FRMS_REPROCESS_PARTIAL'),
      outcome,
      summary.processed,
      summary.failed,
      JSON.stringify({
        formula_version: context.formulaVersion,
        source_sha: context.sourceSha,
        config_hash: context.configHash,
        last_run_id: context.runId,
        summary,
      }),
      JOB_NAME,
      context.scopeKey,
    )
    .run();
  return outcome;
}

async function fetchJourneyPage(db, cursor) {
  const where = cursor
    ? `AND (
         CAST(j.tripulante_id AS INTEGER) > ?
         OR (CAST(j.tripulante_id AS INTEGER) = ? AND j.data > ?)
         OR (CAST(j.tripulante_id AS INTEGER) = ? AND j.data = ? AND j.id > ?)
       )`
    : '';
  const params = cursor
    ? [
        cursor.tripulante_id,
        cursor.tripulante_id,
        cursor.data,
        cursor.tripulante_id,
        cursor.data,
        cursor.id,
      ]
    : [];
  return queryRows(
    db,
    `SELECT j.*, f.empresa_id AS funcionario_empresa_id
       FROM frms_jornada j
       JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL
      WHERE j.deleted_at IS NULL
        ${where}
      ORDER BY CAST(j.tripulante_id AS INTEGER), j.data, j.id
      LIMIT ${PAGE_SIZE}`,
    ...params,
  );
}

function pickJourneySnapshot(journey) {
  return Object.fromEntries(
    CALCULATED_JOURNEY_COLUMNS.map((column) => [column, journey[column] ?? null]),
  );
}

async function loadCalculationSnapshot(db, journey) {
  const factorization = await queryRows(
    db,
    `SELECT * FROM frms_fatorizacao_jornada WHERE jornada_id = ? AND deleted_at IS NULL ORDER BY created_at, id`,
    journey.id,
  );
  const rolling = await queryRows(
    db,
    `SELECT * FROM frms_acumulo_rolling
      WHERE tripulante_id = ? AND data_referencia = ? AND deleted_at IS NULL
      ORDER BY created_at, id`,
    journey.tripulante_id,
    journey.data,
  );
  const alerts = await queryRows(
    db,
    `SELECT * FROM frms_alerta WHERE jornada_id = ? AND deleted_at IS NULL ORDER BY created_at, id`,
    journey.id,
  );
  return {
    journey: pickJourneySnapshot(journey),
    factorization,
    rolling,
    alerts,
    decision_used: alerts.some(
      (alert) => Number(alert.visualizado ?? 0) === 1 || Number(alert.resolvido ?? 0) === 1,
    ),
  };
}

function summarizeDelta(before, after) {
  const beforeFactor = before.factorization[0] ?? null;
  const afterFactor = after.factorization[0] ?? null;
  const beforeRolling = before.rolling[0] ?? null;
  const afterRolling = after.rolling[0] ?? null;
  return {
    duration_before: before.journey.duracao_jornada_minutos,
    duration_after: after.journey.duracao_jornada_minutos,
    effectiveness_before: beforeFactor?.effectiveness_pct ?? null,
    effectiveness_after: afterFactor?.effectiveness_pct ?? null,
    level_before: beforeFactor?.effectiveness_nivel ?? null,
    level_after: afterFactor?.effectiveness_nivel ?? null,
    rest_before: beforeRolling?.repouso_anterior_min ?? null,
    rest_after: afterRolling?.repouso_anterior_min ?? null,
    rest_sufficient_before: beforeRolling?.repouso_suficiente ?? null,
    rest_sufficient_after: afterRolling?.repouso_suficiente ?? null,
    hv_day_before: beforeRolling?.hv_dia_min ?? null,
    hv_day_after: afterRolling?.hv_dia_min ?? null,
    level_changed:
      (beforeFactor?.effectiveness_nivel ?? null) !== (afterFactor?.effectiveness_nivel ?? null),
    rest_classification_changed:
      (beforeRolling?.repouso_suficiente ?? null) !== (afterRolling?.repouso_suficiente ?? null),
    decision_used: before.decision_used,
  };
}

async function processJourney(db, context, journey, limites) {
  const existing = await queryOne(
    db,
    `SELECT status, payload_json FROM cron_job_items
      WHERE job_name = ? AND scope_key = ? AND item_key = ?`,
    JOB_NAME,
    context.scopeKey,
    journey.id,
  );
  if (existing?.status === 'SUCCEEDED') return { status: 'skipped_completed' };

  await db
    .prepare(
      `INSERT INTO cron_job_items (
         job_name, scope_key, item_key, stage, status, attempts, payload_json,
         available_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'QUEUED', 'PENDING', 0, ?, datetime('now'), datetime('now'), datetime('now'))
       ON CONFLICT(job_name, scope_key, item_key) DO NOTHING`,
    )
    .bind(
      JOB_NAME,
      context.scopeKey,
      journey.id,
      JSON.stringify({
        journey_hash: sha256(journey.id).slice(0, 16),
        empresa_id: Number(journey.funcionario_empresa_id),
        tripulante_hash: sha256(String(journey.tripulante_id)).slice(0, 16),
        data: journey.data,
      }),
    )
    .run();

  await db
    .prepare(
      `UPDATE cron_job_items
          SET status = 'PROCESSING', stage = 'SNAPSHOT_BEFORE', attempts = attempts + 1,
              last_error_code = NULL, last_error_message = NULL, updated_at = datetime('now')
        WHERE job_name = ? AND scope_key = ? AND item_key = ? AND status IN ('PENDING', 'FAILED')`,
    )
    .bind(JOB_NAME, context.scopeKey, journey.id)
    .run();

  const before = await loadCalculationSnapshot(db, journey);
  const payloadBase = {
    version: 1,
    run_id: context.runId,
    formula_version: context.formulaVersion,
    source_sha: context.sourceSha,
    config_hash: context.configHash,
    journey_hash: sha256(journey.id).slice(0, 16),
    empresa_id: Number(journey.funcionario_empresa_id),
    tripulante_hash: sha256(String(journey.tripulante_id)).slice(0, 16),
    data: journey.data,
    before,
  };
  await db
    .prepare(
      `UPDATE cron_job_items SET payload_json = ?, stage = 'RECALCULATING', updated_at = datetime('now')
        WHERE job_name = ? AND scope_key = ? AND item_key = ?`,
    )
    .bind(JSON.stringify(payloadBase), JOB_NAME, context.scopeKey, journey.id)
    .run();

  try {
    const result = await recalcularPipeline(db, journey, limites);
    if (String(result.fatorizacao?.id ?? '').startsWith('non-operational-')) {
      await db
        .prepare(
          `UPDATE cron_job_items
              SET status = 'SUCCEEDED', stage = 'SKIPPED_NON_OPERATIONAL', completed_at = datetime('now'),
                  payload_json = ?, updated_at = datetime('now')
            WHERE job_name = ? AND scope_key = ? AND item_key = ?`,
        )
        .bind(
          JSON.stringify({ ...payloadBase, skipped_non_operational: true }),
          JOB_NAME,
          context.scopeKey,
          journey.id,
        )
        .run();
      return { status: 'skipped_non_operational' };
    }

    const refreshed = await queryOne(db, `SELECT * FROM frms_jornada WHERE id = ?`, journey.id);
    const after = await loadCalculationSnapshot(db, refreshed);
    const delta = summarizeDelta(before, after);
    await db
      .prepare(
        `UPDATE cron_job_items
            SET status = 'SUCCEEDED', stage = ?, completed_at = datetime('now'),
                payload_json = ?, last_error_code = NULL, last_error_message = NULL,
                updated_at = datetime('now')
          WHERE job_name = ? AND scope_key = ? AND item_key = ?`,
      )
      .bind(
        delta.decision_used && (delta.level_changed || delta.rest_classification_changed)
          ? 'COMPLETED_REVIEW_REQUIRED'
          : 'COMPLETED',
        JSON.stringify({ ...payloadBase, after, delta }),
        JOB_NAME,
        context.scopeKey,
        journey.id,
      )
      .run();
    return { status: 'processed', delta };
  } catch (error) {
    const message = sanitizeError(error);
    await db
      .prepare(
        `UPDATE cron_job_items
            SET status = 'FAILED', stage = 'RECALCULATION_FAILED',
                last_error_code = 'FRMS_REPROCESS_JOURNEY_FAILED', last_error_message = ?,
                available_at = datetime('now', '+10 minutes'), payload_json = ?, updated_at = datetime('now')
          WHERE job_name = ? AND scope_key = ? AND item_key = ?`,
      )
      .bind(
        message,
        JSON.stringify({ ...payloadBase, failure: { message } }),
        JOB_NAME,
        context.scopeKey,
        journey.id,
      )
      .run();
    throw error;
  }
}

async function countPending(db, scopeKey) {
  const row = await queryOne(
    db,
    `SELECT
       SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'SUCCEEDED' THEN 1 ELSE 0 END) AS succeeded
     FROM cron_job_items WHERE job_name = ? AND scope_key = ?`,
    JOB_NAME,
    scopeKey,
  );
  return {
    pending: Number(row?.pending ?? 0),
    failed: Number(row?.failed ?? 0),
    succeeded: Number(row?.succeeded ?? 0),
  };
}

async function executeReprocessing(db, context) {
  const limites = await carregarLimites(db);
  const summary = {
    processed: 0,
    skipped_completed: 0,
    skipped_non_operational: 0,
    failed: 0,
    pending: 0,
    review_required: 0,
    level_changed: 0,
    rest_classification_changed: 0,
    decision_used: 0,
    cursor: null,
    errors: [],
  };
  let cursor = null;
  let blockedTripulante = null;

  while (true) {
    const page = await fetchJourneyPage(db, cursor);
    if (page.length === 0) break;
    for (const journey of page) {
      cursor = {
        tripulante_id: Number(journey.tripulante_id),
        data: journey.data,
        id: journey.id,
      };
      summary.cursor = `${cursor.tripulante_id}:${cursor.data}:${sha256(cursor.id).slice(0, 12)}`;

      if (blockedTripulante === Number(journey.tripulante_id)) {
        summary.pending += 1;
        continue;
      }
      if (blockedTripulante !== null && blockedTripulante !== Number(journey.tripulante_id)) {
        blockedTripulante = null;
      }
      if (
        journey.empresa_id !== null &&
        Number(journey.empresa_id) !== Number(journey.funcionario_empresa_id)
      ) {
        throw new Error('FRMS_TENANT_MISMATCH_DURING_REPROCESSING');
      }

      try {
        const result = await processJourney(db, context, journey, limites);
        if (result.status === 'processed') {
          summary.processed += 1;
          if (result.delta.level_changed) summary.level_changed += 1;
          if (result.delta.rest_classification_changed) summary.rest_classification_changed += 1;
          if (result.delta.decision_used) summary.decision_used += 1;
          if (
            result.delta.decision_used &&
            (result.delta.level_changed || result.delta.rest_classification_changed)
          ) {
            summary.review_required += 1;
          }
        } else if (result.status === 'skipped_completed') summary.skipped_completed += 1;
        else if (result.status === 'skipped_non_operational') summary.skipped_non_operational += 1;
      } catch (error) {
        summary.failed += 1;
        blockedTripulante = Number(journey.tripulante_id);
        summary.errors.push({
          journey_hash: sha256(journey.id).slice(0, 16),
          error: sanitizeError(error),
        });
      }
    }
    if (page.length < PAGE_SIZE) break;
  }

  const ledger = await countPending(db, context.scopeKey);
  summary.pending = Math.max(summary.pending, ledger.pending);
  summary.failed = Math.max(summary.failed, ledger.failed);
  return summary;
}

const ROLLING_COLUMNS = [
  'hv_7_dias_min',
  'hv_28_dias_min',
  'hv_365_dias_min',
  'hv_mes_calendario_min',
  'hv_dia_min',
  'pct_limite_7d',
  'pct_limite_28d',
  'pct_limite_mes_calendario',
  'pct_limite_365d',
  'pct_limite_dia',
  'repouso_anterior_min',
  'repouso_suficiente',
  'updated_at',
  'deleted_at',
];

async function rollbackItem(db, scopeKey, item) {
  const payload = JSON.parse(item.payload_json || '{}');
  if (!payload.before || !payload.after || payload.rollback?.completed_at) return false;
  const before = payload.before;
  const after = payload.after;
  const journeyId = item.item_key;

  await db
    .prepare(
      `UPDATE frms_jornada SET
         duracao_jornada_minutos = ?, hora_acordou = ?, sono_efetivo_min = ?, fonte_sono = ?,
         acordou_na_wocl = ?, repouso_regulatorio_min = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      before.journey.duracao_jornada_minutos,
      before.journey.hora_acordou,
      before.journey.sono_efetivo_min,
      before.journey.fonte_sono,
      before.journey.acordou_na_wocl,
      before.journey.repouso_regulatorio_min,
      before.journey.updated_at,
      journeyId,
    )
    .run();

  const afterFactorIds = after.factorization.map((row) => row.id);
  for (const id of afterFactorIds) {
    await db
      .prepare(
        `UPDATE frms_fatorizacao_jornada SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(id)
      .run();
  }
  for (const row of before.factorization) {
    await db
      .prepare(`UPDATE frms_fatorizacao_jornada SET deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .bind(row.updated_at, row.id)
      .run();
  }

  const currentRolling = await queryRows(
    db,
    `SELECT * FROM frms_acumulo_rolling WHERE tripulante_id = ? AND data_referencia = ? AND deleted_at IS NULL`,
    payload.before.rolling[0]?.tripulante_id ?? payload.after.rolling[0]?.tripulante_id,
    payload.before.rolling[0]?.data_referencia ?? payload.after.rolling[0]?.data_referencia,
  );
  if (before.rolling.length === 0) {
    for (const row of currentRolling) {
      await db
        .prepare(
          `UPDATE frms_acumulo_rolling SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(row.id)
        .run();
    }
  } else {
    const row = before.rolling[0];
    const assignments = ROLLING_COLUMNS.map((column) => `${column} = ?`).join(', ');
    await db
      .prepare(`UPDATE frms_acumulo_rolling SET ${assignments} WHERE id = ?`)
      .bind(...ROLLING_COLUMNS.map((column) => row[column] ?? null), row.id)
      .run();
  }

  for (const row of after.alerts) {
    if (!before.alerts.some((beforeAlert) => beforeAlert.id === row.id)) {
      await db
        .prepare(
          `UPDATE frms_alerta SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(row.id)
        .run();
    }
  }
  for (const row of before.alerts) {
    await db
      .prepare(
        `UPDATE frms_alerta SET deleted_at = NULL, visualizado = ?, visualizado_em = ?,
         visualizado_por = ?, resolvido = ?, resolvido_em = ?, resolvido_por = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        row.visualizado,
        row.visualizado_em,
        row.visualizado_por,
        row.resolvido,
        row.resolvido_em,
        row.resolvido_por,
        row.updated_at,
        row.id,
      )
      .run();
  }

  const rollback = { completed_at: new Date().toISOString(), source_sha: payload.source_sha };
  await db
    .prepare(
      `UPDATE cron_job_items SET stage = 'ROLLED_BACK', payload_json = ?, updated_at = datetime('now')
       WHERE job_name = ? AND scope_key = ? AND item_key = ?`,
    )
    .bind(JSON.stringify({ ...payload, rollback }), JOB_NAME, scopeKey, journeyId)
    .run();
  return true;
}

async function rollbackReprocessing(db, context) {
  const items = await queryRows(
    db,
    `SELECT item_key, payload_json FROM cron_job_items
      WHERE job_name = ? AND scope_key = ? AND status = 'SUCCEEDED'
      ORDER BY json_extract(payload_json, '$.data') DESC, item_key DESC`,
    JOB_NAME,
    context.scopeKey,
  );
  let rolledBack = 0;
  for (const item of items) {
    if (await rollbackItem(db, context.scopeKey, item)) rolledBack += 1;
  }
  return { processed: rolledBack, failed: 0, pending: 0, cursor: null, errors: [] };
}

function verifyApprovedDryRun(args, inventory, configHash) {
  if (args.target !== 'remote' || args.operation !== 'execute') return null;
  const approved = JSON.parse(readFileSync(args.approvedDryRun, 'utf8'));
  if (approved.ok !== true || approved.target !== 'sqlite' || approved.operation !== 'execute') {
    throw new Error('APPROVED_DRY_RUN_INVALID');
  }
  if (approved.source_sha !== args.sourceSha || approved.formula_version !== args.formulaVersion) {
    throw new Error('APPROVED_DRY_RUN_PROVENANCE_MISMATCH');
  }
  if (approved.config_hash !== configHash) throw new Error('APPROVED_DRY_RUN_CONFIG_CHANGED');
  if (Number(approved.inventory?.overview?.jornadas ?? -1) !== inventory.overview.jornadas) {
    throw new Error('APPROVED_DRY_RUN_POPULATION_CHANGED');
  }
  if (approved.outcome !== 'SUCCEEDED') throw new Error('APPROVED_DRY_RUN_NOT_SUCCESSFUL');
  return sha256(readFileSync(args.approvedDryRun));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const runId = randomUUID();
  const db =
    args.target === 'sqlite'
      ? new SqliteD1Adapter(args.sqliteFile)
      : new RemoteD1Adapter({
          accountId: args.accountId,
          databaseId: args.databaseId,
          token: process.env.CLOUDFLARE_API_TOKEN,
        });

  let report;
  try {
    await assertLedgerSchema(db);
    const inventory = await loadInventory(db);
    if (inventory.tenant_mismatch !== 0) {
      throw new Error(`FRMS_TENANT_PREFLIGHT_FAILED:${inventory.tenant_mismatch}`);
    }
    const config = await loadConfigFingerprint(db);
    const approvedDryRunHash = verifyApprovedDryRun(args, inventory, config.hash);
    const scopeKey =
      args.scopeKey ??
      scopeFor({
        target: args.target,
        formulaVersion: args.formulaVersion,
        sourceSha: args.sourceSha,
        runId,
      });
    const context = {
      target: args.target,
      runId,
      scopeKey,
      formulaVersion: args.formulaVersion,
      sourceSha: args.sourceSha,
      configHash: config.hash,
      inventory,
      startedAt,
    };
    await initializeRun(db, context);
    const summary =
      args.operation === 'rollback'
        ? await rollbackReprocessing(db, context)
        : await executeReprocessing(db, context);
    const outcome = await finishRun(db, context, summary);
    const postInventory = await loadInventory(db);
    report = {
      ok: outcome === 'SUCCEEDED',
      operation: args.operation,
      target: args.target,
      run_id: runId,
      scope_key: scopeKey,
      formula_version: args.formulaVersion,
      source_sha: args.sourceSha,
      config_hash: config.hash,
      approved_dry_run_sha256: approvedDryRunHash,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      outcome,
      inventory,
      post_inventory: postInventory,
      summary,
      rollback: {
        available: args.operation === 'execute',
        scope_key: scopeKey,
        ledger_job_name: JOB_NAME,
      },
    };
    if (!report.ok) process.exitCode = 2;
  } catch (error) {
    report = {
      ok: false,
      operation: args.operation,
      target: args.target,
      formula_version: args.formulaVersion,
      source_sha: args.sourceSha,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      outcome: 'FAILED',
      error: sanitizeError(error),
    };
    process.exitCode = 1;
  } finally {
    if (db instanceof SqliteD1Adapter) db.close();
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

await main();
