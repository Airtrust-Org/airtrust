/**
 * Contagem de idas ao D1 por requisição (somente observabilidade, #2227).
 *
 * Um Proxy ESTÁVEL por binding D1 (o mesmo objeto em todas as requisições do isolate) conta
 * round-trips (first/all/run/raw/exec/batch) e soma o tempo. A estatística da requisição corrente
 * vem de AsyncLocalStorage, então a identidade do binding é preservada — caches e coalescers
 * indexados por `WeakMap<D1Database, ...>` (db-schema, snapshot de Compliance) continuam válidos.
 *
 * Delega tudo ao binding original (SQL, binds, resultados e erros inalterados; `withSession`
 * preservado). `dbMs` é a SOMA dos tempos; consultas concorrentes somam acima do tempo real.
 * Trabalho coalescido entre requisições é atribuído à requisição que o executou.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface D1RequestStats {
  roundTrips: number;
  statements: number;
  dbMs: number;
  /** Soma de `meta.rows_read` dos statements que devolvem metadados (all/run/batch). */
  rowsRead: number;
  /** Soma de `meta.rows_written` dos mesmos statements. */
  rowsWritten: number;
  /**
   * Statements sem `meta` (first/raw/exec não devolvem metadados no D1): `rowsRead` é, portanto,
   * um piso e este contador diz quanto da requisição ficou fora da medição.
   */
  unmeteredStatements: number;
}

export function createD1RequestStats(): D1RequestStats {
  return { roundTrips: 0, statements: 0, dbMs: 0, rowsRead: 0, rowsWritten: 0, unmeteredStatements: 0 };
}

function readRowsMeta(value: unknown): { rowsRead: number; rowsWritten: number } | null {
  if (value === null || typeof value !== 'object') return null;
  const meta = (value as { meta?: unknown }).meta;
  if (meta === null || typeof meta !== 'object') return null;
  const { rows_read: rowsRead, rows_written: rowsWritten } = meta as {
    rows_read?: unknown;
    rows_written?: unknown;
  };
  if (typeof rowsRead !== 'number' || !Number.isFinite(rowsRead)) return null;
  return {
    rowsRead,
    rowsWritten: typeof rowsWritten === 'number' && Number.isFinite(rowsWritten) ? rowsWritten : 0,
  };
}

/** Somente observabilidade: nunca lança nem altera o resultado devolvido ao chamador. */
function recordRows(stats: D1RequestStats, name: string, result: unknown): void {
  try {
    const items = name === 'batch' && Array.isArray(result) ? result : [result];
    for (const item of items) {
      const rows = name === 'first' || name === 'raw' || name === 'exec' ? null : readRowsMeta(item);
      if (rows) {
        stats.rowsRead += rows.rowsRead;
        stats.rowsWritten += rows.rowsWritten;
      } else {
        stats.unmeteredStatements += 1;
      }
    }
  } catch {
    stats.unmeteredStatements += 1;
  }
}

const requestStats = new AsyncLocalStorage<D1RequestStats>();
const stableProxies = new WeakMap<object, object>();

export function runWithD1Stats<T>(stats: D1RequestStats, fn: () => T): T {
  return requestStats.run(stats, fn);
}

const TIMED_METHODS = new Set(['first', 'all', 'run', 'raw', 'exec', 'batch']);
const WRAPPED_RETURNING = new Set(['prepare', 'bind', 'withSession']);

function timed(target: object, method: (...args: unknown[]) => unknown, name: string) {
  return (...args: unknown[]) => {
    const stats = requestStats.getStore();
    if (!stats) return method.apply(target, args);
    const startedAt = performance.now();
    stats.roundTrips += 1;
    stats.statements += name === 'batch' && Array.isArray(args[0]) ? args[0].length : 1;
    const finish = () => {
      stats.dbMs += performance.now() - startedAt;
    };
    let result: unknown;
    try {
      result = method.apply(target, args);
    } catch (error) {
      finish();
      throw error;
    }
    return Promise.resolve(result)
      .then((value) => {
        recordRows(stats, name, value);
        return value;
      })
      .finally(finish);
  };
}

function wrap<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      const method = value as (...args: unknown[]) => unknown;
      if (TIMED_METHODS.has(prop)) return timed(obj, method, prop);
      if (WRAPPED_RETURNING.has(prop)) {
        return (...args: unknown[]) => {
          const result = method.apply(obj, args);
          return result !== null && typeof result === 'object' ? wrap(result as object) : result;
        };
      }
      return method.bind(obj);
    },
  });
}

/** Retorna sempre o MESMO proxy para o mesmo binding. */
export function instrumentD1<T extends object>(db: T): T {
  const cached = stableProxies.get(db);
  if (cached) return cached as T;
  const proxy = wrap(db);
  stableProxies.set(db, proxy);
  return proxy;
}
