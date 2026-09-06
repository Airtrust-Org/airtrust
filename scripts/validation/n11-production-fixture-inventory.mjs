#!/usr/bin/env node
// N-11 read-only production inventory.
// Outputs only stable IDs, state flags, and relationship counts. It never emits employee names,
// emails, document numbers, credentials, free-text fields, or row payloads.
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const CONFIRMATION = 'AIRTRUST_PRODUCTION_READONLY_N11';

function fail(message) {
  console.error(`N11_READONLY_INVENTORY_ERROR:${message}`);
  process.exit(1);
}

if (process.env.N11_PRODUCTION_READONLY_CONFIRMATION !== CONFIRMATION) {
  fail('CONFIRMATION_REQUIRED');
}
if ((process.env.N11_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) {
  fail('PRODUCTION_DB_TARGET_REJECTED');
}

function assertReadOnlySql(sql) {
  const normalized = String(sql || '').trim();
  const singleStatement = normalized.replace(/;+\s*$/, '').trim();

  if (!singleStatement || singleStatement.includes(';')) {
    fail('MULTI_STATEMENT_SQL_REJECTED');
  }

  if (/^PRAGMA\b/i.test(singleStatement)) {
    if (!/^PRAGMA\s+table_info\s*\(/i.test(singleStatement)) {
      fail('PRAGMA_NOT_ALLOWLISTED');
    }
    return;
  }

  if (!/^SELECT\b/i.test(singleStatement)) {
    fail('NON_READONLY_SQL_REJECTED');
  }

  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX|ANALYZE)\b/i.test(singleStatement)) {
    fail('MUTATING_SQL_REJECTED');
  }
}

function query(sql) {
  assertReadOnlySql(sql);
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: new URL('../../worker-airtrust/', import.meta.url),
      encoding: 'utf8',
      env: process.env,
    },
  );

  const redactSecrets = (value) =>
    String(value || '')
      .replace(/[A-Za-z0-9_+\/-]{24,}/g, '[REDACTED]')
      .replace(/\/accounts\/[^/\s"]+/g, '/accounts/[REDACTED]')
      .replace(/database\/[0-9a-f-]{16,}/gi, 'database/[REDACTED]');

  if (result.status !== 0) {
    // Surface the failure cause (sanitized) so the read-only run is diagnosable.
    // wrangler --json routes API errors to stdout, not stderr.
    // The SQL emitted here is schema/id-only (documented fixture labels); it carries no real PII.
    console.error(`D1_READ_FAILED_SQL:${String(sql).replace(/\s+/g, ' ').trim().slice(0, 600)}`);
    console.error(redactSecrets(result.stderr));
    console.error(`D1_READ_EXIT_STATUS:${result.status ?? 'null'}`);
    console.error(`D1_READ_STDOUT:${redactSecrets(result.stdout).slice(0, 4000)}`);
    fail('D1_READ_FAILED');
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    console.error(`D1_JSON_INVALID_STDOUT:${redactSecrets(result.stdout).slice(0, 4000)}`);
    fail('D1_JSON_INVALID');
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) {
    fail('D1_RESULTS_MISSING');
  }
  return envelope.results;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) fail('UNSAFE_SCHEMA_IDENTIFIER');
  return `"${value}"`;
}

// Exact synthetic labels are used only to resolve the IDs observed by the audit.
// They are never used by product visibility logic or by a write/remediation operation.
const candidates = query(`
  SELECT
    id,
    empresa_id,
    CASE
      WHEN id = 129 THEN 'documented_qa_id_129'
      WHEN nome = 'Fixture LMS Manutenção' THEN 'audit_observed_fixture_label'
      WHEN nome = 'Funcionário Teste Manutenção' THEN 'documented_qa_label'
      ELSE 'unclassified_candidate'
    END AS evidence_key,
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted,
    COALESCE(ativo, 0) AS ativo,
    UPPER(COALESCE(NULLIF(TRIM(status), ''), 'UNKNOWN')) AS status_normalized
  FROM funcionarios
  WHERE empresa_id = ${EMPRESA_ID}
    AND (
      id = 129
      OR nome = 'Fixture LMS Manutenção'
      OR nome = 'Funcionário Teste Manutenção'
    )
  ORDER BY id;
`);

const candidateIds = [...new Set(candidates.map((row) => Number(row.id)).filter(Number.isInteger))];
const knownUser = query(`
  SELECT
    id,
    funcionario_id,
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted,
    COALESCE(active, 0) AS active
  FROM usuarios
  WHERE id = 108
     OR funcionario_id IN (${candidateIds.length ? candidateIds.join(',') : '-1'})
  ORDER BY id;
`);

const referenceColumns = query(`
  SELECT DISTINCT m.name AS table_name
  FROM sqlite_master AS m
  JOIN pragma_table_info(m.name) AS p
    ON p.name = 'funcionario_id'
  WHERE m.type = 'table'
    AND m.name NOT LIKE 'sqlite_%'
  ORDER BY m.name;
`);

const references = [];
for (const row of referenceColumns) {
  const tableName = String(row.table_name || '');
  const quotedTable = quoteIdentifier(tableName);
  const columns = query(`PRAGMA table_info(${quotedTable});`);
  const hasDeletedAt = columns.some((column) => column.name === 'deleted_at');
  const idList = candidateIds.length ? candidateIds.join(',') : '-1';
  const rows = query(`
    SELECT
      CAST(funcionario_id AS INTEGER) AS funcionario_id,
      COUNT(*) AS total_rows
      ${hasDeletedAt ? ", SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS non_deleted_rows" : ''}
    FROM ${quotedTable}
    WHERE CAST(funcionario_id AS INTEGER) IN (${idList})
    GROUP BY CAST(funcionario_id AS INTEGER)
    ORDER BY CAST(funcionario_id AS INTEGER);
  `);
  if (rows.length > 0) {
    references.push({
      table_name: tableName,
      rows: rows.map((entry) => ({
        funcionario_id: Number(entry.funcionario_id),
        total_rows: Number(entry.total_rows),
        ...(hasDeletedAt ? { non_deleted_rows: Number(entry.non_deleted_rows) } : {}),
      })),
    });
  }
}

const output = {
  mode: 'production-d1-read-only',
  empresa_id: EMPRESA_ID,
  source_sha: process.env.GITHUB_SHA || null,
  generated_at: new Date().toISOString(),
  candidates: candidates.map((row) => ({
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    evidence_key: String(row.evidence_key),
    soft_deleted: Number(row.soft_deleted),
    ativo: Number(row.ativo),
    status_normalized: String(row.status_normalized),
  })),
  user_links: knownUser.map((row) => ({
    id: Number(row.id),
    funcionario_id: row.funcionario_id == null ? null : Number(row.funcionario_id),
    soft_deleted: Number(row.soft_deleted),
    active: Number(row.active),
  })),
  references,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
