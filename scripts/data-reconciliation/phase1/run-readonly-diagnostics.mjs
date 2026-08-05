#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { findings } from './catalog.mjs';

const FORBIDDEN_SQL =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|CREATE|UPSERT|MERGE|ATTACH|DETACH|VACUUM|REINDEX)\b/i;
const PII_KEY =
  /(^|_)(nome|name|cpf|email|telefone|phone|endereco|address|certificado_completo|conteudo_pessoal)(_|$)/i;
const ID_KEY = /(^|_)(id|tenant_id)$/i;
const SAFE_PRAGMA = /^PRAGMA\s+(table_info|query_only|foreign_key_list|index_list)\b/i;

export function validateReadonlySql(sql) {
  const stripped = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();

  if (!/^SELECT\b|^WITH\b/i.test(stripped) && !SAFE_PRAGMA.test(stripped)) {
    throw new Error('Only SELECT/WITH and safe PRAGMA statements are allowed');
  }
  if (FORBIDDEN_SQL.test(stripped)) {
    throw new Error('Forbidden write or destructive SQL keyword detected');
  }
  if (stripped.includes(';')) {
    throw new Error('Multiple SQL statements are not allowed');
  }
}

function parseArgs(argv) {
  const options = {
    db: null,
    output: null,
    salt: null,
    maxExamples: 5,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--db') {
      options.db = argv[++index];
    } else if (token === '--output') {
      options.output = argv[++index];
    } else if (token === '--salt') {
      options.salt = argv[++index];
    } else if (token === '--max-examples') {
      options.maxExamples = Number(argv[++index] || 5);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

function localPathOnly(value) {
  if (!value) {
    throw new Error('Missing --db');
  }
  if (/^[a-z]+:\/\//i.test(value)) {
    throw new Error('Remote database locations are forbidden');
  }

  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Local SQLite file not found: ${resolved}`);
  }
  return resolved;
}

function schemaSnapshot(db) {
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((row) => String(row.name)),
  );
  const columns = new Map();

  for (const table of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      continue;
    }
    columns.set(
      table,
      new Set(
        db
          .prepare(`PRAGMA table_info('${table.replaceAll("'", "''")}')`)
          .all()
          .map((row) => String(row.name)),
      ),
    );
  }

  return { tables, columns };
}

function missingSchema(schema, requires) {
  const missing = [];

  for (const [table, requiredColumns] of Object.entries(requires || {})) {
    if (!schema.tables.has(table)) {
      missing.push(`${table}.*`);
      continue;
    }

    const actualColumns = schema.columns.get(table) || new Set();
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) {
        missing.push(`${table}.${column}`);
      }
    }
  }

  return missing;
}

function token(salt, kind, value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return `${kind}_${createHash('sha256')
    .update(`${salt}:${kind}:${String(value)}`)
    .digest('hex')
    .slice(0, 16)}`;
}

function sanitizeRow(row, salt) {
  const sanitized = {};

  for (const [key, value] of Object.entries(row)) {
    if (PII_KEY.test(key)) {
      throw new Error(`PII-like output column is forbidden: ${key}`);
    }
    if (ID_KEY.test(key) || key.endsWith('_id')) {
      const kind = key === 'tenant_id' || key.endsWith('tenant_id') ? 'tenant' : 'id';
      sanitized[key] = token(salt, kind, value);
    } else if (typeof value === 'string' && value.length > 240) {
      sanitized[key] = `${value.slice(0, 237)}...`;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function stripTrailingSemicolon(sql) {
  return sql.trim().replace(/;\s*$/, '');
}

function runFinding(db, schema, finding, salt, maxExamples) {
  const { sql, ...metadata } = finding;
  validateReadonlySql(sql);

  const missing = missingSchema(schema, finding.requires);
  if (missing.length > 0) {
    return {
      ...metadata,
      status: 'SKIPPED_SCHEMA_UNCONFIRMED',
      count: 0,
      companiesAffected: 0,
      examples: [],
      firstDate: null,
      lastDate: null,
      missingSchema: missing,
      query: sql,
    };
  }

  const inner = stripTrailingSemicolon(sql);
  const summary = db
    .prepare(
      `WITH finding AS (${inner}) SELECT COUNT(*) AS finding_count, COUNT(DISTINCT tenant_id) AS company_count, MIN(event_date) AS first_date, MAX(event_date) AS last_date FROM finding`,
    )
    .get();
  const rows = db
    .prepare(
      `WITH finding AS (${inner}) SELECT * FROM finding ORDER BY COALESCE(event_date,''), COALESCE(CAST(entity_id AS TEXT),''), COALESCE(CAST(related_id AS TEXT),'') LIMIT ?`,
    )
    .all(Math.max(0, Math.min(20, maxExamples)));

  return {
    ...metadata,
    status: Number(summary.finding_count) > 0 ? 'FOUND' : 'CLEAR',
    count: Number(summary.finding_count || 0),
    companiesAffected: Number(summary.company_count || 0),
    examples: rows.map((row) => sanitizeRow(row, salt)),
    firstDate: summary.first_date ?? null,
    lastDate: summary.last_date ?? null,
    missingSchema: [],
    query: sql,
  };
}

export function runDiagnostics({ dbPath, salt, maxExamples = 5 }) {
  if (!salt || String(salt).length < 12) {
    throw new Error('A local pseudonymization salt with at least 12 characters is required');
  }

  const resolved = localPathOnly(dbPath);
  const before = fs.statSync(resolved);
  const db = new DatabaseSync(resolved, { readOnly: true });

  try {
    db.exec('PRAGMA query_only = ON');
    const schema = schemaSnapshot(db);
    const results = findings
      .map((finding) => runFinding(db, schema, finding, String(salt), maxExamples))
      .sort((left, right) => left.code.localeCompare(right.code));
    const after = fs.statSync(resolved);

    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error('Database file changed during read-only diagnostics');
    }

    const byCategory = {};
    for (const result of results) {
      (byCategory[result.category] ??= []).push(result);
    }

    return {
      mode: 'PHASE_1_READ_ONLY',
      deterministic: true,
      database: path.basename(resolved),
      summary: {
        checks: results.length,
        found: results.filter((result) => result.status === 'FOUND').length,
        clear: results.filter((result) => result.status === 'CLEAR').length,
        skipped: results.filter((result) => result.status.startsWith('SKIPPED')).length,
        totalFindings: results.reduce((total, result) => total + result.count, 0),
      },
      categories: Object.fromEntries(
        Object.entries(byCategory).sort(([left], [right]) => left.localeCompare(right)),
      ),
    };
  } finally {
    db.close();
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = runDiagnostics({
      dbPath: args.db,
      salt: args.salt || process.env.AIRTRUST_RECONCILIATION_SALT,
      maxExamples: args.maxExamples,
    });
    const json = `${JSON.stringify(report, null, 2)}\n`;

    if (args.output) {
      fs.writeFileSync(path.resolve(args.output), json, { flag: 'wx' });
    } else {
      process.stdout.write(json);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main();
}
