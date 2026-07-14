import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type ContractSeverity = 'PASS' | 'WARNING' | 'FAIL';

export interface ContractIssue {
  severity: ContractSeverity;
  code:
    | 'INVALID_CONTRACT'
    | 'MISSING_TABLE'
    | 'MISSING_REQUIRED_COLUMN'
    | 'TYPE_MISMATCH'
    | 'OPTIONAL_COLUMN_MISSING'
    | 'EXTRA_COLUMN'
    | 'MISSING_RELEVANT_INDEX'
    | 'HASH_MISMATCH'
    | 'PROHIBITED_ASSUMPTION';
  table?: string;
  column?: string;
  index?: string;
  message: string;
}

export interface ContractColumnRule {
  type: string;
}

export interface ContractTableRule {
  required_columns: Record<string, ContractColumnRule>;
  optional_columns?: Record<string, ContractColumnRule>;
  relevant_indexes?: string[];
  notes?: string[];
}

export interface SchemaContract {
  baseline_id: string;
  baseline_date: string;
  source_commit: string;
  source_worker_sha: string;
  schema_hash: string;
  scoped_tables: string[];
  tables: Record<string, ContractTableRule>;
  prohibited_assumptions: string[];
  out_of_contract_tables: string[];
}

export interface SnapshotTableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface SnapshotIndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

export interface SnapshotForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

export interface SnapshotCommandResult<T> {
  ok: boolean;
  results?: T[];
  error?: string;
}

export interface SnapshotTable {
  table_info: SnapshotCommandResult<SnapshotTableInfoRow>;
  index_list: SnapshotCommandResult<SnapshotIndexListRow>;
  foreign_key_list?: SnapshotCommandResult<SnapshotForeignKeyRow>;
  create_sql?: SnapshotCommandResult<{ sql: string; name: string; type: string; tbl_name: string }>;
  counts?: SnapshotCommandResult<Record<string, unknown>>;
}

export interface StructuralSnapshot {
  generatedAt: string;
  database: string;
  tables: Record<string, SnapshotTable>;
  functional?: Record<string, unknown>;
}

export interface CheckSchemaOptions {
  allowExtraColumns?: boolean;
}

export interface CheckSchemaResult {
  status: ContractSeverity;
  schemaHash: string;
  issues: ContractIssue[];
  scopedTables: string[];
}

