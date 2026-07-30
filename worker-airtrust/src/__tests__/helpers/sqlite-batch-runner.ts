/**
 * Executa um array de statements { sql, args } contra um arquivo SQLite REAL
 * via CLI `sqlite3` (mesmo binário/padrão já usado em
 * scripts/apply-simuladores-matriz-import.mjs para provar rollback real em
 * matriz-apply-rollback.test.ts) — não é um mock/fake de D1.batch(), é o
 * motor SQL de verdade fazendo BEGIN/COMMIT/ROLLBACK real.
 *
 * Propósito: provar que buildCompletionBatchStatements(), executado como uma
 * única transação, se comporta exatamente como D1.batch() se comporta em
 * produção (tudo ou nada) — sem depender de um mock que pudesse mascarar uma
 * falha real de atomicidade.
 */
import { spawnSync } from 'node:child_process';

function quoteSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function inlineStatement(statement: { sql: string; args: unknown[] }): string {
  let index = 0;
  const sql = statement.sql.replace(/\?/g, () => quoteSqlLiteral(statement.args[index++]));
  return sql.trim().endsWith(';') ? sql : `${sql};`;
}

export interface SqliteBatchRunResult {
  code: number;
  stdout: string;
  stderr: string;
  committed: boolean;
}

/**
 * Executa BEGIN IMMEDIATE; <statements>; COMMIT; como um único script via
 * `sqlite3 -bail`. Se qualquer statement falhar, -bail interrompe o script
 * ANTES do COMMIT — a transação nunca é confirmada e a conexão do processo
 * fecha sem commit, o que faz o SQLite reverter tudo automaticamente
 * (comportamento padrão de conexão fechada com transação aberta).
 */
export function runSqliteBatch(
  dbPath: string,
  statements: Array<{ sql: string; args: unknown[] }>,
): SqliteBatchRunResult {
  const script = ['BEGIN IMMEDIATE;', ...statements.map(inlineStatement), 'COMMIT;'].join('\n');
  const result = spawnSync('sqlite3', ['-bail', dbPath], {
    input: script,
    encoding: 'utf8',
  });
  const committed = result.status === 0;
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    committed,
  };
}

export function execSql(dbPath: string, sql: string): SqliteBatchRunResult {
  const result = spawnSync('sqlite3', ['-bail', dbPath], { input: sql, encoding: 'utf8' });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    committed: result.status === 0,
  };
}

export function querySql<T = Record<string, unknown>>(dbPath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', dbPath], { input: sql, encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout?.trim()) return [];
  try {
    return JSON.parse(result.stdout) as T[];
  } catch {
    return [];
  }
}
