/**
 * ESCALAS — CMA Status (helper para wizard de tripulação)
 * Rota: GET /funcionarios/cma-status
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';

const cmaStatus = new Hono<{ Bindings: Env }>();

// GET /api/escalas/funcionarios/cma-status?ids=id1,id2,id3
cmaStatus.get('/', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const ids = c.req.query('ids') || '';
  if (!ids.trim()) return c.json({ success: true, data: [] });

  const idList = ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  const placeholders = idList.map(() => '?').join(',');

  try {
    const rows = await c.env.DB.prepare(
      `SELECT
        qh.funcionario_id,
        MAX(qh.data_vencimento) AS data_vencimento
       FROM qualificacoes_historico qh
       JOIN qualificacoes_tipos qt
         ON COALESCE(qh.qualificacao_codigo, qt.codigo) = qt.codigo
       JOIN funcionarios f ON f.id = qh.funcionario_id
       WHERE qt.codigo = 'CMA'
         AND f.empresa_id = ?
         AND qh.funcionario_id IN (${placeholders})
         AND qh.deleted_at IS NULL
       GROUP BY qh.funcionario_id`,
    )
      .bind(empresaId, ...idList)
      .all<{ funcionario_id: string; data_vencimento: string | null }>();

    const data = (rows.results || []).map((r) => {
      const venc = r.data_vencimento || '';
      const diasRestantes = venc
        ? Math.round((new Date(venc).getTime() - Date.now()) / 86400000)
        : null;
      return {
        funcionario_id: r.funcionario_id,
        data_vencimento: venc || null,
        status: !venc
          ? 'sem_cma'
          : diasRestantes !== null && diasRestantes < 0
            ? 'expirado'
            : diasRestantes !== null && diasRestantes <= 30
              ? 'vencendo'
              : 'ok',
        dias_restantes: diasRestantes,
      };
    });

    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default cmaStatus;
