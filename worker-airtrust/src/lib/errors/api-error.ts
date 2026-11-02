/**
 * Erros de domínio/HTTP sem dependência do framework. O handler global que
 * converte esses erros em resposta JSON fica em middleware/error-handler,
 * que também re-exporta estes símbolos para os importadores existentes.
 */

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
