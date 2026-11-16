/**
 * Contagem de idas ao D1 por requisição (somente observabilidade, #2227).
 *
 * Embrulha o binding D1 com Proxy para contar round-trips (first/all/run/raw/batch/exec) e somar o
 * tempo gasto em cada um. Não altera SQL, parâmetros, resultados nem erros: delega tudo ao binding
 * original. `dbMs` é a SOMA dos tempos; consultas concorrentes (Promise.all) somam acima do tempo real.
 */
export interface D1RequestStats {
  roundTrips: number;
  statements: number;
  dbMs: number;
}

export function createD1RequestStats(): D1RequestStats {
  return { roundTrips: 0, statements: 0, dbMs: 0 };
}

const TIMED_METHODS = new Set(['first', 'all', 'run', 'raw', 'exec', 'batch']);

function timed(
  target: object,
  method: (...args: unknown[]) => unknown,
  name: string,
  stats: D1RequestStats,
) {
  return (...args: unknown[]) => {
    const startedAt = performance.now();
    stats.roundTrips += 1;
    if (name === 'batch' && Array.isArray(args[0])) stats.statements += args[0].length;
    else stats.statements += 1;
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
    return Promise.resolve(result).finally(finish);
  };
}

const WRAPPED_RETURNING = new Set(['prepare', 'bind', 'withSession']);

function wrap<T extends object>(target: T, stats: D1RequestStats): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      const method = value as (...args: unknown[]) => unknown;
      if (TIMED_METHODS.has(prop)) return timed(obj, method, prop, stats);
      if (WRAPPED_RETURNING.has(prop)) {
        return (...args: unknown[]) => {
          const result = method.apply(obj, args);
          return result !== null && typeof result === 'object'
            ? wrap(result as object, stats)
            : result;
        };
      }
      return method.bind(obj);
    },
  });
}

export function instrumentD1<T extends object>(db: T, stats: D1RequestStats): T {
  return wrap(db, stats);
}
