export function formatOptionalMinutesCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const totalMinutes = Math.max(0, Math.round(Number(value)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
}

export function formatRecoveryCredit(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return 'Não informado';
  const numeric = Number(value);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pt`;
}

const CHECKIN_STATUS_LABELS: Record<string, string> = {
  RECEBIDO: 'Recebido', PENDENTE: 'Pendente', AUSENTE: 'Não realizado', NAO_APLICAVEL: 'Não aplicável',
};
export function formatCheckinStatus(value: string | null | undefined): string {
  if (!value) return 'Não realizado';
  return CHECKIN_STATUS_LABELS[value] || humanizeCode(value);
}

const ACTIVITY_LABELS: Record<string, string> = {
  VOO: 'Voo', SIMULADOR: 'Simulador', TREINAMENTO: 'Treinamento', ATIVIDADE: 'Atividade operacional',
  MISTA: 'Atividade mista', SEM_DADO: 'Não informada',
};
export function formatFrmsActivity(value: string | null | undefined): string {
  if (!value) return 'Não informada';
  return ACTIVITY_LABELS[value] || humanizeCode(value);
}

const RECOVERY_STATE_LABELS: Record<string, string> = {
  FULL: 'Recuperação completa', PARTIAL: 'Recuperação parcial', INSUFFICIENT: 'Recuperação insuficiente',
  NONE: 'Sem recuperação confirmada', UNKNOWN: 'Recuperação não avaliada', UNAVAILABLE: 'Recuperação não avaliada',
};
export function formatRecoveryState(value: string | null | undefined): string | null {
  if (!value) return null;
  return RECOVERY_STATE_LABELS[value] || humanizeCode(value);
}

const DATA_QUALITY_LABELS: Record<string, string> = {
  COMPLETE: 'Completa', COMPLETO: 'Completa', INCOMPLETE: 'Incompleta', INCOMPLETO: 'Incompleta',
  PARTIAL: 'Parcial', PARCIAL: 'Parcial', ESTIMATED: 'Estimada', ESTIMADO: 'Estimada',
  MISSING: 'Ausente', AUSENTE: 'Ausente',
  OBSERVED: 'Observada', CONFIRMED_ZERO: 'Zero confirmado', NOT_APPLICABLE: 'Não aplicável',
  SIGVOOS_UNAVAILABLE: 'Fallback SIGVOOS indisponível',
};
export function formatDataQuality(value: string | null | undefined): string {
  if (!value) return 'Não informada';
  return DATA_QUALITY_LABELS[value] || humanizeCode(value);
}

export function formatSnapshotSource(value: string | null | undefined): string {
  if (!value || value === 'AUSENTE') return 'Ausente';
  if (value === 'REAL') return 'Confirmado';
  if (value === 'MANUAL') return 'Manual';
  if (value === 'EVD') return 'Escala publicada';
  if (value === 'SIGVOOS') return 'SIGVOOS (fallback)';
  if (value === 'CONTROLE_VOOS') return 'Controle de Voos';
  if (value === 'ESTIMADO') return 'Estimado';
  if (value === 'INCONSISTENTE') return 'Inconsistente';
  return humanizeCode(value);
}

function humanizeCode(value: string): string {
  const normalized = value.trim().replace(/_/g, ' ').toLocaleLowerCase('pt-BR');
  if (!normalized) return 'Não informado';
  return normalized.charAt(0).toLocaleUpperCase('pt-BR') + normalized.slice(1);
}

const FRMS_REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ROLLING_REGULATORY_EVIDENCE_MISSING: 'Histórico móvel de voo e jornada ainda incompleto para a avaliação regulatória',
  CALENDAR_YEAR_FLIGHT_EVIDENCE_MISSING: 'Horas de voo do ano-calendário ainda incompletas para a avaliação regulatória',
  REST_EVIDENCE_UNKNOWN: 'Evidência de repouso anterior ainda insuficiente para a avaliação regulatória',
  WORK_TIME_EVIDENCE_MISSING: 'Histórico de jornada e trabalho ainda incompleto para a avaliação regulatória',
  ACT_CDS_MISSION_DAY_EVIDENCE_MISSING: 'Dia do período operacional ainda não pôde ser confirmado',
  ACT_CDS_MISSION_PERIOD_EVIDENCE_MISSING: 'Período operacional ainda não pôde ser confirmado',
  ACT_CDS_EFFECTIVE_DAYS_AT_LOCATION_EVIDENCE_INCOMPLETE: 'Dias efetivos no local ainda não estão completamente confirmados',
  ACT_CDS_POST_MISSION_REST_EVIDENCE_INCOMPLETE: 'Repouso após o período operacional ainda não está completamente confirmado',
  SIGVOOS_EXTERNAL_EVIDENCE_PENDING: 'Evidência externa de voo ainda está pendente de confirmação',
  HELICOPTER_LIMITS_NOT_APPLICABLE_TO_PROFILE: 'Limites específicos de helicóptero não se aplicam ao perfil regulatório configurado',
  ACTIVITY_INTERVAL_MISSING: 'Horário de início ou fim da atividade ainda não foi informado',
  ACTIVITY_REALIZATION_UNCONFIRMED: 'Realização da atividade ainda não foi confirmada',
  ACTIVITY_LEGAL_FACTOR_MISSING: 'Regra de contabilização da atividade ainda não pôde ser confirmada',
  DUTY_INTERVAL_MISSING: 'Horário de início ou fim da jornada ainda não foi informado',
  MISSION_WORK_CONTEXT_INCOMPLETE: 'Histórico do período operacional ainda está incompleto',
  POST_MISSION_WORK_CONTEXT_INCOMPLETE: 'Histórico de trabalho após o período operacional ainda está incompleto',
});

export function formatFrmsReason(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'Informação operacional incompleta';
  const mapped = FRMS_REASON_LABELS[normalized];
  if (mapped) return mapped;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(normalized)) {
    return 'Informação operacional incompleta — revisar dados de origem';
  }
  return normalized;
}
