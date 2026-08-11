/**
 * QUALIFICACOES - Router Agregador
 * Combina todos os sub-módulos especializados
 */

import { Hono } from 'hono';
import type { Env } from '../../types';

import tiposRouter from './tipos-canonical-boundary';
import historicoRouter from './historico';
import historicoAtomicWriteRouter from './historico-atomic-write';
import estatisticasRouter from './estatisticas';
import atribuicaoRouter from './atribuicao';
import formatosRouter from './formatos';

const router = new Hono<{ Bindings: Env }>();

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
