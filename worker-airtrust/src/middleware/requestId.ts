import type { MiddlewareHandler } from 'hono';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Preserva IDs externos opacos, curtos e seguros para correlação. Valores
 * ausentes, vazios, longos demais ou com caracteres inadequados são
 * substituídos para impedir propagação de conteúdo não confiável.
 */
export function normalizeRequestId(value: string | undefined): string {
  if (value !== undefined && REQUEST_ID_PATTERN.test(value)) return value;
  return crypto.randomUUID();
}

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = normalizeRequestId(c.req.header('X-Request-ID'));
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    return next();
  };
};
