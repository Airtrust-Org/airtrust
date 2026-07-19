/**
 * ERROR HANDLER MIDDLEWARE - Global Error Handling
 *
 * Captura erros não tratados e retorna resposta JSON padronizada
 * Previne vazamento de informações sensíveis em produção
 */

import type { ErrorHandler } from 'hono';

function resolveRequestId(c: {
  get: (key: string) => unknown;
  req: { header: (name: string) => string | undefined };
}): string {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errorHandler: ErrorHandler<any> = (err, c) => {
  const requestId = resolveRequestId(c);
  c.header('X-Request-ID', requestId);

  console.error('[ERROR]', {
    requestId,
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
      err.statusCode as 400 | 401 | 403 | 404 | 500 | 503,
    );
  }

  // Se for AppError (de utils/errors), usar status definido
  // Verificar por propriedades (o nome pode variar após transpile/minify)
  if ('status' in err && typeof (err as any).status === 'number') {
    const appErr = err as { message: string; status: number; code?: string };
    return c.json(
      {
        success: false,
        error: appErr.message,
        code: appErr.code,
        requestId,
      },
      appErr.status as 400 | 401 | 403 | 404 | 500 | 503,
    );
  }

  // Detectar ambiente via binding (NUNCA via header — isso exporia stack traces a qualquer request)
  const isDevelopment = c.env?.ENVIRONMENT === 'development' || c.env?.ENVIRONMENT === 'staging';

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
