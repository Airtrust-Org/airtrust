/**
 * FRMS — Fadiga Acumulada Legal (PRC-OPS-012)
 *
 * Consolidates legal/collective work-time limits separately from flight-time limits.
 * Daily PRC-OPS-012 journey factors remain diagnostic and are not labeled as legal work totals.
 *
 * GET /api/frms/fadiga-acumulada?mes=YYYY-MM&tripulante_id=...
 * GET /api/frms/fadiga-acumulada/frota?mes=YYYY-MM
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { calcularEvolucaoFadigaAcumulada } from '../lib/frms/fadiga-acumulada-legal';
import { buildCanonicalOperationalSourceSql } from '../lib/frms/frms-source-policy';
import { loadLegalWorkMonth } from '../lib/frms/legal-work-service';
import { asOperationalLimitesMap, resolveFrmsOperationalContext } from '../lib/frms/parameter-governance';
import { costaDoSolAct2025_2027Applies, regulatoryProfileHasDocumentedAppendix } from '../lib/frms/compliance-policy';

const fadigaAcumulada = new Hono<{ Bindings: Env }>();

fadigaAcumulada.use('*', auth());

type AlertThresholds = { aviso: number; atencao: number; critico: number };
const CANONICAL_JORNADA_SOURCE_SQL = buildCanonicalOperationalSourceSql('j.origem');

interface JornadaDia {
  data: string;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_minutos: number | null;
  horas_voo_minutos: number | null;
  repouso_anterior_min: number | null;
  hora_primeira_decolagem: string | null;
  hora_ultimo_pouso: string | null;
  status: string;
  dia_ciclo_embarcado: number | null;
}

function calcFatoresAgravantes(j: JornadaDia) {
  let fatorJornada = 0;
  let fatorVoo = 0;

  // Jornada — Apresentação antes das 06:30 → +0.2%
  if (j.hora_apresentacao) {
    const [h, m] = j.hora_apresentacao.split(':').map(Number);
    if (h < 6 || (h === 6 && m < 30)) fatorJornada += 0.2;
    // Apresentação ≥ 08:00 → -0.1% (mitigante)
    if (h >= 8) fatorJornada -= 0.1;
  }

  const duracaoMinutos = j.duracao_jornada_minutos ?? 0;
  const duracaoHoras = duracaoMinutos / 60;
  // Jornada > 10h → +0.1%
  if (duracaoHoras > 10) fatorJornada += 0.1;
  // Jornada < 8h → -0.1% (mitigante)
  if (duracaoHoras > 0 && duracaoHoras < 8) fatorJornada -= 0.1;

  // Sem apresentação (dia de folga) → -0.2% (mitigante)
  if (!j.hora_apresentacao && duracaoMinutos === 0) fatorJornada -= 0.2;

  // Repouso > 13h → -0.1% (mitigante)
  if (j.repouso_anterior_min !== null && j.repouso_anterior_min > 13 * 60) {
    fatorJornada -= 0.1;
  }

  const horasVoo = (j.horas_voo_minutos ?? 0) / 60;
  // Horas de voo ≥ 6h → +0.1%
  if (horasVoo >= 6) fatorVoo += 0.1;
  // Até 4h de voo → -0.1% (mitigante)
  if (horasVoo > 0 && horasVoo <= 4) fatorVoo -= 0.1;
  // 0h de voo → -0.2% (mitigante)
  if (horasVoo === 0) fatorVoo -= 0.2;

  // Decolagem noturna (antes das 06:00) → +0.1%
  if (j.hora_primeira_decolagem) {
    const [h] = j.hora_primeira_decolagem.split(':').map(Number);
    if (h < 6) fatorVoo += 0.1;
  }

  // Pouso noturno (≥18:00) → +0.1%
  if (j.hora_ultimo_pouso) {
    const [h] = j.hora_ultimo_pouso.split(':').map(Number);
    if (h >= 18) fatorVoo += 0.1;
  }

  return { fatorJornada, fatorVoo };
}

function getAlertLevel(
  percentual: number,
  thresholds: AlertThresholds,
): 'verde' | 'amarelo' | 'vermelho' | 'normal' {
  if (percentual >= thresholds.critico) return 'vermelho';
  if (percentual >= thresholds.atencao) return 'amarelo';
  if (percentual >= thresholds.aviso) return 'verde';
  return 'normal';
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

async function resolveRouteContext(db: D1Database, empresaId: number, month: string) {
  const context = await resolveFrmsOperationalContext(db, {
    empresaId,
    referenceAt: lastDayOfMonth(month),
  });
  const limits = asOperationalLimitesMap(context.parameters, context.cyclePolicyApproved);
  const rbacBcApplicable = regulatoryProfileHasDocumentedAppendix(
    { limitsJson: context.regulatoryLimitsJson },
    'B',
    'C',
  );
  const costaDoSolActApplicable = costaDoSolAct2025_2027Applies({
    empresaId,
    limitsJson: context.regulatoryLimitsJson,
  });
  return {
    context,
    limits,
    rbacBcApplicable,
    costaDoSolActApplicable,
    thresholds: {
      aviso: limits.ALERTA_AVISO_PCT,
      atencao: limits.ALERTA_ATENCAO_PCT,
      critico: limits.ALERTA_CRITICO_PCT,
    } satisfies AlertThresholds,
  };
}

// GET /api/frms/fadiga-acumulada?mes=YYYY-MM&tripulante_id=...
fadigaAcumulada.get('/fadiga-acumulada', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const mes = c.req.query('mes') || ''; // YYYY-MM
  const tripulanteId = c.req.query('tripulante_id') || '';

  if (!mes || !tripulanteId) {
    return c.json({ success: false, error: 'Parâmetros obrigatórios: mes, tripulante_id' }, 400);
  }

  try {
    const { context, limits, thresholds, rbacBcApplicable, costaDoSolActApplicable } = await resolveRouteContext(db, empresaId, mes);
    const legalRows = await loadLegalWorkMonth(db, empresaId, mes);
    const legal = legalRows.find((row) => row.tripulante_id === Number(tripulanteId)) ?? null;

    // Detalhe diário da jornada de voo permanece para auditoria operacional; não é o acumulado legal de trabalho.
    const jornadas = await db
      .prepare(
        `SELECT
           j.data,
           j.hora_apresentacao,
           j.hora_termino,
           j.duracao_jornada_minutos AS duracao_jornada_minutos,
           j.horas_voo_minutos AS horas_voo_minutos,
           ar.repouso_anterior_min,
           j.hora_primeira_decolagem,
           j.hora_ultimo_pouso,
           j.status,
           NULL AS dia_ciclo_embarcado
         FROM frms_jornada j
         JOIN funcionarios f ON CAST(j.tripulante_id AS INTEGER) = f.id AND f.deleted_at IS NULL
         LEFT JOIN frms_acumulo_rolling ar
           ON ar.tripulante_id = j.tripulante_id
          AND ar.data_referencia = j.data
          AND ar.deleted_at IS NULL
         WHERE j.tripulante_id = ?
           AND j.data LIKE ?
           AND j.deleted_at IS NULL
           AND ${CANONICAL_JORNADA_SOURCE_SQL}
           AND (? IS NULL OR COALESCE(j.empresa_id, f.empresa_id) = ?)
         ORDER BY j.data ASC`,
      )
      .bind(tripulanteId, `${mes}-%`, empresaId ?? null, empresaId ?? null)
      .all<JornadaDia>();

    const dias = jornadas.results || [];

    const evolucao = calcularEvolucaoFadigaAcumulada(dias, {
      fdpDiarioHoras: limits.FDP_MAXIMO_HORAS,
      hvDiariaHoras: limits.HV_DIARIA_HORAS,
      hvMensalHoras: limits.HV_MES_HORAS,
    }).map((linha, idx) => {
      const j = dias[idx];
      const { fatorJornada, fatorVoo } = calcFatoresAgravantes(j);
      const trabalhoAteDataMin = legal
        ? Object.entries(legal.trabalho_por_data_min)
            .filter(([date]) => date <= linha.data)
            .reduce((sum, [, minutes]) => sum + Math.max(0, Number(minutes) || 0), 0)
        : 0;
      const trabalhoIncompleteThroughDate = legal
        ? Object.keys(legal.incomplete_reasons_by_date).some((date) => date <= linha.data)
        : true;
      const pctTrabalhoLegal = (trabalhoAteDataMin / (176 * 60)) * 100;

      return {
        ...linha,
        trabalho_acumulado_horas: +(trabalhoAteDataMin / 60).toFixed(1),
        pct_trabalho_mes_legal: trabalhoIncompleteThroughDate ? null : +pctTrabalhoLegal.toFixed(3),
        trabalho_status_dia: trabalhoIncompleteThroughDate ? 'UNKNOWN' : 'COMPLETE',
        alerta_trabalho_mes: trabalhoIncompleteThroughDate
          ? 'incompleto'
          : getAlertLevel(pctTrabalhoLegal, thresholds),
        dia: idx + 1,
        fator_jornada_dia: +fatorJornada.toFixed(2),
        fator_voo_dia: +fatorVoo.toFixed(2),
        alerta_jornada: getAlertLevel(linha.pct_jornada_diaria, thresholds),
        alerta_voo: getAlertLevel(linha.pct_voo_diaria, thresholds),
        alerta_jornada_mes: getAlertLevel(linha.pct_jornada_mes, thresholds),
        alerta_voo_mes: getAlertLevel(linha.pct_voo_mes, thresholds),
      };
    });

    const ultimo = evolucao[evolucao.length - 1];
    const trabalhoMesMin = legal?.trabalho_mes_min ?? null;
    const trabalhoMesConhecidoMin = legal?.trabalho_mes_conhecido_min ?? 0;
    const pctTrabalhoMes = trabalhoMesMin == null ? null : (trabalhoMesMin / (176 * 60)) * 100;
    const pctTrabalho7d = !rbacBcApplicable || legal?.trabalho_7d_max_min == null ? null : (legal.trabalho_7d_max_min / (60 * 60)) * 100;
    const pctTrabalho14d = !rbacBcApplicable || legal?.trabalho_14d_max_min == null ? null : (legal.trabalho_14d_max_min / (100 * 60)) * 100;
    const pctVooLegal = legal ? (legal.voo_mes_min / (90 * 60)) * 100 : 0;
    const alertaGeral = getAlertLevel(Math.max(pctTrabalhoMes ?? 0, pctVooLegal), thresholds);

    return c.json({
      success: true,
      data: {
        tripulante_id: tripulanteId,
        mes,
        limites: {
          trabalho_mensal_horas: 176,
          trabalho_7d_horas: rbacBcApplicable ? 60 : null,
          trabalho_14d_horas: rbacBcApplicable ? 100 : null,
          voo_mensal_horas: 90,
          voo_diaria_horas: 8,
          voo_mensal_operacional_horas: limits.HV_MES_HORAS,
          voo_diaria_operacional_horas: limits.HV_DIARIA_HORAS,
          jornada_horas: 176, // alias legado: agora representa trabalho total, não só frms_jornada
          voo_horas: 90,
          fontes: {
            trabalho: [
              'Lei 13.475/2017 art. 41',
              ...(costaDoSolActApplicable ? ['ACT Costa do Sol 2025/2027 cláusulas 8ª/9ª'] : []),
              ...(rbacBcApplicable ? ['RBAC 117 EMD 01 B117.27/C117.27'] : []),
            ],
            voo_mes: ['Lei 13.475/2017 art. 33 IV'],
            voo_dia: ['Lei 13.475/2017 art. 32 IV'],
            limites_operacionais: `Revisão governada ${context.configRevisionId}`,
          },
          profile_code: context.profileCode,
          config_revision_id: context.configRevisionId,
          rbac_bc_documentado: rbacBcApplicable,
          aplicabilidade_rbac_bc: rbacBcApplicable
            ? 'DOCUMENTADA_NO_PERFIL'
            : 'NAO_COMPROVADA_NO_PERFIL',
        },
        thresholds: {
          verde: thresholds.aviso,
          amarelo: thresholds.atencao,
          vermelho: thresholds.critico,
        },
        resumo: ultimo || legal
          ? {
              trabalho_status: legal?.trabalho_status ?? 'UNKNOWN',
              trabalho_horas: +(trabalhoMesConhecidoMin / 60).toFixed(1),
              trabalho_horas_confirmadas: trabalhoMesMin == null ? null : +(trabalhoMesMin / 60).toFixed(1),
              pct_trabalho_mes: pctTrabalhoMes == null ? null : +pctTrabalhoMes.toFixed(3),
              pct_trabalho_7d_max: pctTrabalho7d == null ? null : +pctTrabalho7d.toFixed(3),
              pct_trabalho_14d_max: pctTrabalho14d == null ? null : +pctTrabalho14d.toFixed(3),
              trabalho_7d_max_horas: legal?.trabalho_7d_max_min == null ? null : +(legal.trabalho_7d_max_min / 60).toFixed(1),
              trabalho_14d_max_horas: legal?.trabalho_14d_max_min == null ? null : +(legal.trabalho_14d_max_min / 60).toFixed(1),
              trabalho_incomplete_reasons: legal?.incomplete_reasons ?? ['LEGAL_WORK_DATA_UNAVAILABLE'],
              // Legacy generic fields kept only for compatibility with older consumers.
              jornada_horas: +(trabalhoMesConhecidoMin / 60).toFixed(1),
              voo_horas: +(Number(legal?.voo_mes_min ?? 0) / 60).toFixed(1),
              pct_jornada: pctTrabalhoMes == null ? null : +pctTrabalhoMes.toFixed(3),
              pct_voo: +pctVooLegal.toFixed(3),
              jornada_acumulada_horas: ultimo?.jornada_acumulada_horas,
              voo_acumulado_horas: ultimo?.voo_acumulado_horas,
              jornada_dia_horas: ultimo?.jornada_horas,
              voo_dia_horas: ultimo?.voo_horas,
              jornada_mes_horas: ultimo?.jornada_acumulada_horas,
              voo_mes_horas: ultimo?.voo_acumulado_horas,
              pct_jornada_dia: ultimo?.pct_jornada_diaria,
              pct_voo_dia: ultimo?.pct_voo_diaria,
              pct_jornada_mes: ultimo?.pct_jornada_mes,
              pct_voo_mes: ultimo?.pct_voo_mes,
              alerta: alertaGeral,
              integridade_status: ultimo?.integridade_status,
              integridade_codigo: ultimo?.integridade_codigo,
              integridade_codigos: ultimo?.integridade_codigos,
              integridade_mensagem: ultimo?.integridade_mensagem,
              valores_brutos: ultimo?.valores_brutos,
            }
          : null,
        evolucao,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/frms/fadiga-acumulada/frota?mes=YYYY-MM
// Panorama legal: trabalho total (não apenas jornada de voo) + horas de voo.
fadigaAcumulada.get('/fadiga-acumulada/frota', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const mes = c.req.query('mes') || '';

  if (!mes) {
    return c.json({ success: false, error: 'Parâmetro obrigatório: mes (YYYY-MM)' }, 400);
  }

  try {
    const { context, limits, thresholds, rbacBcApplicable, costaDoSolActApplicable } = await resolveRouteContext(db, empresaId, mes);
    const rows = await loadLegalWorkMonth(db, empresaId, mes);
    const frota = rows.map((row) => {
      const pctTrabalho = row.trabalho_mes_min == null
        ? null
        : (row.trabalho_mes_min / (176 * 60)) * 100;
      const pctTrabalho7d = !rbacBcApplicable || row.trabalho_7d_max_min == null
        ? null
        : (row.trabalho_7d_max_min / (60 * 60)) * 100;
      const pctTrabalho14d = !rbacBcApplicable || row.trabalho_14d_max_min == null
        ? null
        : (row.trabalho_14d_max_min / (100 * 60)) * 100;
      const pctVoo = (row.voo_mes_min / (90 * 60)) * 100;
      const maxKnownPct = Math.max(pctTrabalho ?? 0, pctTrabalho7d ?? 0, pctTrabalho14d ?? 0, pctVoo);
      const knownAlert = getAlertLevel(maxKnownPct, thresholds);
      const alerta = knownAlert !== 'normal'
        ? knownAlert
        : row.trabalho_status === 'UNKNOWN'
          ? 'incompleto'
          : 'normal';

      return {
        tripulante_id: String(row.tripulante_id),
        nome: row.guerra || row.nome,
        funcao: row.funcao,
        trabalho_status: row.trabalho_status,
        trabalho_horas: +(row.trabalho_mes_conhecido_min / 60).toFixed(1),
        trabalho_horas_confirmadas: row.trabalho_mes_min == null ? null : +(row.trabalho_mes_min / 60).toFixed(1),
        pct_trabalho: pctTrabalho == null ? null : +pctTrabalho.toFixed(1),
        trabalho_7d_max_horas: !rbacBcApplicable || row.trabalho_7d_max_min == null ? null : +(row.trabalho_7d_max_min / 60).toFixed(1),
        trabalho_14d_max_horas: !rbacBcApplicable || row.trabalho_14d_max_min == null ? null : +(row.trabalho_14d_max_min / 60).toFixed(1),
        pct_trabalho_7d_max: pctTrabalho7d == null ? null : +pctTrabalho7d.toFixed(1),
        pct_trabalho_14d_max: pctTrabalho14d == null ? null : +pctTrabalho14d.toFixed(1),
        voo_horas: +(row.voo_mes_min / 60).toFixed(1),
        pct_voo: +pctVoo.toFixed(1),
        jornada_registrada_horas: +(row.jornada_registrada_mes_min / 60).toFixed(1),
        dias_jornada: row.dias_com_jornada,
        dia_ciclo: null,
        incomplete_reasons: row.incomplete_reasons,
        // aliases legados: jornada_* agora aponta para o trabalho legal total conhecido.
        jornada_horas: +(row.trabalho_mes_conhecido_min / 60).toFixed(1),
        pct_jornada: pctTrabalho == null ? null : +pctTrabalho.toFixed(1),
        alerta,
        em_alerta: maxKnownPct >= thresholds.aviso,
        violacao: maxKnownPct > 100,
      };
    });

    return c.json({
      success: true,
      data: {
        mes,
        limites: {
          trabalho_mensal_horas: 176,
          trabalho_7d_horas: rbacBcApplicable ? 60 : null,
          trabalho_14d_horas: rbacBcApplicable ? 100 : null,
          voo_horas: 90,
          voo_diaria_horas: 8,
          voo_horas_operacional: limits.HV_MES_HORAS,
          voo_diaria_horas_operacional: limits.HV_DIARIA_HORAS,
          jornada_horas: 176,
          profile_code: context.profileCode,
          config_revision_id: context.configRevisionId,
          rbac_bc_documentado: rbacBcApplicable,
          aplicabilidade_rbac_bc: rbacBcApplicable
            ? 'DOCUMENTADA_NO_PERFIL'
            : 'NAO_COMPROVADA_NO_PERFIL',
        },
        thresholds: {
          verde: thresholds.aviso,
          amarelo: thresholds.atencao,
          vermelho: thresholds.critico,
        },
        frota,
        resumo: {
          total_tripulantes: frota.length,
          em_alerta: frota.filter((row) => row.em_alerta).length,
          criticos: frota.filter((row) => row.alerta === 'vermelho').length,
          incompletos: frota.filter((row) => row.trabalho_status === 'UNKNOWN').length,
          violacoes: frota.filter((row) => row.violacao).length,
        },
      },
    });
  } catch (e) {
    console.error('[FRMS] fadiga acumulada/frota:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/frms/fadiga-acumulada/projecao?mes=YYYY-MM&tripulante_id=...
// Projeção usa trabalho legal agregado; dados incompletos não geram falsa precisão.
fadigaAcumulada.get('/fadiga-acumulada/projecao', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const mes = c.req.query('mes') || '';
  const tripulanteId = Number(c.req.query('tripulante_id') || 0);

  if (!mes || !Number.isInteger(tripulanteId) || tripulanteId <= 0) {
    return c.json({ success: false, error: 'Parâmetros obrigatórios: mes, tripulante_id' }, 400);
  }

  try {
    const { limits } = await resolveRouteContext(db, empresaId, mes);
    const rows = await loadLegalWorkMonth(db, empresaId, mes);
    const row = rows.find((item) => item.tripulante_id === tripulanteId);
    if (!row) {
      return c.json({ success: true, data: { projecao_disponivel: false, motivo: 'Sem trabalho registrado no mês' } });
    }
    if (row.trabalho_status !== 'COMPLETE' || row.trabalho_mes_min == null) {
      return c.json({
        success: true,
        data: {
          projecao_disponivel: false,
          motivo: 'Dados de trabalho incompletos; projeção legal bloqueada para evitar falsa precisão.',
          trabalho_horas_conhecidas: +(row.trabalho_mes_conhecido_min / 60).toFixed(1),
          incomplete_reasons: row.incomplete_reasons,
        },
      });
    }

    const [year, monthNumber] = mes.split('-').map(Number);
    const diasNoMes = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const now = new Date();
    const localDay = now.getFullYear() === year && now.getMonth() + 1 === monthNumber ? now.getDate() : diasNoMes;
    const diasRestantes = Math.max(0, diasNoMes - localDay);
    const diasComTrabalho = Object.values(row.trabalho_por_data_min).filter((min) => Number(min) > 0).length;
    const trabalhoHoras = row.trabalho_mes_min / 60;
    const vooHoras = row.voo_mes_min / 60;
    const trabalhoRestanteH = Math.max(0, 176 - trabalhoHoras);
    const vooRestanteH = Math.max(0, limits.HV_MES_HORAS - vooHoras);
    const mediaTrabalhoDia = diasComTrabalho > 0 ? trabalhoHoras / diasComTrabalho : 0;
    const mediaVooDia = diasComTrabalho > 0 ? vooHoras / diasComTrabalho : 0;
    const diasAteTrabalho = mediaTrabalhoDia > 0 ? Math.floor(trabalhoRestanteH / mediaTrabalhoDia) : null;
    const diasAteVoo = mediaVooDia > 0 ? Math.floor(vooRestanteH / mediaVooDia) : null;

    return c.json({
      success: true,
      data: {
        projecao_disponivel: true,
        ativa_a_partir_dia_12: localDay >= 12,
        dia_atual: localDay,
        dias_no_mes: diasNoMes,
        dias_restantes: diasRestantes,
        acumulado: {
          trabalho_horas: +trabalhoHoras.toFixed(1),
          voo_horas: +vooHoras.toFixed(1),
        },
        restante: {
          trabalho_horas: +trabalhoRestanteH.toFixed(1),
          voo_horas: +vooRestanteH.toFixed(1),
        },
        media_diaria: {
          trabalho_horas: +mediaTrabalhoDia.toFixed(1),
          voo_horas: +mediaVooDia.toFixed(1),
        },
        projecao: {
          dias_ate_limite_trabalho: diasAteTrabalho,
          dias_ate_limite_voo: diasAteVoo,
          risco_estourar_mes:
            (diasAteTrabalho != null && diasAteTrabalho < diasRestantes) ||
            (diasAteVoo != null && diasAteVoo < diasRestantes),
        },
      },
    });
  } catch (e) {
    console.error('[FRMS] fadiga acumulada/projecao:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default fadigaAcumulada;
