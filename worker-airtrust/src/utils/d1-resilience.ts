/**
 * D1 RESILIENCE UTILS - Classificação canônica de erros e retries transitórios D1
 *
 * Centraliza a detecção de erros transitórios de rede, timeouts, locks e indisponibilidade
 * RPC do Cloudflare D1. Mantém estritamente fail-closed: erros permanentes de schema, sintaxe
 * ou violações de constraints falham imediatamente na primeira tentativa.
 */

/**
 * Classifica se um erro lançado por operação D1 é tipicamente transitório
 * (locks SQLite/D1, timeouts de execução/rede, rate limits transitórios,
 * erros temporários de RPC Cloudflare ou indisponibilidade de serviço D1)
 * e, portanto, elegível a retry com backoff limitado.
 *
 * Erros permanentes (sintaxe SQL, tabelas/colunas inexistentes, violações
 * de constraints UNIQUE/NOT NULL/CHECK) NUNCA são transitórios e devem falhar
 * imediatamente na primeira tentativa para preservar fail-closed e evitar latência inútil.
 */
export function isTransientD1Error(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const code =
    typeof errObj?.code === 'string'
      ? errObj.code
      : typeof errObj?.code === 'number'
      ? String(errObj.code)
      : '';
  const status =
    typeof errObj?.status === 'string'
      ? errObj.status
      : typeof errObj?.status === 'number'
      ? String(errObj.status)
      : '';
  const name = typeof errObj?.name === 'string' ? errObj.name : '';
  const cause = errObj?.cause;
  const causeObj = typeof cause === 'object' && cause !== null ? (cause as Record<string, unknown>) : null;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
      ? cause
      : typeof causeObj?.message === 'string'
      ? causeObj.message
      : '';
  const causeCode =
    typeof causeObj?.code === 'string'
      ? causeObj.code
      : typeof causeObj?.code === 'number'
      ? String(causeObj.code)
      : '';
  const causeName = typeof causeObj?.name === 'string' ? causeObj.name : '';

  const combined = `${name} ${code} ${status} ${message} ${causeName} ${causeCode} ${causeMessage}`.toLowerCase();

  // 1. Erros permanentes de aplicação, sintaxe ou schema: fail-closed imediato
  if (
    combined.includes('syntax error') ||
    combined.includes('no such table') ||
    combined.includes('no such column') ||
    combined.includes('constraint failed') ||
    combined.includes('has no column named') ||
    combined.includes('datatype mismatch') ||
    combined.includes('sqlite_corrupt') ||
    combined.includes('malformed') ||
    combined.includes('not authorized') ||
    combined.includes('permission denied')
  ) {
    return false;
  }

  // Resource ceilings of the current Worker invocation are deterministic.
  // Retrying in the same invocation consumes even more of the exhausted budget.
  // Keep this guard before generic D1_EXEC_ERROR / subrequest / resource matches.
  // Specific worker invocation ceilings: subrequests, cpu time, worker memory.
  if (
    combined.includes('subrequest limit') ||
    combined.includes('maximum number of subrequests') ||
    combined.includes('too many subrequests') ||
    combined.includes('resource limit reached') ||
    combined.includes('worker resource limit') ||
    combined.includes('cpu time limit') ||
    combined.includes('memory limit exceeded') ||
    combined.includes('isolate memory limit')
  ) {
    return false;
  }

  // 2. Padrões conhecidos de falhas transitórias
  return (
    combined.includes('busy') ||
    combined.includes('locked') ||
    combined.includes('timeout') ||
    combined.includes('timed out') ||
    combined.includes('deadline exceeded') ||
    combined.includes('unavailable') ||
    combined.includes('rate limit') ||
    combined.includes('too many requests') ||
    combined.includes('too many connections') ||
    combined.includes('connection reset') ||
    combined.includes('connection closed') ||
    combined.includes('connection lost') ||
    combined.includes('connection aborted') ||
    combined.includes('socket hang up') ||
    combined.includes('fetch failed') ||
    combined.includes('failed to fetch') ||
    combined.includes('network') ||
    combined.includes('channel closed') ||
    combined.includes('remote procedure call') ||
    combined.includes('rpc error') ||
    combined.includes('transport error') ||
    combined.includes('protocol error') ||
    combined.includes('d1 client disconnected') ||
    combined.includes('temporarily unavailable') ||
    combined.includes('service unavailable') ||
    combined.includes('econnreset') ||
    combined.includes('etimedout') ||
    combined.includes('econnaborted') ||
    combined.includes('econnrefused') ||
    combined.includes('d1_') ||
    combined.includes('d1 error') ||
    combined.includes('internal error') ||
    combined.includes('server error') ||
    combined.includes('storage error') ||
    combined.includes('could not execute') ||
    combined.includes('cannot execute') ||
    combined.includes('failed to execute') ||
    combined.includes('execution failed') ||
    combined.includes('operation failed') ||
    combined.includes('d1 rpc') ||
    combined.includes('subrequest') ||
    combined.includes('upstream') ||
    combined.includes('resource limit') ||
    combined.includes('503') ||
    combined.includes('502') ||
    combined.includes('504') ||
    combined.includes('bad gateway') ||
    combined.includes('gateway timeout') ||
    combined.includes('overload') ||
    combined.includes('sqlite_ioerr') ||
    combined.includes('sqlite_cantopen') ||
    combined.includes('broken pipe')
  );
}

/** Categorias fixas para telemetria; nunca devolve texto arbitrário da exceção. */
export function classifyD1Failure(error: unknown): string {
  const value = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const text = value.toLowerCase();
  if (/no such (table|column)|syntax error|constraint failed/.test(text)) return 'schema_or_sql';
  if (/subrequest limit|too many subrequests|cpu time limit|memory limit exceeded/.test(text)) return 'worker_limit';
  if (/database resource limit|too many connections|rate limit|overload/.test(text)) return 'database_capacity';
  if (/timeout|timed out|deadline exceeded|etimedout/.test(text)) return 'timeout';
  if (/rpc|connection|network|socket|transport|channel closed|fetch failed/.test(text)) return 'transport';
  if (/busy|locked/.test(text)) return 'database_busy';
  if (/503|502|504|unavailable/.test(text)) return 'service_unavailable';
  return 'unclassified';
}

/**
 * Executa uma leitura no D1 com retry limitado para absorver falhas transitórias
 * (locks de banco, timeouts ou erros transitórios de rede/conexão).
 * Não assume instabilidade estrutural de RPC Cloudflare sem telemetria comprobatória.
 * Estritamente fail-closed: erros permanentes (sintaxe, schema, constraint) falham imediatamente
 * na primeira tentativa sem retry. Se as tentativas transitórias esgotarem, a exceção é propagada
 * e o chamador retorna 503 normalmente.
 */
export async function withD1Retry<T>(
  operation: () => Promise<T>,
  maxAttempts = 7,
  initialBackoffMs = 80,
  onAttempt?: (attempt: number, error?: unknown) => void,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      onAttempt?.(attempt + 1);
      return await operation();
    } catch (err) {
      attempt += 1;
      onAttempt?.(attempt, err);
      if (attempt >= maxAttempts || !isTransientD1Error(err)) {
        throw err;
      }
      const backoff = Math.min(1200, initialBackoffMs * Math.pow(1.8, attempt - 1)) + Math.random() * 30;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

