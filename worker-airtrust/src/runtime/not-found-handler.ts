import type { Context } from 'hono';

export function createApiNotFoundHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c: Context<any>) => {
    const path = c.req.path;

    if (path.startsWith('/api/')) {
      return c.json(
        {
          success: false,
          error: 'Endpoint não encontrado',
          code: 'ENDPOINT_NOT_FOUND',
          path,
          method: c.req.method,
        },
        404,
      );
    }

    return c.text('Not Found', 404);
  };
}
