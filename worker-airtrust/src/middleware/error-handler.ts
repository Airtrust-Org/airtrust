/**
 * ERROR HANDLER MIDDLEWARE - Global Error Handling
 *
 * Captura erros não tratados e retorna resposta JSON padronizada.
 * Detalhes técnicos permanecem nos logs e nunca atravessam a fronteira HTTP
 * em staging/produção para respostas 5xx.
 */

import type { ErrorHandler } from 'hono';

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

function safeServerMessage(status: number): string {
  if (status === 503) return 'Serviço temporariamente indisponível.';
  return 'Erro interno do servidor';
}

function shouldExposeServerDetail(environment: string, status: number): boolean {
  return environment === 'development' || status < 500;
}

/**
 * Classe de erro customizada para API
 * Permite definir status code e mensagem específica
 */
export class ApiError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

/**
 * Helper para lançar erro 400 (Bad Request)
 */
export function badRequest(message: string, code?: string): never {
  throw new ApiError(message, 400, code);
}

/**
 * Helper para lançar erro 401 (Unauthorized)
 */
export function unauthorized(message: string = 'Não autorizado', code?: string): never {
  throw new ApiError(message, 401, code);
}

/**
 * Helper para lançar erro 403 (Forbidden)
 */
export function forbidden(message: string = 'Acesso negado', code?: string): never {
  throw new ApiError(message, 403, code);
}

/**
 * Helper para lançar erro 404 (Not Found)
 */
export function notFound(message: string = 'Recurso não encontrado', code?: string): never {
  throw new ApiError(message, 404, code);
}

/**
 * Helper para lançar erro 500 (Internal Server Error)
 */
export function internalError(message: string = 'Erro interno', code?: string): never {
  throw new ApiError(message, 500, code);
}

/**
 * Helper para lançar erro 503 (Service Unavailable)
 * Usado quando uma checagem de segurança obrigatória (ex: blocklist de
 * tokens revogados) não pode ser executada — a falha deve impedir a
 * autenticação (fail-closed), não permiti-la silenciosamente.
 */
export function serviceUnavailable(message: string = 'Serviço indisponível', code?: string): never {
  throw new ApiError(message, 503, code);
}
