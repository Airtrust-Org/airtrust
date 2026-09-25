export interface FrmsDayCheckinRow {
  id: string;
  wake_time: string | null;
  jornada_inicio_prevista: string | null;
  horas_sono: number | null;
}

export interface FrmsTraceWindowWorstLike {
  available: boolean;
  worstDay: string | null;
  worstEffectivenessPct: number | null;
}

function normalizeClock(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hour, minute] = text.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return text;
}

export function maskFrmsEffectivenessRead<T extends Record<string, unknown>>(
  row: T,
  available: boolean,
): T {
  if (available) return row;
  return {
    ...row,
    effectiveness_pct: null,
    effectiveness_nivel: null,
    effectiveness_componentes_json: null,
    fator_basica_pct: null,
    tempo_abaixo_limiar_min: null,
    hora_despertar_estimada: null,
    hora_inicio_sono_estimado: null,
    duracao_sono_efetiva_min: null,
  };
}

export function buildFrmsDayCheckinExplanationState(params: {
  checkinRow: FrmsDayCheckinRow | null;
  row: Record<string, unknown>;
  worst7d: FrmsTraceWindowWorstLike;
  worst28d: FrmsTraceWindowWorstLike;
}) {
  const presentation = normalizeClock(params.checkinRow?.jornada_inicio_prevista);
  const wake = normalizeClock(params.checkinRow?.wake_time);
  const sleepHours = Number(params.checkinRow?.horas_sono);
  const complete =
    Boolean(params.checkinRow?.id) &&
    Boolean(presentation) &&
    Boolean(wake) &&
    Number.isFinite(sleepHours) &&
    sleepHours > 0 &&
    sleepHours <= 24;

  const limitations: string[] = [];
  if (!params.checkinRow) {
    limitations.push(
      'Sem check-in diário para a data selecionada; a efetividade fica indisponível até o check-in.',
    );
  } else if (!complete) {
    limitations.push(
      'Check-in diário incompleto; apresentação, despertar e sono/repouso absoluto são obrigatórios para calcular a efetividade.',
    );
  }
  if (!params.row.hora_apresentacao) {
    limitations.push(
      'Sem hora de apresentação na jornada; minutos acordado antes da apresentação não disponíveis.',
    );
  }
  if (!params.worst7d.available) limitations.push('Janela de 7 dias indisponível para determinar pior dia.');
  if (!params.worst28d.available) limitations.push('Janela de 28 dias indisponível para determinar pior dia.');
  if (Number(params.row.processado_com_bug ?? 0) === 1) {
    limitations.push('Registro marcado como legado pré-C2; considerar reprocessamento histórico em fase separada.');
  }

  const rowForExplanation: Record<string, unknown> = complete
    ? {
        ...params.row,
        hora_apresentacao: presentation,
        hora_acordou: wake,
        fonte_sono: 'INFORMADO',
      }
    : {
        ...params.row,
        hora_apresentacao: null,
        hora_acordou: null,
        fonte_sono: null,
        effectiveness_pct: null,
        effectiveness_nivel: null,
        effectiveness_componentes_json: null,
        fator_basica_pct: null,
        tempo_abaixo_limiar_min: null,
        hora_despertar_estimada: null,
        hora_inicio_sono_estimado: null,
        duracao_sono_efetiva_min: null,
      };

  const unavailableWindow: FrmsTraceWindowWorstLike = {
    available: false,
    worstDay: null,
    worstEffectivenessPct: null,
  };

  return {
    complete,
    presentation,
    wakeTimeSource: complete ? ('crew_reported' as const) : null,
    dataSource: complete ? ('crew_reported' as const) : params.checkinRow ? ('crew_reported' as const) : ('missing_checkin' as const),
    confidence: complete ? ('reported' as const) : params.checkinRow ? ('incomplete' as const) : ('unavailable' as const),
    rowForExplanation,
    limitations,
    windows: {
      sevenDays: complete ? params.worst7d : unavailableWindow,
      twentyEightDays: complete ? params.worst28d : unavailableWindow,
    },
  };
}
