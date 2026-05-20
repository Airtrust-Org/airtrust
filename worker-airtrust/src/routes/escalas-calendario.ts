/**
 * ESCALAS — Calendário (view para frontend)
 * GET /:id/calendario
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { gerarAlertasCMA } from '../utils/escala-engine';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';

const calendario = new Hono<{ Bindings: Env }>();

// GET /:id/calendario — view para o frontend (formato calendário)
calendario.get('/:id/calendario', auth(), async (c) => {
  const { id } = c.req.param();
  const { incluir_mes_anterior, incluir_mes_seguinte } = c.req.query();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = (await getEscalaVerificada(db, id, empresaId)) as Record<string, unknown> | null;
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const mes = escala.mes as number;
    const ano = escala.ano as number;

    // Calcular range de datas
    const lastDay = new Date(ano, mes, 0).getDate();
    let rangeInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    let rangeFim = `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    if (incluir_mes_anterior === 'true') {
      const prevDate = new Date(ano, mes - 2, 1);
      const prevLastDay = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
      rangeInicio = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`;
    }
    if (incluir_mes_seguinte === 'true') {
      const nextDate = new Date(ano, mes, 1);
      rangeFim = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // Eventos, tripulações legadas, alocações v2 e alertas CMA em paralelo
    const [eventosResult, tripulacoesResult, alocacoesResult, alertasCMA] = await Promise.all([
      db
        .prepare(
          `SELECT ee.*,
                  f.nome as funcionario_nome,
                  f.matricula as funcionario_matricula,
                  f.cargo as funcionario_cargo,
                  et.aeronave as tripulacao_aeronave,
                  et.base as tripulacao_base
           FROM escala_eventos ee
           JOIN escalas_mensais em ON em.id = ee.escala_id
           LEFT JOIN funcionarios f ON ee.funcionario_id = f.id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
           LEFT JOIN escala_tripulacoes et ON ee.tripulacao_id = et.id
           WHERE ee.escala_id = ?
             AND em.empresa_id = ?
             AND em.deleted_at IS NULL
             AND ee.deleted_at IS NULL
             AND ee.data_inicio <= ?
             AND ee.data_fim >= ?
           ORDER BY f.nome, ee.data_inicio`,
        )
        .bind(id, empresaId, rangeFim, rangeInicio)
        .all(),
      db
        .prepare(
          `SELECT et.*,
                  pic.nome as pic_nome, pic.matricula as pic_matricula, pic.guerra as pic_nome_guerra,
                  COALESCE(pic.funcao, pic.cargo) as pic_funcao,
                  sic.nome as sic_nome, sic.matricula as sic_matricula, sic.guerra as sic_nome_guerra,
                  COALESCE(sic.funcao, sic.cargo) as sic_funcao,
                  pe.nome as padrao_nome, pe.dias_trabalho, pe.dias_folga
           FROM escala_tripulacoes et
           JOIN escalas_mensais em ON em.id = et.escala_id
           LEFT JOIN funcionarios pic ON et.pic_id = pic.id AND (pic.empresa_id IS NULL OR pic.empresa_id = em.empresa_id)
           LEFT JOIN funcionarios sic ON et.sic_id = sic.id AND (sic.empresa_id IS NULL OR sic.empresa_id = em.empresa_id)
           LEFT JOIN padroes_escala pe ON et.padrao_escala_id = pe.id
           WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
           ORDER BY et.data_inicio`,
        )
        .bind(id, empresaId)
        .all(),
      db
        .prepare(
          `SELECT ea.*, 
                  f.nome AS funcionario_nome,
                  f.guerra AS funcionario_nome_guerra,
                  f.matricula AS funcionario_matricula,
                  COALESCE(f.funcao, f.cargo) AS funcionario_role,
                  a.prefixo AS aeronave_prefixo,
                  a.modelo AS aeronave_modelo
           FROM escala_alocacoes ea
           JOIN escalas_mensais em ON em.id = ea.escala_id
           LEFT JOIN funcionarios f ON ea.funcionario_id = f.id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
           LEFT JOIN aeronaves a ON ea.aeronave_id = a.id
           WHERE ea.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ea.deleted_at IS NULL
           ORDER BY a.prefixo, ea.funcao, ea.data_inicio`,
        )
        .bind(id, empresaId)
        .all(),
      gerarAlertasCMA(db, id),
    ]);

    return c.json({
      success: true,
      data: {
        escala,
        range: { inicio: rangeInicio, fim: rangeFim },
        tripulacoes: tripulacoesResult.results,
        alocacoes: alocacoesResult.results,
        eventos: eventosResult.results,
        alertas_cma: alertasCMA,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default calendario;
