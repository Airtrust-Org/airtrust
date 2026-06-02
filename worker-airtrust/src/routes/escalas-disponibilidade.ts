/**
 * ESCALAS — Disponibilidade de Pilotos
 * Rota: GET /disponibilidade
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';

const disponibilidade = new Hono<{ Bindings: Env }>();

// GET /api/escalas/disponibilidade?funcionarios=id1,id2&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
disponibilidade.get('/', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const ids = c.req.query('funcionarios') || '';
  const dataInicio = c.req.query('data_inicio') || '';
  const dataFim = c.req.query('data_fim') || '';

  if (!ids.trim() || !dataInicio || !dataFim) {
    return c.json(
      { success: false, error: 'Parâmetros obrigatórios: funcionarios, data_inicio, data_fim' },
      400,
    );
  }

  const idList = ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  const placeholders = idList.map(() => '?').join(',');

  try {
    const rows = await c.env.DB.prepare(
      `SELECT ee.funcionario_id, ee.data_inicio, ee.data_fim, ee.tipo_evento, em.mes, em.ano
       FROM escala_eventos ee
       JOIN escalas_mensais em ON em.id = ee.escala_id
       WHERE em.empresa_id = ?
         AND em.status IN ('publicada', 'aprovada')
         AND em.deleted_at IS NULL
         AND ee.deleted_at IS NULL
         AND ee.funcionario_id IN (${placeholders})
         AND ee.data_inicio <= ?
         AND ee.data_fim >= ?`,
    )
      .bind(empresaId, ...idList, dataFim, dataInicio)
      .all<{
        funcionario_id: string;
        data_inicio: string;
        data_fim: string;
        tipo_evento: string;
      }>();

    return c.json({ success: true, data: rows.results || [] });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default disponibilidade;
