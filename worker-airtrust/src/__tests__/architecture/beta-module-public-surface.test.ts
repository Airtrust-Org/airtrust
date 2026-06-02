import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import hospedagemRoutes from '../../routes/hospedagem';
import lmsCursosRoutes from '../../routes/lms-cursos';
import sgsoRoutes from '../../routes/sgso';
import treinamentosPlanejadosRoutes from '../../routes/treinamentos-planejados';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/hospedagem', hospedagemRoutes);
  app.route('/lms', lmsCursosRoutes);
  app.route('/sgso', sgsoRoutes);
  app.route('/treinamentos', treinamentosPlanejadosRoutes);
  return app;
}

describe('beta module public surface', () => {
  it.each([
    ['/hospedagem', 'Hospedagem'],
    ['/lms/cursos', 'LMS/EAD'],
    ['/sgso/relatos', 'SGSO'],
    ['/treinamentos/planejados', 'Treinamentos planejados'],
  ])('bloqueia acesso sem Authorization em %s', async (pathname, _label) => {
    const app = createApp();

    const response = await app.fetch(new Request(`http://localhost${pathname}`), {
      ENVIRONMENT: 'production',
    } as Env);

    expect(response.status).toBe(401);
  });
});
