import { describe, expect, it } from 'vitest';

import qualificacoesRouter from '../../routes/qualificacoes';
import atomicRouter from '../../routes/qualificacoes/historico-atomic-write';
import legacyHistoricoRouter from '../../routes/qualificacoes/historico';

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

function expectSingleAtomicChain(aggregatePath: string, atomicPath: string): void {
  const aggregateHandlers = matchingPostRoutes(qualificacoesRouter.routes, aggregatePath);
  const atomicHandlers = matchingPostRoutes(atomicRouter.routes, atomicPath);

  expect(atomicHandlers.length).toBeGreaterThan(0);
  expect(aggregateHandlers).toHaveLength(atomicHandlers.length);
}

describe('qualification history route registration', () => {
  it('registers only the atomic create and renewal chains', () => {
    expectSingleAtomicChain('/historico', '/');
    expectSingleAtomicChain('/historico/:id/renovar', '/:id/renovar');
  });

  it('unregisters both legacy non-atomic POST paths', () => {
    expect(matchingPostRoutes(legacyHistoricoRouter.routes, '/')).toHaveLength(0);
    expect(matchingPostRoutes(legacyHistoricoRouter.routes, '/:id/renovar')).toHaveLength(0);
  });
});