const MUTATING_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|TRUNCATE|VACUUM|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b|PRAGMA\s+[A-Za-z0-9_]+\s*=/i;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeType(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function assertReadOnlySql(sql: string): void {
  if (!sql.trim()) {
    throw new Error('SQL vazio nao e permitido.');
  }

  if (MUTATING_SQL_PATTERN.test(sql)) {
    throw new Error(`SQL bloqueado por conter comando mutante: ${sql}`);
  }

  const statements = sql
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const statement of statements) {
    const normalized = statement.toUpperCase();
    if (!normalized.startsWith('SELECT ') && !normalized.startsWith('PRAGMA ')) {
      throw new Error(`SQL bloqueado por nao ser SELECT/PRAGMA somente leitura: ${statement}`);
    }
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function normalizeTableForHash(tableName: string, snapshotTable: SnapshotTable) {
  const columns = (snapshotTable.table_info.results ?? []).map((column) => ({
    name: column.name,
    type: normalizeType(column.type),
    notnull: column.notnull === 1,
    pk: column.pk,
    default: column.dflt_value,
  }));

  const indexes = (snapshotTable.index_list.results ?? [])
    .map((index) => ({
      name: index.name,
      unique: index.unique === 1,
      partial: index.partial === 1,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    table: tableName,
    columns: columns.sort((left, right) => left.name.localeCompare(right.name)),
    indexes,
    create_sql: snapshotTable.create_sql?.results?.[0]?.sql ?? null,
  };
}

export function computeSchemaHash(snapshot: StructuralSnapshot, scopedTables: string[]): string {
  const normalized = scopedTables
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((tableName) => {
      const snapshotTable = snapshot.tables[tableName];
      if (!snapshotTable?.table_info?.ok || !snapshotTable?.index_list?.ok) {
        throw new Error(`Snapshot incompleto para tabela ${tableName}.`);
      }
      return normalizeTableForHash(tableName, snapshotTable);
    });

  return sha256(stableStringify(normalized));
}

function loadContract(contractPath: string): SchemaContract {
  const contract = loadJson<SchemaContract>(contractPath);
  if (!contract.baseline_id || !contract.schema_hash || !Array.isArray(contract.scoped_tables)) {
    throw new Error('Contrato invalido: baseline_id/schema_hash/scoped_tables obrigatorios.');
  }

  for (const tableName of contract.scoped_tables) {
    if (!contract.tables[tableName]) {
      throw new Error(`Contrato invalido: tabela ${tableName} nao possui regra.`);
    }
  }

  return contract;
}

function evaluateContract(contract: SchemaContract, snapshot: StructuralSnapshot, options: CheckSchemaOptions): CheckSchemaResult {
  const issues: ContractIssue[] = [];

  for (const tableName of contract.scoped_tables) {
    const tableRule = contract.tables[tableName];
    const snapshotTable = snapshot.tables[tableName];

    if (!snapshotTable?.table_info?.ok || !snapshotTable?.index_list?.ok) {
      issues.push({
        severity: 'FAIL',
        code: 'MISSING_TABLE',
        table: tableName,
        message: `Tabela ${tableName} ausente ou snapshot incompleto.`,
      });
      continue;
    }

    const actualColumns = new Map(
      (snapshotTable.table_info.results ?? []).map((column) => [column.name, normalizeType(column.type)]),
    );

    for (const [columnName, rule] of Object.entries(tableRule.required_columns)) {
      const actualType = actualColumns.get(columnName);
      if (!actualType) {
        issues.push({
          severity: 'FAIL',
          code: 'MISSING_REQUIRED_COLUMN',
          table: tableName,
          column: columnName,
          message: `Coluna obrigatoria ${tableName}.${columnName} ausente.`,
        });
        continue;
      }

      if (normalizeType(rule.type) !== actualType) {
        issues.push({
          severity: 'FAIL',
          code: 'TYPE_MISMATCH',
          table: tableName,
          column: columnName,
          message: `Tipo divergente em ${tableName}.${columnName}: esperado ${normalizeType(rule.type)}, encontrado ${actualType}.`,
        });
      }
    }

    for (const [columnName, rule] of Object.entries(tableRule.optional_columns ?? {})) {
      const actualType = actualColumns.get(columnName);
      if (!actualType) {
        issues.push({
          severity: 'WARNING',
          code: 'OPTIONAL_COLUMN_MISSING',
          table: tableName,
          column: columnName,
          message: `Coluna opcional ${tableName}.${columnName} ausente.`,
        });
        continue;
      }

      if (normalizeType(rule.type) !== actualType) {
        issues.push({
          severity: 'FAIL',
          code: 'TYPE_MISMATCH',
          table: tableName,
          column: columnName,
          message: `Tipo divergente em coluna opcional ${tableName}.${columnName}: esperado ${normalizeType(rule.type)}, encontrado ${actualType}.`,
        });
      }
    }

    const declaredColumns = new Set([
      ...Object.keys(tableRule.required_columns),
      ...Object.keys(tableRule.optional_columns ?? {}),
    ]);
    if (!options.allowExtraColumns) {
      for (const columnName of actualColumns.keys()) {
        if (!declaredColumns.has(columnName)) {
          issues.push({
            severity: 'WARNING',
            code: 'EXTRA_COLUMN',
            table: tableName,
            column: columnName,
            message: `Coluna extra ${tableName}.${columnName} fora do contrato explicito.`,
          });
        }
      }
    }

    const actualIndexes = new Set((snapshotTable.index_list.results ?? []).map((index) => index.name));
    for (const indexName of tableRule.relevant_indexes ?? []) {
      if (!actualIndexes.has(indexName)) {
        issues.push({
          severity: 'WARNING',
          code: 'MISSING_RELEVANT_INDEX',
          table: tableName,
          index: indexName,
          message: `Indice relevante ${indexName} nao encontrado em ${tableName}.`,
        });
      }
    }
  }

  for (const assumption of contract.prohibited_assumptions) {
    issues.push({
      severity: 'PASS',
      code: 'PROHIBITED_ASSUMPTION',
      message: `Assuncao proibida registrada: ${assumption}`,
    });
  }

  const schemaHash = computeSchemaHash(snapshot, contract.scoped_tables);
  if (schemaHash !== contract.schema_hash) {
    issues.push({
      severity: 'FAIL',
      code: 'HASH_MISMATCH',
      message: `Hash do schema divergente. Esperado ${contract.schema_hash}, encontrado ${schemaHash}.`,
    });
  }

  const status: ContractSeverity = issues.some((issue) => issue.severity === 'FAIL')
    ? 'FAIL'
    : issues.some((issue) => issue.severity === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return {
    status,
    schemaHash,
    issues,
    scopedTables: contract.scoped_tables,
  };
}

function execWranglerJson(workerDir: string, args: string[]): unknown {
  const output = execFileSync('npx', args, {
    cwd: workerDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output) as unknown;
}

function sanitizeTableName(tableName: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
    throw new Error(`Nome de tabela invalido: ${tableName}`);
  }
  return tableName;
}

function runRemoteQuery(workerDir: string, dbName: string, envName: string, sql: string) {
  assertReadOnlySql(sql);
  return execWranglerJson(workerDir, ['wrangler', 'd1', 'execute', dbName, '--env', envName, '--remote', '--json', '--command', sql]) as SnapshotCommandResult<Record<string, unknown>>[];
}

function readRemoteTable(workerDir: string, dbName: string, envName: string, tableName: string): SnapshotTable {
  const safeTableName = sanitizeTableName(tableName);
  const tableInfoSql = `PRAGMA table_info(${safeTableName});`;
  const indexListSql = `PRAGMA index_list(${safeTableName});`;
  const foreignKeySql = `PRAGMA foreign_key_list(${safeTableName});`;
  const createSql = `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type = 'table' AND name = '${safeTableName}';`;

  const tableInfo = runRemoteQuery(workerDir, dbName, envName, tableInfoSql)[0] as SnapshotCommandResult<SnapshotTableInfoRow>;
  const indexList = runRemoteQuery(workerDir, dbName, envName, indexListSql)[0] as SnapshotCommandResult<SnapshotIndexListRow>;
  const foreignKeyList = runRemoteQuery(workerDir, dbName, envName, foreignKeySql)[0] as SnapshotCommandResult<SnapshotForeignKeyRow>;
  const createSqlResult = runRemoteQuery(workerDir, dbName, envName, createSql)[0] as SnapshotCommandResult<{
    sql: string;
    name: string;
    type: string;
    tbl_name: string;
  }>;

  return {
    table_info: tableInfo,
    index_list: indexList,
    foreign_key_list: foreignKeyList,
    create_sql: createSqlResult,
  };
}

export function buildProductionSnapshot(contract: SchemaContract, opts?: { rootDir?: string; dbName?: string; envName?: string }): StructuralSnapshot {
  const rootDir = opts?.rootDir ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const workerDir = path.join(rootDir, 'worker-airtrust');
  const dbName = opts?.dbName ?? 'airtrust-db';
  const envName = opts?.envName ?? 'production';
  const tables = Object.fromEntries(
    contract.scoped_tables.map((tableName) => [tableName, readRemoteTable(workerDir, dbName, envName, tableName)]),
  );

  return {
    generatedAt: new Date().toISOString(),
    database: `${dbName}:${envName}:remote-read-only`,
    tables,
    functional: {},
  };
}

export function loadSnapshotFromFile(snapshotPath: string): StructuralSnapshot {
  return loadJson<StructuralSnapshot>(snapshotPath);
}

export function runSchemaContractCheck(input: {
  contractPath: string;
  snapshotPath?: string;
  production?: boolean;
  rootDir?: string;
  dbName?: string;
  envName?: string;
  options?: CheckSchemaOptions;
}): CheckSchemaResult {
  try {
    const contract = loadContract(input.contractPath);
    const snapshot = input.production
      ? buildProductionSnapshot(contract, {
          rootDir: input.rootDir,
          dbName: input.dbName,
          envName: input.envName,
        })
      : loadSnapshotFromFile(
          input.snapshotPath ??
            path.resolve(
              input.rootDir ?? process.cwd(),
              'docs/database/production-schema-snapshot-20260714/structural-snapshot.json',
            ),
        );

    return evaluateContract(contract, snapshot, input.options ?? { allowExtraColumns: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'FAIL',
      schemaHash: 'invalid',
      scopedTables: [],
      issues: [
        {
          severity: 'FAIL',
          code: 'INVALID_CONTRACT',
          message,
        },
      ],
    };
  }
}
