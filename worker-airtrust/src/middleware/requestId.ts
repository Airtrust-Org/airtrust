import type { MiddlewareHandler } from 'hono';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{0,127}$/;

/**
 * Preserva IDs externos opacos, curtos e seguros para correlação. Valores
 * ausentes, vazios, longos demais ou com caracteres inadequados são
 * substituídos para impedir propagação de conteúdo não confiável.
 */
export function normalizeRequestId(value: string | undefined): string {
  if (value !== undefined && REQUEST_ID_PATTERN.test(value)) return value;
  return crypto.randomUUID();
}

function getSafeErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('code' in payload)) return undefined;

  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' && SAFE_ERROR_CODE_PATTERN.test(code) ? code : undefined;
}

/**
 * Barreira final para rotas legadas que ainda capturam exceções localmente e
 * montam JSON 5xx com `error.message`. Em produção, nenhum corpo JSON 5xx pode
 * expor detalhes de D1, nomes de tabela/coluna, stack ou mensagens de
 * dependências. Headers, status e códigos públicos estáveis são preservados.
 */
export async function sanitizeProductionServerErrorResponse(
  response: Response,
  environment: string | undefined,
  requestId: string,
): Promise<Response> {
  if (environment !== 'production' || response.status < 500 || response.status > 599) {
    return response;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  const code =
    getSafeErrorCode(payload) ??
    (response.status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
  const error =
    response.status === 503 ? 'Serviço temporariamente indisponível' : 'Erro interno do servidor';

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('x-request-id', requestId);

  return new Response(
    JSON.stringify({
      success: false,
      error,
      code,
      requestId,
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  );
}

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = normalizeRequestId(c.req.header('X-Request-ID'));
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);

    await next();

    const environment = typeof c.env?.ENVIRONMENT === 'string' ? c.env.ENVIRONMENT : undefined;
    c.res = await sanitizeProductionServerErrorResponse(c.res, environment, requestId);
    c.header('X-Request-ID', requestId);
  };
};
