#!/usr/bin/env node
/**
 * F4-03 / 0435 offline pre-incident comparator.
 *
 * This tool never connects to D1 or the network. It compares a pre-incident
 * CSV snapshot with a separately obtained current CSV export and emits only
 * aggregate counts + input hashes to stdout. Optional row-level details are
 * written to a local file with mode 0600 and are never printed.
 *
 * Usage:
 *   node scripts/validation/f4-03-offline-preincident-compare.mjs \
 *     --before /secure/preincident.csv \
 *     --current /secure/current.csv \
 *     [--details /secure/review-only.json]
 */
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fail(code, detail = '') {
  const suffix = detail ? `:${detail}` : '';
  console.error(`F4_03_OFFLINE_COMPARE_ERROR:${code}${suffix}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail('ARGUMENT_INVALID');
    const key = arg.slice(2);
    if (!['before', 'current', 'details'].includes(key)) fail('ARGUMENT_UNKNOWN', key);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED', key);
    out[key] = value;
    i += 1;
  }
  if (!out.before) fail('BEFORE_REQUIRED');
  if (!out.current) fail('CURRENT_REQUIRED');
  return out;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Small RFC4180-compatible parser sufficient for governed CSV exports.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV_UNCLOSED_QUOTE');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  if (headers.some((h) => !h)) throw new Error('CSV_EMPTY_HEADER');
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV_COLUMN_COUNT_ROW_${index + 2}`);
    return Object.fromEntries(headers.map((h, idx) => [h, values[idx]]));
  });
}

const ALIASES = {
  id: ['id'],
  empresa_id: ['empresa_id'],
  funcionario_id: ['funcionario_id'],
  qualificacao_id: ['qualificacao_id', 'qualificacao_tipo_id'],
  data_conclusao: ['data_conclusao'],
  data_vencimento: ['data_vencimento'],
  deleted_at: ['deleted_at'],
};

function pick(row, canonical) {
  for (const name of ALIASES[canonical]) {
    if (Object.hasOwn(row, name)) return String(row[name] ?? '').trim();
  }
  return '';
}

function assertColumns(rows, label) {
  if (rows.length === 0) fail(`${label}_EMPTY`);
  for (const canonical of ['id', 'empresa_id', 'funcionario_id', 'qualificacao_id', 'data_conclusao', 'data_vencimento']) {
    if (!ALIASES[canonical].some((name) => Object.hasOwn(rows[0], name))) {
      fail(`${label}_COLUMN_MISSING`, canonical);
    }
  }
}

function indexById(rows, label) {
  const map = new Map();
  for (const row of rows) {
    const id = pick(row, 'id');
    if (!/^\d+$/.test(id) || Number(id) <= 0) fail(`${label}_ID_INVALID`);
    if (map.has(id)) fail(`${label}_DUPLICATE_ID`, id);
    map.set(id, row);
  }
  return map;
}

function identity(row) {
  return {
    empresa_id: pick(row, 'empresa_id'),
    funcionario_id: pick(row, 'funcionario_id'),
    qualificacao_id: pick(row, 'qualificacao_id'),
    data_conclusao: pick(row, 'data_conclusao'),
  };
}

function sameIdentity(a, b) {
  const ia = identity(a);
  const ib = identity(b);
  return Object.keys(ia).every((key) => ia[key] === ib[key]);
}

export function compareRows(beforeRows, currentRows) {
  assertColumns(beforeRows, 'BEFORE');
  assertColumns(currentRows, 'CURRENT');
  const before = indexById(beforeRows, 'BEFORE');
  const current = indexById(currentRows, 'CURRENT');

  let matched = 0;
  let stableIdentity = 0;
  let expiryChangedStableIdentity = 0;
  let identityChanged = 0;
  let deletedNow = 0;
  const details = [];

  for (const [id, b] of before) {
    const c = current.get(id);
    if (!c) continue;
    matched += 1;
    if (pick(c, 'deleted_at')) deletedNow += 1;
    if (!sameIdentity(b, c)) {
      identityChanged += 1;
      continue;
    }
    stableIdentity += 1;
    const beforeExpiry = pick(b, 'data_vencimento');
    const currentExpiry = pick(c, 'data_vencimento');
    if (beforeExpiry !== currentExpiry) {
      expiryChangedStableIdentity += 1;
      details.push({
        id: Number(id),
        empresa_id: Number(pick(c, 'empresa_id')),
        qualificacao_id: Number(pick(c, 'qualificacao_id')),
        data_conclusao: pick(c, 'data_conclusao'),
        data_vencimento_before: beforeExpiry || null,
        data_vencimento_current: currentExpiry || null,
        current_deleted: Boolean(pick(c, 'deleted_at')),
      });
    }
  }

  return {
    summary: {
      before_rows: before.size,
      current_rows: current.size,
      ids_matched: matched,
      stable_identity_matches: stableIdentity,
      stable_identity_expiry_differences: expiryChangedStableIdentity,
      identity_changed_since_snapshot: identityChanged,
      matched_rows_currently_deleted: deletedNow,
      before_ids_missing_current: before.size - matched,
    },
    details,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const beforePath = resolve(args.before);
  const currentPath = resolve(args.current);
  const beforeText = readFileSync(beforePath, 'utf8');
  const currentText = readFileSync(currentPath, 'utf8');

  let beforeRows;
  let currentRows;
  try {
    beforeRows = parseCsv(beforeText);
    currentRows = parseCsv(currentText);
  } catch (error) {
    fail('CSV_INVALID', error instanceof Error ? error.message : 'unknown');
  }

  const comparison = compareRows(beforeRows, currentRows);
  const output = {
    incident: 'F4-03_0435_MANUAL_EXPIRY',
    mode: 'OFFLINE_READ_ONLY',
    before_sha256: sha256(beforeText),
    current_sha256: sha256(currentText),
    ...comparison.summary,
    interpretation:
      comparison.summary.stable_identity_expiry_differences === 0
        ? 'NO_EXPIRY_DIFFERENCES_FOUND_IN_STABLE_MATCHES'
        : 'REVIEW_REQUIRED_DO_NOT_AUTO_REPAIR',
    pii_emitted_to_stdout: false,
    writes_to_source_data: 0,
  };

  if (args.details) {
    const detailsPath = resolve(args.details);
    writeFileSync(
      detailsPath,
      `${JSON.stringify({
        incident: output.incident,
        before_sha256: output.before_sha256,
        current_sha256: output.current_sha256,
        rows: comparison.details,
        warning: 'REVIEW_ONLY_DO_NOT_APPLY_AS_REPAIR_WITHOUT_CORROBORATION_AND_AUTHORIZATION',
      }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    chmodSync(detailsPath, 0o600);
    output.details_written = true;
    output.details_path_omitted_from_stdout = true;
  } else {
    output.details_written = false;
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
