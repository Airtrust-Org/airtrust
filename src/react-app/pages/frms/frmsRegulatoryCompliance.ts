import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

/**
 * Dimensão A (conformidade legal/contratual) apresentada separadamente da
 * Dimensão B (risco de fadiga). O backend é a fonte do resultado; aqui só se
 * traduz o contrato para a coordenação, sem reinterpretar limites.
 */
export type FrmsRegulatoryTone = 'CONFORME' | 'VIOLACAO' | 'NAO_AVALIAVEL';

export interface FrmsRegulatoryView {
  tone: FrmsRegulatoryTone;
  title: string;
  summary: string;
  violations: Array<{ text: string; reference: string }>;
  unknown: string[];
  pending: Array<{ text: string; reference: string }>;
}

const UNKNOWN_REASON_LABELS: Record<string, string> = {
  ROLLING_REGULATORY_EVIDENCE_MISSING: 'Acumulados de horas de voo (dia, mês, 28/365 dias) não calculados para a data',
  CALENDAR_YEAR_FLIGHT_EVIDENCE_MISSING: 'Horas de voo do ano calendário não disponíveis',
  REST_EVIDENCE_UNKNOWN: 'Repouso anterior não observável (jornada anterior sem horário ou sobreposta)',
  WORK_TIME_EVIDENCE_MISSING: 'Tempo de trabalho do mês (jornada, reserva, sobreaviso, treinamento) não apurado',
  DUTY_INTERVAL_MISSING: 'Jornada sem horário de apresentação ou término',
  LAW_DUTY_CREW_COMPOSITION_UNKNOWN: 'Jornada acima de 11 h sem composição da tripulação informada (art. 37: 11/14/18 h)',
  ACTIVITY_INTERVAL_MISSING: 'Atividade de solo/treinamento sem horário',
  ACTIVITY_LEGAL_FACTOR_MISSING: 'Atividade sem regra de cômputo legal definida',
  HELICOPTER_LIMITS_NOT_APPLICABLE_TO_PROFILE: 'Perfil regulatório da empresa não é helicóptero offshore',
  ACT_CDS_MISSION_DAY_EVIDENCE_MISSING: 'Dia da missão não identificado na escala',
  ACT_CDS_MISSION_PERIOD_EVIDENCE_MISSING: 'Período de missão não identificado na escala',
  ACT_CDS_EFFECTIVE_DAYS_AT_LOCATION_EVIDENCE_INCOMPLETE: 'Dias de trabalho efetivo no local da operação não confirmados',
  ACT_CDS_POST_MISSION_REST_EVIDENCE_INCOMPLETE: 'Folga pós-missão não confirmada',
  MISSION_WORK_CONTEXT_INCOMPLETE: 'Contexto de trabalho da missão incompleto',
  POST_MISSION_WORK_CONTEXT_INCOMPLETE: 'Contexto de trabalho pós-missão incompleto',
};

export function formatRegulatoryUnknownReason(code: string): string {
  return UNKNOWN_REASON_LABELS[code] ?? 'Dado de origem incompleto para verificar limite legal';
}

export function describeRegulatoryCompliance(item: FrmsOperationalSnapshotItem): FrmsRegulatoryView | null {
  if (!item.compliance_status) return null;
  const pending = (item.compliance_pending_validation ?? []).map((finding) => ({
    text: finding.message,
    reference: finding.reference,
  }));
  if (item.compliance_status === 'VIOLATION') {
    return {
      tone: 'VIOLACAO',
      title: 'Limite legal ou contratual ultrapassado',
      summary: 'Restrição normativa objetiva, independente do índice de fadiga.',
      violations: (item.violacoes_normativas ?? []).map((violation) => ({
        text: violation.message,
        reference: violation.reference,
      })),
      unknown: [...new Set((item.compliance_unknown_reasons ?? []).map(formatRegulatoryUnknownReason))],
      pending,
    };
  }
  if (item.compliance_status === 'UNKNOWN') {
    return {
      tone: 'NAO_AVALIAVEL',
      title: 'Conformidade não verificável',
      summary: 'Faltam dados para confirmar os limites legais; isso não equivale a conformidade.',
      violations: [],
      unknown: [...new Set((item.compliance_unknown_reasons ?? []).map(formatRegulatoryUnknownReason))],
      pending,
    };
  }
  return {
    tone: 'CONFORME',
    title: 'Dentro dos limites verificados',
    summary: 'Cumprir os limites prescritivos não comprova ausência de fadiga.',
    violations: [],
    unknown: [],
    pending,
  };
}
