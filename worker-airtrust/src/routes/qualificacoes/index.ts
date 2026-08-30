/**
 * QUALIFICACOES - Router Agregador
 * Combina todos os sub-módulos especializados
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { safeServerErrorResponseBoundary } from '../../middleware/safe-server-error-response';

import tiposRouter from './tipos-canonical-boundary';
import historicoRouter from './historico';
import historicoAtomicWriteRouter from './historico-atomic-write';
import estatisticasRouter from './estatisticas';
import atribuicaoRouter from './atribuicao';
import formatosRouter from './formatos';

const router = new Hono<{ Bindings: Env }>();

// Defense-in-depth: some legacy qualification handlers catch exceptions and
// build 5xx JSON responses themselves. Those responses bypass app.onError(), so
// sanitize them here before they cross the HTTP boundary in staging/production.
router.use('*', safeServerErrorResponseBoundary());

const retiredLegacyAtomicPostPaths = new Set(['/', '/:id/renovar']);
const retainedHistoricoRoutes = historicoRouter.routes.filter(
  (route) => !(route.method === 'POST' && retiredLegacyAtomicPostPaths.has(route.path)),
);
historicoRouter.routes.splice(0, historicoRouter.routes.length, ...retainedHistoricoRoutes);

router.route('/tipos', tiposRouter);
router.route('/historico', historicoAtomicWriteRouter);
router.route('/historico', historicoRouter);
router.route('/stats', estatisticasRouter);
router.route('/atribuir', atribuicaoRouter);
router.route('/formatos', formatosRouter);

router.get('/health', (c) => {
  return c.json({
    success: true,
    module: 'qualificacoes',
    status: 'healthy',
    category_contract: 'categoria_id_canonical',
    legacy_format: 'retired',
  });
});

export default router;
