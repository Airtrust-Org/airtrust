import { MiddlewareHandler } from 'hono';

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = c.req.header('X-Request-ID') || crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    return next();
  };
};
