/**
 * ERROR HANDLER MIDDLEWARE - Global Error Handling
 *
 * Captura erros não tratados e retorna resposta JSON padronizada
 * Previne vazamento de informações sensíveis em produção
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

  // Se for ApiError, usar statusCode definido
  if (err instanceof ApiError) {
    return c.json(
      {
        success: false,
        error: err.message,
        code: err.code,
        requestId,
      },
      err.statusCode as SupportedErrorStatus,
    );
  }

  // Se for AppError (de utils/errors), usar status definido
  // Verificar por propriedades (o nome pode variar após transpile/minify)
  const appErrorCandidate = err as Error & { status?: unknown; code?: string };
  if (typeof appErrorCandidate.status === 'number') {
    return c.json(
      {
        success: false,
        error: appErrorCandidate.message,
        code: appErrorCandidate.code,
        requestId,
      },
      appErrorCandidate.status as SupportedErrorStatus,
    );
  }

  // Detectar ambiente via binding (NUNCA via header — isso exporia stack traces a qualquer request)
  const isDevelopment = environment === 'development' || environment === 'staging';

  // Em produção: nunca expor stack traces
  if (isDevelopment) {
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

  // Produção: resposta segura sem detalhes internos
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
