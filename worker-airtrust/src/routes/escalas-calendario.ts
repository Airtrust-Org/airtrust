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

    // Eventos, tripulações legadas, alocações v2, alertas CMA e sessões diretas em paralelo
    const [eventosResult, tripulacoesResult, alocacoesResult, alertasCMA, sessoesDiretas] = await Promise.all([
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
      // Direct projection: simulator sessions not yet in escala_eventos.
      // Sessions created before the sync feature was deployed lack escala_eventos
      // entries. This query adds them without requiring backfill or edits.
      db
        .prepare(
          `SELECT
             'direct-sim-' || CAST(sa.id AS TEXT) || '-' || CAST(sp.funcionario_id AS TEXT) AS id,
             ? AS escala_id,
             'sim_sessao:' || CAST(sa.id AS TEXT) AS tripulacao_id,
             CAST(sp.funcionario_id AS TEXT) AS funcionario_id,
             'treinamento_simulador' AS tipo_evento,
             sa.data AS data_inicio,
             sa.data AS data_fim,
             'dia_todo' AS turno,
             sim.nome AS local,
             NULL AS aeronave,
             CAST(sa.simulador_id AS TEXT) AS simulador_id,
             1 AS gerado_automaticamente,
             'Projetado da sessão de simulador (sem backfill). Gerencie no módulo Simuladores.' AS motivo_automatico,
             CASE WHEN UPPER(COALESCE(sa.status, '')) LIKE '%CANCEL%' THEN 'cancelado'
                  WHEN UPPER(COALESCE(sa.status, '')) LIKE '%PEND%' THEN 'pendente'
                  ELSE 'confirmado' END AS status,
             'simuladores' AS origem,
             COALESCE(sa.nome, sa.tipo_sessao) AS observacoes,
             f.nome AS funcionario_nome,
             f.matricula AS funcionario_matricula,
             f.cargo AS funcionario_cargo,
             NULL AS tripulacao_aeronave,
             NULL AS tripulacao_base
           FROM simulador_agendamentos sa
           JOIN sessoes_participantes sp
             ON sp.sessao_id = sa.id AND sp.deleted_at IS NULL
           LEFT JOIN funcionarios f
             ON f.id = sp.funcionario_id AND f.deleted_at IS NULL
           LEFT JOIN simuladores sim
             ON sim.id = sa.simulador_id AND sim.deleted_at IS NULL
           WHERE sa.empresa_id = ?
             AND sa.deleted_at IS NULL
             AND sa.data >= ?
             AND sa.data <= ?
             AND NOT EXISTS (
               SELECT 1 FROM escala_eventos ee
               WHERE ee.origem = 'simuladores'
                 AND ee.tripulacao_id = 'sim_sessao:' || CAST(sa.id AS TEXT)
                 AND ee.funcionario_id = CAST(sp.funcionario_id AS TEXT)
                 AND ee.deleted_at IS NULL
             )`,
        )
        .bind(id, empresaId, rangeInicio, rangeFim)
        .all(),
    ]);

    const todosEventos = [
      ...eventosResult.results,
      ...(sessoesDiretas.results || []),
    ];

    return c.json({
      success: true,
      data: {
        escala,
        range: { inicio: rangeInicio, fim: rangeFim },
        tripulacoes: tripulacoesResult.results,
        alocacoes: alocacoesResult.results,
        eventos: todosEventos,
        alertas_cma: alertasCMA,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default calendario;
