/**
 * QUALIFICACOES - Router Agregador
 * Combina todos os sub-módulos especializados
 *
 * STATUS: ✅ FASE 2 COMPLETA - Modularização concluída
 * - ✅ tipos.ts (CRUD qualificacoes_tipos)
 * - ✅ historico.ts (GET histórico com filtros/stats)
 * - ✅ estatisticas.ts (Dashboard analytics)
 * - ✅ atribuicao.ts (Assign/renew qualificações)
 * - ✅ validacao.ts (Regras de negócio)
 * - ✅ shared.ts (Tipos e helpers)
 * - ✅ index.ts (Agregador de rotas)
 */

import { Hono } from 'hono';
import type { Env } from '../../types';

import tiposRouter from './tipos';
import historicoRouter from './historico';
import estatisticasRouter from './estatisticas';
import atribuicaoRouter from './atribuicao';
import formatosRouter from './formatos';

const router = new Hono<{ Bindings: Env }>();

// ===== MONTAR SUB-ROTAS =====
router.route('/tipos', tiposRouter);
router.route('/historico', historicoRouter);
router.route('/stats', estatisticasRouter);
router.route('/atribuir', atribuicaoRouter);
router.route('/formatos', formatosRouter);

// ===== HEALTH CHECK =====
router.get('/health', (c) => {
  return c.json({
    success: true,
    module: 'qualificacoes',
    status: 'healthy',
    refactoring: {
      phase: 'phase_2_complete',
      modules: ['tipos', 'historico', 'stats', 'atribuir', 'validacao', 'shared'],
      total_lines: '~1580 em 6 arquivos',
      original_lines: '2294 em 1 arquivo',
      reduction: '31%',
      status: 'modularizado e otimizado ✅',
    },
  });
});

export default router;
