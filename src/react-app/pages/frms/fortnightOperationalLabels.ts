import type { FrmsFortnightIndicator } from '@/react-app/hooks/useFrmsOperationalSnapshot';

export const FORTNIGHT_OPERATIONAL_DISCLAIMER = 'Indicador operacional da quinzena';
export const FORTNIGHT_MANAGER_DISCLAIMER =
  'Apoia a decisão do gestor, mas não substitui a avaliação operacional final';
export const FORTNIGHT_NO_DATA_MESSAGE =
  'Sem indicador quinzenal disponível para o período.';

export const FORTNIGHT_STATUS_LABELS: Record<string, string> = {
  OK: 'Quinzena completa',
  ATENCAO: 'Quinzena com atenção',
  CRITICO: 'Quinzena crítica',
  INCOMPLETO: 'Quinzena incompleta',
};

export const FORTNIGHT_TENDENCIA_LABELS: Record<string, string> = {
  ESTAVEL: 'Estável',
  CRESCENTE: 'Em alta',
  REDUZINDO: 'Em redução',
  INDETERMINADA: 'Indeterminada',
};

export const FORTNIGHT_NATUREZA_LABELS: Record<string, string> = {
  PROJECAO: 'Projeção',
  CHECKIN_SUBJETIVO: 'Check-in subjetivo',
  JORNADA_PLANEJADA: 'Jornada planejada',
  JORNADA_REALIZADA: 'Jornada realizada',
  ACUMULADO_LEGAL: 'Acumulado legal',
};

export const FORTNIGHT_FRESHNESS_LABELS: Record<string, string> = {
  COMPLETO: 'Dados completos',
  PARCIAL: 'Dados parciais',
  ESTIMADO: 'Dados estimados',
  AUSENTE: 'Dados ausentes',
};

export const FORTNIGHT_DECISAO_LABELS: Record<string, string> = {
  INFORMA: 'Informativo',
  ALERTA: 'Alerta operacional',
  EXIGE_OVERRIDE: 'Requer decisão do gestor',
  BLOQUEIA: 'Bloqueio operacional sugerido',
};

export const FORTNIGHT_MITIGACAO_LABELS: Record<string, string> = {
  TROCAR_TRIPULANTE: 'Considerar troca de tripulante',
  REDUZIR_JORNADA: 'Reduzir jornada',
  INSERIR_REPOUSO: 'Inserir repouso',
  REVISAR_CHECKIN: 'Revisar check-in',
  AGUARDAR_SIGVOOS: 'Aguardar confirmação de escala',
  ACEITAR_COM_RESSALVA: 'Aceitar com ressalva operacional',
  SEM_ACAO: 'Sem ação imediata',
};

const SOURCE_LABELS: Record<string, string> = {
  REAL: 'Real',
  ESTIMADO: 'Estimado',
  AUSENTE: 'Ausente',
  INCONSISTENTE: 'Inconsistente',
  MANUAL: 'Manual',
  DERIVADO: 'Derivado',
  INCOMPLETO: 'Incompleto',
};

export function sourceLabel(value: string | null | undefined): string {
  if (!value) return 'Ausente';
  return SOURCE_LABELS[value] || value;
}

export function formatFortnightMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const totalMinutes = Math.max(0, Math.trunc(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function formatMinutesAsHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value / 60).toFixed(1)}h`;
}

export function formatDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatFortnightPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return '--';
  return `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;
}

export function formatFortnightScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return String(Math.round(value));
}

export function formatFortnightTendencia(value: string | null | undefined): string {
  if (!value) return 'Indeterminada';
  return FORTNIGHT_TENDENCIA_LABELS[value] || value;
}

export function formatFortnightNatureza(value: string | null | undefined): string {
  if (!value) return '--';
  return FORTNIGHT_NATUREZA_LABELS[value] || value;
}

export function formatFortnightFreshness(value: string | null | undefined): string {
  if (!value) return '--';
  return FORTNIGHT_FRESHNESS_LABELS[value] || value;
}

export function formatFortnightDecisao(value: string | null | undefined): string {
  if (!value) return '--';
  return FORTNIGHT_DECISAO_LABELS[value] || value;
}

export function formatFortnightMitigacao(value: string | null | undefined): string {
  if (!value) return '--';
  return FORTNIGHT_MITIGACAO_LABELS[value] || value;
}

export function formatTopModifiers(
  modifiers: FrmsFortnightIndicator['atenuadores_aplicados'] | undefined,
  limit = 2,
): string {
  if (!modifiers?.length) return '--';
  return modifiers
    .slice(0, limit)
    .map((entry) => entry.descricao || entry.codigo)
    .join(' · ');
}

