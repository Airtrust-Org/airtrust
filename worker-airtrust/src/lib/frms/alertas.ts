/**
 * FRMS — Motor de Alertas
 *
 * Avalia limites e gera alertas com níveis:
 *   AVISO (80%) → ATENCAO (90%) → CRITICO (95%)
 *   VIOLACAO (100%+) apenas para HV_DIARIA
 *
 * Função pura — recebe dados, retorna alertas a serem criados.
 */

import type { LimitesMap, NivelAlerta, TipoLimite, FrmsJornada } from './types';
import type { AcumuloRollingResult } from './calculos';

export interface AlertaGerado {
  tripulante_id: number;
  jornada_id: string | null;
  tipo_limite: TipoLimite;
  nivel: NivelAlerta;
  percentual_atingido: number;
  valor_atual_min: number;
  valor_limite_min: number;
  mensagem: string;
}

interface MotorAlertasInput {
  tripulanteId: number;
  tripulanteNome?: string;
  jornadaId: string | null;
  jornada: Pick<
    FrmsJornada,
    'duracao_jornada_minutos' | 'horas_voo_minutos' | 'status' | 'tripulacao_aumentada'
  > | null;
  acumulo: AcumuloRollingResult;
  limites: LimitesMap;
}

const LABEL_TIPO: Record<TipoLimite, string> = {
  FDP_DIARIO: 'FDP Diário',
  HV_DIARIA: 'HV Diária',
  HV_7D: 'HV 7 Dias',
  HV_MES: 'HV Mês',
  HV_365D: 'HV 365 Dias',
  REPOUSO: 'Repouso Mínimo',
};

/**
 * Executa o motor de alertas e retorna lista de alertas a criar.
 * Não persiste nada — chamado pela camada de serviço que decide o que salvar.
 */
export function processarAlertas(input: MotorAlertasInput): AlertaGerado[] {
  const { tripulanteId, jornadaId, jornada, acumulo, limites } = input;
  const alertas: AlertaGerado[] = [];
  const nome = input.tripulanteNome ?? `Tripulante #${tripulanteId}`;

  // ── FDP DIÁRIO ──
  // Tripulação aumentada (reforçada) extends FDP máximo
  if (jornada && jornada.duracao_jornada_minutos) {
    const fdpMaxEfetivo = jornada.tripulacao_aumentada
      ? limites.FDP_MAXIMO_HORAS + (limites.FATOR_TRIPULACAO_AUM_HORAS ?? 2.0)
      : limites.FDP_MAXIMO_HORAS;
    const fdpLimMin = fdpMaxEfetivo * 60;
    const alertaThresholdMin = fdpLimMin - limites.FDP_ALERTA_RESTANTE_HORAS * 60;
    const duracaoMin = jornada.duracao_jornada_minutos;

    if (duracaoMin >= alertaThresholdMin) {
      const pct = (duracaoMin / fdpLimMin) * 100;
      const nivel = resolverNivel(pct, limites);
      alertas.push({
        tripulante_id: tripulanteId,
        jornada_id: jornadaId,
        tipo_limite: 'FDP_DIARIO',
        nivel,
        percentual_atingido: round2(pct),
        valor_atual_min: duracaoMin,
        valor_limite_min: fdpLimMin,
        mensagem: `${nome}: jornada de ${formatMin(duracaoMin)} (${round2(pct)}% do limite de ${fdpMaxEfetivo}h${jornada.tripulacao_aumentada ? ' — trip. aumentada' : ''})`,
      });
    }
  }

  // ── HV DIÁRIA ──
  // Alerta quando HV atingir 6h (restam 2h para o limite de 8h)
  if (acumulo.hv_dia_min > 0) {
    const hvLimMin = limites.HV_DIARIA_HORAS * 60;
    const alertaThresholdMin = hvLimMin - limites.HV_DIA_ALERTA_RESTANTE_HORAS * 60;

    if (acumulo.hv_dia_min >= alertaThresholdMin) {
      const pct = acumulo.pct_limite_dia;
      const nivel = resolverNivel(pct, limites, true);
      alertas.push({
        tripulante_id: tripulanteId,
        jornada_id: jornadaId,
        tipo_limite: 'HV_DIARIA',
        nivel,
        percentual_atingido: round2(pct),
        valor_atual_min: acumulo.hv_dia_min,
        valor_limite_min: hvLimMin,
        mensagem: `${nome}: HV diária ${formatMin(acumulo.hv_dia_min)} (${round2(pct)}% do limite de ${limites.HV_DIARIA_HORAS}h)`,
      });
    }
  }

  // ── HV 7 DIAS ──
  verificarLimitePercentual(alertas, {
    tripulanteId,
    jornadaId,
    nome,
    limites,
    tipo: 'HV_7D',
    pct: acumulo.pct_limite_7d,
    valorAtualMin: acumulo.hv_7_dias_min,
    valorLimiteMin: limites.HV_7_DIAS_HORAS * 60,
    label: `HV 7 dias: ${formatMin(acumulo.hv_7_dias_min)} de ${limites.HV_7_DIAS_HORAS}h`,
  });

  // ── HV MÊS ──
  verificarLimitePercentual(alertas, {
    tripulanteId,
    jornadaId,
    nome,
    limites,
    tipo: 'HV_MES',
    pct: acumulo.pct_limite_mes_calendario,
    valorAtualMin: acumulo.hv_mes_calendario_min,
    valorLimiteMin: limites.HV_MES_HORAS * 60,
    label: `HV mês: ${formatMin(acumulo.hv_mes_calendario_min)} de ${limites.HV_MES_HORAS}h`,
  });

  // ── HV 365 DIAS ──
  verificarLimitePercentual(alertas, {
    tripulanteId,
    jornadaId,
    nome,
    limites,
    tipo: 'HV_365D',
    pct: acumulo.pct_limite_365d,
    valorAtualMin: acumulo.hv_365_dias_min,
    valorLimiteMin: limites.HV_365_DIAS_HORAS * 60,
    label: `HV 365d: ${formatMin(acumulo.hv_365_dias_min)} de ${limites.HV_365_DIAS_HORAS}h`,
  });

  // ── REPOUSO ──
  if (acumulo.repouso_anterior_min >= 0 && !acumulo.repouso_suficiente) {
    const repousoLimMin = limites.REPOUSO_MINIMO_HORAS * 60;
    const repousoRuimMin = limites.REPOUSO_RUIM_MINUTOS ?? 480;
    const pct =
      repousoLimMin > 0 ? round2((acumulo.repouso_anterior_min / repousoLimMin) * 100) : 0;
    alertas.push({
      tripulante_id: tripulanteId,
      jornada_id: jornadaId,
      tipo_limite: 'REPOUSO',
      nivel: acumulo.repouso_anterior_min < repousoRuimMin ? 'CRITICO' : 'ATENCAO',
      percentual_atingido: pct,
      valor_atual_min: acumulo.repouso_anterior_min,
      valor_limite_min: repousoLimMin,
      mensagem: `${nome}: repouso de ${formatMin(acumulo.repouso_anterior_min)} (mínimo: ${limites.REPOUSO_MINIMO_HORAS}h)`,
    });
  }

  return alertas;
}

