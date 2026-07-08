/**
 * ESCALAS — Conflitos (verificação pré-publicação)
 * GET /:id/conflitos
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';
import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';

const conflitos = new Hono<{ Bindings: Env }>();

const AUTO_EVENTOS_SUBSTITUIVEIS = new Set([
  'voo',
  'folga',
  'standby',
  'ferias',
  'treinamento_simulador',
  'licenca',
]);

type ConflitoEventoRow = {
  evento1_id: string;
  tipo1: string;
  inicio1: string;
  fim1: string;
  auto1: number | boolean | null;
  evento2_id: string;
  tipo2: string;
  inicio2: string;
  fim2: string;
  auto2: number | boolean | null;
  funcionario_id: string;
  funcionario_nome: string;
};

export function shouldIgnoreSubstitutableEventConflict(conflito: ConflitoEventoRow): boolean {
  const evento1AutoSubstituivel =
    Number(conflito.auto1 ?? 0) === 1 && AUTO_EVENTOS_SUBSTITUIVEIS.has(String(conflito.tipo1));
  const evento2AutoSubstituivel =
    Number(conflito.auto2 ?? 0) === 1 && AUTO_EVENTOS_SUBSTITUIVEIS.has(String(conflito.tipo2));

  return evento1AutoSubstituivel || evento2AutoSubstituivel;
}

// GET /:id/conflitos — verificar conflitos antes de publicar
conflitos.get('/:id/conflitos', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    // Conflitos de eventos: qualquer sobreposição ativa do mesmo tripulante
    // precisa aparecer, inclusive eventos automáticos e folgas que acabam sendo
    // encobertos visualmente no calendário.
    const conflitosEventos = await db
      .prepare(
        `SELECT
           ee1.id as evento1_id, ee1.tipo_evento as tipo1, ee1.data_inicio as inicio1, ee1.data_fim as fim1,
           ee1.gerado_automaticamente as auto1,
           ee2.id as evento2_id, ee2.tipo_evento as tipo2, ee2.data_inicio as inicio2, ee2.data_fim as fim2,
           ee2.gerado_automaticamente as auto2,
           ee1.funcionario_id as funcionario_id,
           f.nome as funcionario_nome
         FROM escala_eventos ee1
         JOIN escala_eventos ee2 ON (
           ee1.funcionario_id = ee2.funcionario_id
           AND ee1.id < ee2.id
           AND ee1.data_inicio <= ee2.data_fim
           AND ee1.data_fim >= ee2.data_inicio
         )
         JOIN escalas_mensais em ON em.id = ee1.escala_id AND em.id = ee2.escala_id
         JOIN funcionarios f ON ee1.funcionario_id = f.id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
         WHERE ee1.escala_id = ? AND ee2.escala_id = ?
           AND em.empresa_id = ? AND em.deleted_at IS NULL
           AND ee1.deleted_at IS NULL AND ee2.deleted_at IS NULL
           AND ee1.status != 'cancelado' AND ee2.status != 'cancelado'
         ORDER BY f.nome, ee1.data_inicio, ee2.data_inicio`,
      )
      .bind(id, id, empresaId)
      .all<ConflitoEventoRow>();

    const conflitosEventosFiltrados = (conflitosEventos.results || []).filter(
      (conflito) => !shouldIgnoreSubstitutableEventConflict(conflito),
    );

    // Restrições de tripulações violadas
    const restricoesVioladas = await db
      .prepare(
        `SELECT
           rt.tipo_restricao, rt.motivo, rt.contrato_referencia,
           fa.nome as funcionario_a, fb.nome as funcionario_b,
           et.data_inicio, et.data_fim
         FROM escala_tripulacoes et
         JOIN restricoes_tripulacao rt ON (
           (rt.funcionario_a_id = et.pic_id AND rt.funcionario_b_id = et.sic_id) OR
           (rt.funcionario_a_id = et.sic_id AND rt.funcionario_b_id = et.pic_id)
         )
         JOIN escalas_mensais em ON em.id = et.escala_id
         JOIN funcionarios fa ON rt.funcionario_a_id = fa.id AND (fa.empresa_id IS NULL OR fa.empresa_id = em.empresa_id)
         JOIN funcionarios fb ON rt.funcionario_b_id = fb.id AND (fb.empresa_id IS NULL OR fb.empresa_id = em.empresa_id)
         WHERE et.escala_id = ?
           AND em.empresa_id = ? AND em.deleted_at IS NULL
           AND et.deleted_at IS NULL
           AND rt.tipo_restricao = 'nao_pode_voar_junto'
           AND rt.ativo = 1
           AND rt.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .all();

    // Conflitos de tripulações: mesmo funcionário em dois slots sobrepostos
    const conflitosTripulacoes = await db
      .prepare(
        `SELECT
           f.id AS funcionario_id,
           f.nome AS funcionario_nome,
           et1.id AS trip1_id, et2.id AS trip2_id,
           et1.data_inicio AS inicio1, et1.data_fim AS fim1,
           et2.data_inicio AS inicio2, et2.data_fim AS fim2,
           CASE WHEN et1.pic_id = f.id THEN 'PIC' ELSE 'SIC' END AS papel1,
           CASE WHEN et2.pic_id = f.id THEN 'PIC' ELSE 'SIC' END AS papel2,
           et1.aeronave AS aeronave1, et2.aeronave AS aeronave2
         FROM escala_tripulacoes et1
         JOIN escala_tripulacoes et2 ON (
           et1.id < et2.id
           AND et1.data_inicio <= et2.data_fim
           AND et1.data_fim >= et2.data_inicio
         )
         JOIN escalas_mensais em ON em.id = et1.escala_id AND em.id = et2.escala_id
         JOIN funcionarios f ON (
           (et1.pic_id = f.id OR et1.sic_id = f.id)
           AND (et2.pic_id = f.id OR et2.sic_id = f.id)
         ) AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
         WHERE et1.escala_id = ? AND et2.escala_id = ?
           AND em.empresa_id = ? AND em.deleted_at IS NULL
           AND et1.deleted_at IS NULL AND et2.deleted_at IS NULL
         ORDER BY f.nome, et1.data_inicio`,
      )
      .bind(id, id, empresaId)
      .all();

    // ── Validações NOP-OPS-038 + PRC-OPS-009 ──
    // Soma de idades > 129-anos e restrições CMA na composição de tripulação
    const violacoesCompliance: Array<{
      tipo: string;
      mensagem: string;
      pic_nome?: string;
      sic_nome?: string;
      detalhes?: Record<string, unknown>;
    }> = [];

    try {
      const tripulacoes = await db
        .prepare(
          `SELECT et.id, et.pic_id, et.sic_id, et.aeronave,
                  fp.nome as pic_nome, fp.nascimento as pic_nasc, fp.funcao as pic_funcao,
                  fs.nome as sic_nome, fs.nascimento as sic_nasc, fs.funcao as sic_funcao
           FROM escala_tripulacoes et
           JOIN escalas_mensais em ON em.id = et.escala_id
           LEFT JOIN funcionarios fp ON et.pic_id = fp.id AND fp.deleted_at IS NULL
           LEFT JOIN funcionarios fs ON et.sic_id = fs.id AND fs.deleted_at IS NULL
           WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL`,
        )
        .bind(id, empresaId)
        .all<{
          id: string;
          pic_id: number;
          sic_id: number | null;
          aeronave: string;
          pic_nome: string;
          sic_nome: string | null;
          pic_nasc: string | null;
          sic_nasc: string | null;
          pic_funcao: string | null;
          sic_funcao: string | null;
        }>();

      const hoje = new Date();
      const calcIdade = (dn: string) => {
        const nascimento = new Date(dn);
        let anos = hoje.getFullYear() - nascimento.getFullYear();
        const m = hoje.getMonth() - nascimento.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) anos--;
        return anos;
      };

      for (const trip of tripulacoes.results || []) {
        if (!trip.sic_id) continue;

        const funcPIC = (trip.pic_funcao || '').toUpperCase();
        const funcSIC = (trip.sic_funcao || '').toUpperCase();
        const isInstrutor = funcPIC.includes('INSTRUTOR') || funcSIC.includes('INSTRUTOR');
        const isExaminador = funcPIC.includes('EXAMINADOR') || funcSIC.includes('EXAMINADOR');

        // Soma de idades
        if (trip.pic_nasc && trip.sic_nasc) {
          const idadePIC = calcIdade(trip.pic_nasc);
          const idadeSIC = calcIdade(trip.sic_nasc);
          const soma = idadePIC + idadeSIC;
          if (soma > 129 && !isInstrutor && !isExaminador) {
            violacoesCompliance.push({
              tipo: 'soma_idades',
              mensagem: `Soma de idades (${idadePIC} + ${idadeSIC} = ${soma}) excede 129 anos — NOP-OPS-038`,
              pic_nome: trip.pic_nome,
              sic_nome: trip.sic_nome || undefined,
              detalhes: { pic_idade: idadePIC, sic_idade: idadeSIC, soma, limite: 129 },
            });
          }
        }
      }

      // Qualificações vencidas na tripulação (aviso não-bloqueante)
      try {
        const tripIds = (tripulacoes.results || []).flatMap((t) =>
          [t.pic_id, t.sic_id].filter(Boolean),
        );
        if (tripIds.length > 0) {
          const placeholders = tripIds.map(() => '?').join(',');
          const qualsVencidas = await db
            .prepare(
              `SELECT DISTINCT
                 f.id as func_id, f.nome as func_nome,
                 qt.nome as qual_nome, qt.codigo as qual_codigo,
                 ${getQualificacoesVencimentoExpr()} as data_vencimento_calc
               FROM qualificacoes_historico qh
               JOIN funcionarios f ON f.id = qh.funcionario_id
               JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
               WHERE qh.funcionario_id IN (${placeholders})
                 AND qh.deleted_at IS NULL
                 AND qh.renovada = 0
                 AND qh.data_conclusao IS NOT NULL
                 AND ${getQualificacoesVencimentoExpr()} < date('now')`,
            )
            .bind(...tripIds)
            .all<{
              func_id: number;
              func_nome: string;
              qual_nome: string;
              qual_codigo: string;
              data_vencimento_calc: string;
            }>();

          for (const q of qualsVencidas.results || []) {
            violacoesCompliance.push({
              tipo: 'qualificacao_vencida',
              mensagem: `${q.func_nome}: qualificação "${q.qual_nome}" (${q.qual_codigo}) venceu em ${q.data_vencimento_calc}`,
              pic_nome: q.func_nome,
              detalhes: {
                qual_codigo: q.qual_codigo,
                data_vencimento: q.data_vencimento_calc,
                funcionario_id: q.func_id,
              },
            });
          }
        }
      } catch {
        /* silencioso */
      }
    } catch (e) {
      console.warn('[CONFLITOS] Erro ao verificar compliance NOP-OPS-038:', e);
    }

    return c.json({
      success: true,
      data: {
        conflitos_eventos: conflitosEventosFiltrados,
        conflitos_tripulacoes: conflitosTripulacoes.results,
        restricoes_violadas: restricoesVioladas.results,
        violacoes_compliance: violacoesCompliance,
        tem_conflitos:
          conflitosEventosFiltrados.length > 0 ||
          (conflitosTripulacoes.results?.length ?? 0) > 0 ||
          (restricoesVioladas.results?.length ?? 0) > 0 ||
          violacoesCompliance.length > 0,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default conflitos;