export function formatFortnightLabel(indicator: FrmsFortnightIndicator | null | undefined): string {
  if (!indicator) return 'Quinzena sem indicador';

  const statusMap: Record<string, string> = {
    OK: 'completa',
    ATENCAO: 'com atenção',
    CRITICO: 'crítica',
    INCOMPLETO: 'incompleta',
  };
  const statusLabel = statusMap[indicator.status_quinzena] || indicator.status_quinzena.toLowerCase();
  const scoreText =
    indicator.score_acumulado != null && Number.isFinite(indicator.score_acumulado)
      ? ` · score ${formatFortnightScore(indicator.score_acumulado)}`
      : '';
  const tendenciaText =
    indicator.tendencia && indicator.tendencia !== 'INDETERMINADA'
      ? ` · ${formatFortnightTendencia(indicator.tendencia).toLowerCase()}`
      : '';
  const dutyText =
    indicator.duty_time_periodo_min != null && Number.isFinite(indicator.duty_time_periodo_min)
      ? ` · jornada ${formatMinutesAsHours(indicator.duty_time_periodo_min)}`
      : '';

  return `Quinzena ${statusLabel}${scoreText}${tendenciaText}${dutyText}`;
}

export function buildFortnightCrewOrientation(
  indicator: FrmsFortnightIndicator | null | undefined,
  checkinPendente?: boolean,
): string {
  if (checkinPendente) {
    return 'Complete o check-in de fadiga para manter o acompanhamento atualizado.';
  }
  if (!indicator || indicator.fonte_periodo === 'AUSENTE') {
    return 'Sem indicador quinzenal neste período. Consulte a coordenação se tiver dúvidas.';
  }
  if (indicator.status_quinzena === 'CRITICO') {
    return 'Sua quinzena pede atenção. Fale com a coordenação antes de assumir nova jornada.';
  }
  if (indicator.status_quinzena === 'ATENCAO') {
    return 'Monitore descanso e check-ins. Avise a coordenação se não se sentir apto.';
  }
  if (indicator.dias_com_checkin_pendente && indicator.dias_com_checkin_pendente > 0) {
    return 'Há check-ins pendentes na quinzena. Registre o check-in diário.';
  }
  return 'Quinzena dentro do esperado. Mantenha check-ins em dia.';
}

export function buildFortnightTooltipSuffix(
  indicator: FrmsFortnightIndicator | null | undefined,
): string | null {
  if (!indicator || indicator.fonte_periodo === 'AUSENTE') return null;

  const parts: string[] = [];
  parts.push(FORTNIGHT_STATUS_LABELS[indicator.status_quinzena] || indicator.status_quinzena);

  if (indicator.score_acumulado != null && Number.isFinite(indicator.score_acumulado)) {
    parts.push(`score ${formatFortnightScore(indicator.score_acumulado)}`);
  }

  if (indicator.tendencia && indicator.tendencia !== 'INDETERMINADA') {
    parts.push(formatFortnightTendencia(indicator.tendencia).toLowerCase());
  }

  if (indicator.explicacao_operacional?.trim()) {
    parts.push(indicator.explicacao_operacional.trim());
  }

  const mitigacao = formatFortnightMitigacao(indicator.mitigacao_recomendada);
  if (mitigacao !== '--' && indicator.mitigacao_recomendada !== 'SEM_ACAO') {
    parts.push(mitigacao);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function toneByFortnightStatus(status: string): string {
  if (status === 'CRITICO') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'ATENCAO') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'INCOMPLETO') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export function toneByFortnightSource(source: string | null | undefined): string {
  if (source === 'REAL') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (source === 'DERIVADO') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (source === 'ESTIMADO') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (source === 'INCOMPLETO') return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export function hasLocatedFortnight(indicator: FrmsFortnightIndicator | null | undefined): boolean {
  return Boolean(indicator && indicator.fonte_periodo !== 'AUSENTE');
}

export type FortnightNotice = {
  message: string;
  toneClassName: string;
};

export function resolveFortnightNotice(
  indicator: FrmsFortnightIndicator | null,
  item?: { teve_jornada?: boolean } | null,
): FortnightNotice | null {
  if (!indicator) {
    return {
      message: 'Sem jornada FRMS registrada nesta data.',
      toneClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    };
  }

  const alerts = new Set(indicator.alertas_quinzena.map((value) => value?.trim()).filter(Boolean));

  if (indicator.fonte_periodo === 'AUSENTE' || alerts.has('PERIODO_QUINZENA_AUSENTE')) {
    return {
      message:
        'Período de embarque não localizado nesta data. Verifique se a escala quinzenal foi cadastrada.',
      toneClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    };
  }

  if (
    indicator.fonte_periodo === 'INCOMPLETO' ||
    indicator.status_quinzena === 'INCOMPLETO' ||
    alerts.has('PERIODO_PARCIAL_NA_CONSULTA')
  ) {
    return {
      message:
        item?.teve_jornada === false
          ? 'Período incompleto. Não há jornada FRMS vinculada neste dia. A leitura considera apenas os dias disponíveis. Não usar isoladamente como decisão final.'
          : 'Período incompleto. A leitura considera apenas os dias disponíveis. Não usar isoladamente como decisão final.',
      toneClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (item?.teve_jornada === false && hasLocatedFortnight(indicator)) {
    return {
      message: 'Quinzena base identificada. Não há jornada FRMS vinculada neste dia.',
      toneClassName: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }

  return null;
}
