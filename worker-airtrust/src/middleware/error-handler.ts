/**
 * ERROR HANDLER MIDDLEWARE - Global Error Handling
 *
 * Captura erros não tratados e retorna resposta JSON padronizada.
 * Detalhes técnicos permanecem nos logs e nunca atravessam a fronteira HTTP
 * em staging/produção para respostas 5xx.
 */

import type { ErrorHandler } from 'hono';
import { ApiError } from '../lib/errors/api-error';

// Re-export: o contrato público de middleware/error-handler continua o mesmo.
export {
  ApiError,
  badRequest,
  forbidden,
  internalError,
  notFound,
  serviceUnavailable,
  unauthorized,
} from '../lib/errors/api-error';

type SupportedErrorStatus = 400 | 401 | 403 | 404 | 500 | 503;

type ErrorContextReader = {
  get: (key: string) => unknown;
};

function resolveRequestId(
  c: ErrorContextReader & {
    req: { header: (name: string) => string | undefined };
  },
): string {
  const contextRequestId = c.get('requestId');
  if (typeof contextRequestId === 'string' && contextRequestId.trim().length > 0) {
    return contextRequestId;
  }

  const headerRequestId = c.req.header('X-Request-ID');
  if (typeof headerRequestId === 'string' && headerRequestId.trim().length > 0) {
    return headerRequestId;
  }

  return crypto.randomUUID();
}

function resolveContextId(
  c: ErrorContextReader,
  key: 'empresaId' | 'userId',
): string | number | undefined {
  const value = c.get(key);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

export function safeServerMessage(status: number): string {
  if (status === 503) return 'Serviço temporariamente indisponível.';
  return 'Erro interno do servidor';
}

function shouldExposeServerDetail(environment: string, status: number): boolean {
  return environment === 'development' || status < 500;
}

/**
 * Error handler global para o Worker
 * Captura todos os erros não tratados e retorna JSON
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = resolveRequestId(c);
  const empresaId = resolveContextId(c, 'empresaId');
  const userId = resolveContextId(c, 'userId');
  const environment = c.env?.ENVIRONMENT || 'unknown';
  c.header('X-Request-ID', requestId);

  console.error('[ERROR]', {
    requestId,
    empresaId,
    userId,
    environment,
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  // ApiError preserva feedback 4xx de negócio. Em staging/produção, 5xx
  // mantém apenas code/requestId e uma mensagem operacional genérica.
  if (err instanceof ApiError) {
    const exposeDetail = shouldExposeServerDetail(environment, err.statusCode);
    return c.json(
      {
        success: false,
        error: exposeDetail ? err.message : safeServerMessage(err.statusCode),
        code: err.code,
        requestId,
      },
      err.statusCode as SupportedErrorStatus,
    );
  }

  // AppError (utils/errors): mesma política, verificado por propriedades
  // porque o nome da classe pode variar após transpile/minify.
  const appErrorCandidate = err as Error & { status?: unknown; code?: string };
  if (typeof appErrorCandidate.status === 'number') {
    const exposeDetail = shouldExposeServerDetail(environment, appErrorCandidate.status);
    return c.json(
      {
        success: false,
        error: exposeDetail
          ? appErrorCandidate.message
          : safeServerMessage(appErrorCandidate.status),
        code: appErrorCandidate.code,
        requestId,
      },
      appErrorCandidate.status as SupportedErrorStatus,
    );
  }

  // Somente desenvolvimento local pode receber detalhes técnicos pela resposta.
  // Staging segue a mesma fronteira de confidencialidade de produção; o stack
  // completo continua disponível no log estruturado acima.
  if (environment === 'development') {
    return c.json(
      {
        success: false,
        error: err.message,
        errorName: err.name,
        stack: err.stack,
        path: c.req.path,
        method: c.req.method,
        requestId,
      },
      500,
    );
  }

  return c.json(
    {
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
      requestId,
    },
    500,
  );
};
