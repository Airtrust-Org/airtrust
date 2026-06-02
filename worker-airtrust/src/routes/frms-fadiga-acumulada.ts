/**
 * FRMS — Fadiga Acumulada Legal (PRC-OPS-012)
 *
 * Calculates accumulated fatigue as % of legal limits (176h jornada / 90h voo)
 * with aggravating/mitigating factors per PRC-OPS-012.
 *
 * GET /api/frms/fadiga-acumulada?mes=YYYY-MM&tripulante_id=...
 * GET /api/frms/fadiga-acumulada/frota?mes=YYYY-MM
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';

const fadigaAcumulada = new Hono<{ Bindings: Env }>();

fadigaAcumulada.use('*', auth());

// PRC-OPS-012 limits
const LIMITE_JORNADA_MES = 176; // hours
const LIMITE_VOO_MES = 90; // hours

// Thresholds
const THRESHOLD_VERDE = 80;
const THRESHOLD_AMARELO = 90;
const THRESHOLD_VERMELHO = 95;

interface JornadaDia {
  data: string;
  hora_apresentacao: string | null;
  hora_encerramento: string | null;
  duracao_minutos: number;
  horas_voo_minutos: number;
  repouso_anterior_minutos: number | null;
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

  const duracaoHoras = j.duracao_minutos / 60;
  // Jornada > 10h → +0.1%
  if (duracaoHoras > 10) fatorJornada += 0.1;
  // Jornada < 8h → -0.1% (mitigante)
  if (duracaoHoras > 0 && duracaoHoras < 8) fatorJornada -= 0.1;

  // Sem apresentação (dia de folga) → -0.2% (mitigante)
  if (!j.hora_apresentacao && j.duracao_minutos === 0) fatorJornada -= 0.2;

  // Repouso > 13h → -0.1% (mitigante)
  if (j.repouso_anterior_minutos !== null && j.repouso_anterior_minutos > 13 * 60) {
    fatorJornada -= 0.1;
  }

  const horasVoo = j.horas_voo_minutos / 60;
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

function getAlertLevel(percentual: number): 'verde' | 'amarelo' | 'vermelho' | 'normal' {
  if (percentual >= THRESHOLD_VERMELHO) return 'vermelho';
  if (percentual >= THRESHOLD_AMARELO) return 'amarelo';
  if (percentual >= THRESHOLD_VERDE) return 'verde';
  return 'normal';
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
    // Fetch all jornadas for this crew member in the month
    const jornadas = await db
      .prepare(
        `SELECT
           j.data,
           j.hora_apresentacao,
           j.hora_encerramento,
           COALESCE(j.duracao_minutos, 0) AS duracao_minutos,
           COALESCE(j.horas_voo_minutos, 0) AS horas_voo_minutos,
           j.repouso_anterior_minutos,
           j.hora_primeira_decolagem,
           j.hora_ultimo_pouso,
           j.status,
           j.dia_ciclo_embarcado
         FROM frms_jornada j
         WHERE j.tripulante_id = ?
           AND j.data LIKE ?
           AND j.deleted_at IS NULL
         ORDER BY j.data ASC`,
      )
      .bind(tripulanteId, `${mes}-%`)
      .all<JornadaDia>();

    const dias = jornadas.results || [];

    // Calculate daily accumulated percentages
    let acumuladoJornadaMin = 0;
    let acumuladoVooMin = 0;
    let fatoresJornadaAcumulados = 0;
    let fatoresVooAcumulados = 0;

    const evolucao = dias.map((j, idx) => {
      acumuladoJornadaMin += j.duracao_minutos;
      acumuladoVooMin += j.horas_voo_minutos;

      const { fatorJornada, fatorVoo } = calcFatoresAgravantes(j);
      fatoresJornadaAcumulados += fatorJornada;
      fatoresVooAcumulados += fatorVoo;

      const pctJornada = Math.min(
        (acumuladoJornadaMin / 60 / LIMITE_JORNADA_MES) * 100 + fatoresJornadaAcumulados,
        100,
      );
      const pctVoo = Math.min(
        (acumuladoVooMin / 60 / LIMITE_VOO_MES) * 100 + fatoresVooAcumulados,
        100,
      );

      return {
        dia: idx + 1,
        data: j.data,
        dia_ciclo: j.dia_ciclo_embarcado,
        jornada_horas: +(acumuladoJornadaMin / 60).toFixed(1),
        voo_horas: +(acumuladoVooMin / 60).toFixed(1),
        pct_jornada: +pctJornada.toFixed(1),
        pct_voo: +pctVoo.toFixed(1),
        fator_jornada_dia: +fatorJornada.toFixed(2),
        fator_voo_dia: +fatorVoo.toFixed(2),
        alerta_jornada: getAlertLevel(pctJornada),
        alerta_voo: getAlertLevel(pctVoo),
      };
    });

    const ultimo = evolucao[evolucao.length - 1];
    const alertaGeral = ultimo
      ? getAlertLevel(Math.max(ultimo.pct_jornada, ultimo.pct_voo))
      : 'normal';

    return c.json({
      success: true,
      data: {
        tripulante_id: tripulanteId,
        mes,
        limites: { jornada_horas: LIMITE_JORNADA_MES, voo_horas: LIMITE_VOO_MES },
        thresholds: {
          verde: THRESHOLD_VERDE,
          amarelo: THRESHOLD_AMARELO,
          vermelho: THRESHOLD_VERMELHO,
        },
        resumo: ultimo
          ? {
              jornada_horas: ultimo.jornada_horas,
              voo_horas: ultimo.voo_horas,
              pct_jornada: ultimo.pct_jornada,
              pct_voo: ultimo.pct_voo,
              alerta: alertaGeral,
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
// Panorama de fadiga acumulada de toda a frota
fadigaAcumulada.get('/fadiga-acumulada/frota', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const mes = c.req.query('mes') || '';

  if (!mes) {
    return c.json({ success: false, error: 'Parâmetro obrigatório: mes (YYYY-MM)' }, 400);
  }

  try {
    // Get all active crew members with jornadas this month
    const tripulantes = await db
      .prepare(
        `SELECT DISTINCT j.tripulante_id, f.nome, f.guerra, f.funcao,
                COALESCE(SUM(j.duracao_minutos), 0) AS total_jornada_min,
                COALESCE(SUM(j.horas_voo_minutos), 0) AS total_voo_min,
                COUNT(*) AS dias_jornada,
                MAX(j.dia_ciclo_embarcado) AS max_dia_ciclo
         FROM frms_jornada j
         JOIN funcionarios f ON CAST(j.tripulante_id AS INTEGER) = f.id AND f.deleted_at IS NULL
         WHERE j.data LIKE ?
           AND j.deleted_at IS NULL
           AND (f.empresa_id IS NULL OR f.empresa_id = ?)
         GROUP BY j.tripulante_id
         ORDER BY total_jornada_min DESC`,
      )
      .bind(`${mes}-%`, empresaId)
      .all<{
        tripulante_id: string;
        nome: string;
        guerra: string | null;
        funcao: string | null;
        total_jornada_min: number;
        total_voo_min: number;
        dias_jornada: number;
        max_dia_ciclo: number | null;
      }>();

    const frota = (tripulantes.results || []).map((t) => {
      const pctJornada = (t.total_jornada_min / 60 / LIMITE_JORNADA_MES) * 100;
      const pctVoo = (t.total_voo_min / 60 / LIMITE_VOO_MES) * 100;
      const alertaGeral = getAlertLevel(Math.max(pctJornada, pctVoo));

      return {
        tripulante_id: t.tripulante_id,
        nome: t.guerra || t.nome,
        funcao: t.funcao,
        jornada_horas: +(t.total_jornada_min / 60).toFixed(1),
        voo_horas: +(t.total_voo_min / 60).toFixed(1),
        pct_jornada: +pctJornada.toFixed(1),
        pct_voo: +pctVoo.toFixed(1),
        dias_jornada: t.dias_jornada,
        dia_ciclo: t.max_dia_ciclo,
        alerta: alertaGeral,
        em_alerta: pctJornada >= THRESHOLD_VERDE || pctVoo >= THRESHOLD_VERDE,
      };
    });

    return c.json({
      success: true,
      data: {
        mes,
        limites: { jornada_horas: LIMITE_JORNADA_MES, voo_horas: LIMITE_VOO_MES },
        thresholds: {
          verde: THRESHOLD_VERDE,
          amarelo: THRESHOLD_AMARELO,
          vermelho: THRESHOLD_VERMELHO,
        },
        frota,
        resumo: {
          total_tripulantes: frota.length,
          em_alerta: frota.filter((t) => t.em_alerta).length,
          criticos: frota.filter((t) => t.alerta === 'vermelho').length,
        },
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/frms/fadiga-acumulada/projecao?mes=YYYY-MM&tripulante_id=...
// Projeção do 12° dia: horas restantes no mês (PRC-OPS-012 §5.2)
fadigaAcumulada.get('/fadiga-acumulada/projecao', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const mes = c.req.query('mes') || '';
  const tripulanteId = c.req.query('tripulante_id') || '';

  if (!mes || !tripulanteId) {
    return c.json({ success: false, error: 'Parâmetros obrigatórios: mes, tripulante_id' }, 400);
  }

  try {
    const totais = await db
      .prepare(
        `SELECT
           COALESCE(SUM(duracao_minutos), 0) AS total_jornada_min,
           COALESCE(SUM(horas_voo_minutos), 0) AS total_voo_min,
           COUNT(*) AS dias_trabalhados,
           MAX(dia_ciclo_embarcado) AS dia_ciclo
         FROM frms_jornada
         WHERE tripulante_id = ? AND data LIKE ? AND deleted_at IS NULL`,
      )
      .bind(tripulanteId, `${mes}-%`)
      .first<{
        total_jornada_min: number;
        total_voo_min: number;
        dias_trabalhados: number;
        dia_ciclo: number | null;
      }>();

    if (!totais || totais.dias_trabalhados === 0) {
      return c.json({
        success: true,
        data: { projecao_disponivel: false, motivo: 'Sem jornadas no mês' },
      });
    }

    // Dias restantes no mês
    const [year, month] = mes.split('-').map(Number);
    const diasNoMes = new Date(year, month, 0).getDate();
    const hoje = new Date();
    const diaAtual =
      hoje.getFullYear() === year && hoje.getMonth() + 1 === month ? hoje.getDate() : diasNoMes;

    const diasRestantes = diasNoMes - diaAtual;

    // Horas restantes
    const jornadaRestanteH = Math.max(0, LIMITE_JORNADA_MES - totais.total_jornada_min / 60);
    const vooRestanteH = Math.max(0, LIMITE_VOO_MES - totais.total_voo_min / 60);

    // Média diária
    const mediaJornadaDia = totais.total_jornada_min / 60 / totais.dias_trabalhados;
    const mediaVooDia = totais.total_voo_min / 60 / totais.dias_trabalhados;

    // Projeção: se mantiver ritmo atual, quantos dias até esgotar
    const diasAteEstourarJornada =
      mediaJornadaDia > 0 ? Math.floor(jornadaRestanteH / mediaJornadaDia) : Infinity;
    const diasAteEstourarVoo = mediaVooDia > 0 ? Math.floor(vooRestanteH / mediaVooDia) : Infinity;

    const diaCiclo = totais.dia_ciclo || 0;
    const projecaoAtiva = diaCiclo >= 12 || diaAtual >= 12;

    return c.json({
      success: true,
      data: {
        projecao_disponivel: true,
        ativa_a_partir_dia_12: projecaoAtiva,
        dia_atual: diaAtual,
        dia_ciclo: diaCiclo,
        dias_no_mes: diasNoMes,
        dias_restantes: diasRestantes,
        acumulado: {
          jornada_horas: +(totais.total_jornada_min / 60).toFixed(1),
          voo_horas: +(totais.total_voo_min / 60).toFixed(1),
        },
        restante: {
          jornada_horas: +jornadaRestanteH.toFixed(1),
          voo_horas: +vooRestanteH.toFixed(1),
        },
        media_diaria: {
          jornada_horas: +mediaJornadaDia.toFixed(1),
          voo_horas: +mediaVooDia.toFixed(1),
        },
        projecao: {
          dias_ate_limite_jornada:
            diasAteEstourarJornada === Infinity ? null : diasAteEstourarJornada,
          dias_ate_limite_voo: diasAteEstourarVoo === Infinity ? null : diasAteEstourarVoo,
          risco_estourar_mes:
            diasAteEstourarJornada < diasRestantes || diasAteEstourarVoo < diasRestantes,
        },
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default fadigaAcumulada;
