import { describe, expect, it } from 'vitest';

import qualificacoesRouter from '../../routes/qualificacoes';
import historicoAtomicWriteRouter from '../../routes/qualificacoes/historico-atomic-write';

type RegisteredRoute = { method: string; path: string };

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized || '/';
}

function matchingPostRoutes(
  routes: readonly RegisteredRoute[],
  expectedPath: string,
): RegisteredRoute[] {
  return routes.filter(
    (route) => route.method === 'POST' && normalizePath(route.path) === expectedPath,
  );
}

describe('qualification history route registration', () => {
  it('registers creation and renewal exactly once in the aggregate router', () => {
    expect(matchingPostRoutes(qualificacoesRouter.routes, '/historico')).toHaveLength(1);
    expect(
      matchingPostRoutes(qualificacoesRouter.routes, '/historico/:id/renovar'),
    ).toHaveLength(1);
  });

  it('uses the atomic router as the sole implementation of both POST paths', () => {
    expect(matchingPostRoutes(historicoAtomicWriteRouter.routes, '/')).toHaveLength(1);
    expect(
      matchingPostRoutes(historicoAtomicWriteRouter.routes, '/:id/renovar'),
    ).toHaveLength(1);
  });
});