/**
 * Determina se um alerta nível CRITICO (95%) bloqueia novo lançamento.
 * VIOLACAO (100%+) NÃO bloqueia — apenas registra flag para auditoria regulatória.
 * Spec: CRITICO bloqueia, VIOLACAO = registro de ocorrência apenas.
 */
export function deveBloquearLancamento(alertas: AlertaGerado[]): boolean {
  return alertas.some((a) => a.nivel === 'CRITICO');
}

// ────────────────────────────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────────────────────────────

function verificarLimitePercentual(
  alertas: AlertaGerado[],
  params: {
    tripulanteId: number;
    jornadaId: string | null;
    nome: string;
    limites: LimitesMap;
    tipo: TipoLimite;
    pct: number;
    valorAtualMin: number;
    valorLimiteMin: number;
    label: string;
  },
): void {
  const {
    tripulanteId,
    jornadaId,
    nome,
    limites,
    tipo,
    pct,
    valorAtualMin,
    valorLimiteMin,
    label,
  } = params;

  if (pct >= limites.ALERTA_AVISO_PCT) {
    const nivel = resolverNivel(pct, limites);
    alertas.push({
      tripulante_id: tripulanteId,
      jornada_id: jornadaId,
      tipo_limite: tipo,
      nivel,
      percentual_atingido: round2(pct),
      valor_atual_min: valorAtualMin,
      valor_limite_min: valorLimiteMin,
      mensagem: `${nome}: ${label} (${round2(pct)}%)`,
    });
  }
}

/** Resolve o nível de alerta baseado no percentual */
function resolverNivel(pct: number, limites: LimitesMap, permiteViolacao = false): NivelAlerta {
  if (permiteViolacao && pct >= limites.ALERTA_VIOLACAO_PCT) return 'VIOLACAO';
  if (pct >= limites.ALERTA_CRITICO_PCT) return 'CRITICO';
  if (pct >= limites.ALERTA_ATENCAO_PCT) return 'ATENCAO';
  return 'AVISO';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}min`;
}
