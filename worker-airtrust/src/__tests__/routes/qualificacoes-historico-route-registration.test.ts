import { describe, expect, it } from 'vitest';

import qualificacoesRouter from '../../routes/qualificacoes';
import atomicRouter from '../../routes/qualificacoes/historico-atomic-write';

type Route = { method: string; path: string };

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized || '/';
}

function matchingPostRoutes(routes: readonly Route[], expectedPath: string): Route[] {
  return routes.filter((route) => {
    return route.method === 'POST' && normalizePath(route.path) === expectedPath;
  });
}

describe('qualification history route registration', () => {
  it('registers creation and renewal exactly once in the aggregate router', () => {
    const routes = qualificacoesRouter.routes;

    expect(matchingPostRoutes(routes, '/historico')).toHaveLength(1);
    expect(matchingPostRoutes(routes, '/historico/:id/renovar')).toHaveLength(1);
  });

  it('uses the atomic router as the sole implementation of both POST paths', () => {
    const routes = atomicRouter.routes;

    expect(matchingPostRoutes(routes, '/')).toHaveLength(1);
    expect(matchingPostRoutes(routes, '/:id/renovar')).toHaveLength(1);
  });
});
