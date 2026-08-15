#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SQL_PATH = path.join(__dirname, 'invariants.sql');

const FORBIDDEN_SQL_RE = /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|REPLACE|UPSERT|MERGE)\b/i;
const TABLE_REF_RE = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

function parseArgs(argv) {
  const options = {
    dbPath: null,
    sqlPath: DEFAULT_SQL_PATH,
    baselinePath: null,
    failOnSeverity: 'P0',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--db') {
      options.dbPath = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === '--sql') {
      options.sqlPath = argv[index + 1] || DEFAULT_SQL_PATH;
      index += 1;
      continue;
    }
    if (token === '--baseline') {
      options.baselinePath = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === '--fail-on-severity') {
      options.failOnSeverity = (argv[index + 1] || 'P0').toUpperCase();
      index += 1;
      continue;
    }
  }

  return options;
}

function sqliteJson(dbPath, sql) {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const trimmed = output.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function parseValue(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function parseInvariantFile(contents) {
  const statements = [];
  const lines = contents.split(/\r?\n/);
  let currentMeta = {};
  let sqlLines = [];

  const flush = () => {
    const sql = sqlLines.join('\n').trim();
    if (!sql) {
      currentMeta = {};
      sqlLines = [];
      return;
    }

    statements.push({ ...currentMeta, sql });
    currentMeta = {};
    sqlLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) {
      const match = trimmed.match(/^--\s*([^:]+):\s*(.+)$/);
      if (match && sqlLines.length === 0) {
        currentMeta[match[1].trim()] = parseValue(match[2]);
        continue;
      }
    }

    if (trimmed.endsWith(';')) {
      sqlLines.push(line);
      flush();
      continue;
    }

    if (!trimmed && sqlLines.length === 0) {
      continue;
    }

    sqlLines.push(line);
  }

  flush();
  return statements;
}

function normalizeList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRequiredColumns(value) {
  return normalizeList(value).map((entry) => {
    const [table, column] = entry.split('.');
    return { table, column };
  });
}

function extractReferencedTables(sql) {
  const tables = new Set();
  for (const match of sql.matchAll(TABLE_REF_RE)) {
    tables.add(match[1]);
  }
  return [...tables];
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

function validateReadonlySql(sql) {
  const trimmed = stripSqlComments(sql).trim();
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('Only SELECT statements are allowed.');
  }
  if (FORBIDDEN_SQL_RE.test(trimmed)) {
    throw new Error('Forbidden SQL keyword detected.');
  }
}

function loadBaseline(baselinePath) {
  if (!baselinePath) return {};
  const raw = fs.readFileSync(baselinePath, 'utf8');
  return JSON.parse(raw);
}

function collectSchema(dbPath) {
  const objects = sqliteJson(
    dbPath,
    "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY type, name;",
  );
  const tables = new Set(objects.map((row) => row.name));
  const columns = new Map();

  for (const name of tables) {
    if (name === 'sqlite_master') continue;
    const pragmaRows = sqliteJson(dbPath, `PRAGMA table_info('${name.replace(/'/g, "''")}');`);
    columns.set(
      name,
      new Set(pragmaRows.map((row) => row.name)),
    );
  }

  return { tables, columns };
}

function evaluateBaseline(check, rows, baseline) {
  const metricName = check.baseline_metric ? String(check.baseline_metric) : null;
  if (!metricName) return null;

  const baselineEntry = baseline?.checks?.[check.id];
  const minimum = baselineEntry?.minimum?.[metricName];
  if (minimum == null) {
    return {
      status: 'BASELINE_NOT_CONFIGURED',
      message: `Baseline metric ${metricName} not configured for ${check.id}.`,
    };
  }

  const actual = Number(rows[0]?.[metricName] ?? Number.NaN);
  if (!Number.isFinite(actual)) {
    return {
      status: 'BASELINE_INVALID_RESULT',
      message: `Metric ${metricName} missing from query result.`,
    };
  }

  if (actual < Number(minimum)) {
    return {
      status: 'FAILED',
      message: `${metricName}=${actual} below baseline minimum ${minimum}.`,
    };
  }

  return {
    status: 'PASSED',
    message: `${metricName}=${actual} within baseline minimum ${minimum}.`,
  };
}

function normalizeSeverity(severity) {
  return String(severity || 'P0').toUpperCase() === 'P1' ? 'P1' : 'P0';
}

function shouldFailForSeverity(severity, threshold) {
  const normalizedThreshold = String(threshold || 'P0').toUpperCase();
  const normalizedSeverity = normalizeSeverity(severity);

  if (normalizedThreshold === 'NONE') return false;
  if (normalizedThreshold === 'P1') return normalizedSeverity === 'P0' || normalizedSeverity === 'P1';
  return normalizedSeverity === 'P0';
}

export function runIntegrity({
  dbPath,
  sqlPath = DEFAULT_SQL_PATH,
  baselinePath = null,
  failOnSeverity = 'P0',
}) {
  if (!dbPath) {
    throw new Error('Missing required --db argument.');
  }
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Invariant file not found: ${sqlPath}`);
  }

  const baseline = loadBaseline(baselinePath);
  const schema = collectSchema(dbPath);
  const invariants = parseInvariantFile(fs.readFileSync(sqlPath, 'utf8'));

  const result = {
    generatedAt: new Date().toISOString(),
    dbPath,
    sqlPath,
    baselinePath,
    failOnSeverity: String(failOnSeverity || 'P0').toUpperCase(),
    checks: [],
    violations: [],
    summary: {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: invariants.length,
    },
  };

  for (const invariant of invariants) {
    if (!invariant.id || !invariant.severity || !invariant.title) {
      throw new Error(`Invariant metadata incomplete: ${JSON.stringify(invariant)}`);
    }

    validateReadonlySql(invariant.sql);

    const requiredTables = [
      ...new Set([
        ...normalizeList(invariant.required_tables),
        ...extractReferencedTables(invariant.sql),
      ]),
    ];
    const missingTables = requiredTables.filter(
      (table) => table !== 'sqlite_master' && !schema.tables.has(table),
    );
    const requiredColumns = parseRequiredColumns(invariant.required_columns);
    const missingColumns = requiredColumns.filter(({ table, column }) => {
      if (table === 'sqlite_master') return false;
      const tableColumns = schema.columns.get(table);
      return !tableColumns || !tableColumns.has(column);
    });
    const skipIfSchemaUnconfirmed = invariant.skip_if_schema_unconfirmed === true;

    if (missingTables.length > 0 || missingColumns.length > 0) {
      if (skipIfSchemaUnconfirmed) {
        result.checks.push({
          id: invariant.id,
          severity: invariant.severity,
          title: invariant.title,
          status: 'SKIPPED_SCHEMA_UNCONFIRMED',
          missingTables,
          missingColumns,
          rowCount: 0,
          rows: [],
        });
        result.summary.skipped += 1;
        continue;
      }

      throw new Error(
        `Invariant ${invariant.id} references missing schema: ` +
          `${missingTables.join(', ')} ${missingColumns
            .map(({ table, column }) => `${table}.${column}`)
            .join(', ')}`.trim(),
      );
    }

    const rows = sqliteJson(dbPath, invariant.sql);
    const baselineEvaluation = evaluateBaseline(invariant, rows, baseline);
    const hasRowViolations = !invariant.baseline_metric && rows.length > 0;
    const hasFailure = baselineEvaluation?.status === 'FAILED' || hasRowViolations;

    const status =
      hasFailure
        ? 'FAILED'
        : baselineEvaluation?.status === 'BASELINE_NOT_CONFIGURED'
          ? 'PASSED_WITHOUT_BASELINE'
          : 'PASSED';

    const checkResult = {
      id: invariant.id,
      severity: invariant.severity,
      title: invariant.title,
      status,
      rowCount: rows.length,
      rows,
      baseline: baselineEvaluation,
    };

    result.checks.push(checkResult);

    if (hasFailure) {
      result.summary.failed += 1;
      result.violations.push(checkResult);
    } else {
      result.summary.passed += 1;
    }
  }

  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = runIntegrity(options);
    const hasBlockingFailure = result.violations.some((check) =>
      shouldFailForSeverity(check.severity, result.failOnSeverity),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = hasBlockingFailure ? 1 : 0;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
