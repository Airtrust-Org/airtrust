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
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
      ? cause
      : '';

  const combined = `${name} ${code} ${status} ${message} ${causeMessage}`.toLowerCase();

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
    combined.includes('connection reset') ||
    combined.includes('connection closed') ||
    combined.includes('connection lost') ||
    combined.includes('connection aborted') ||
    combined.includes('socket hang up') ||
    combined.includes('fetch failed') ||
    combined.includes('failed to fetch') ||
    combined.includes('network') ||
    combined.includes('econnreset') ||
    combined.includes('etimedout') ||
    combined.includes('econnaborted') ||
    combined.includes('econnrefused') ||
    combined.includes('d1_') ||
    combined.includes('d1 error') ||
    combined.includes('internal error') ||
    combined.includes('server error') ||
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
  maxAttempts = 5,
  initialBackoffMs = 60,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isTransientD1Error(err)) {
        throw err;
      }
      const backoff = initialBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 25;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

