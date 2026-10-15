import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { operationalConfidence, resolveOperationalDataMoment } from './frmsOperationalDecision';

/**
 * Display-only interpretation. A jornada ainda em aberto não é prova de aptidão,
 * nem altera a confiança canônica, o risco, a classificação ou o score.
 * Apenas distingue a coleta esperada pós-operação de outras lacunas atuais.
 */
export function isFrmsRoutineDutyClosurePending(item: FrmsOperationalSnapshotItem, todayIso: string): boolean {
  const period = item.fortnight_indicator;
  return Boolean(period?.periodo_inicio && period.periodo_fim &&
      (period.fonte_periodo === 'REAL' || period.fonte_periodo === 'DERIVADO') &&
      period.freshness_dado === 'COMPLETO') &&
    resolveOperationalDataMoment(item, todayIso) === 'DIA_EM_ABERTO' &&
    item.checkin_status === 'RECEBIDO' &&
    item.jornada_data_source === 'AUSENTE' &&
    item.fatorizacao_status !== 'AUSENTE' &&
    item.escala_source !== 'AUSENTE' &&
    item.sleep_data_source === 'REAL' &&
    item.wake_data_source === 'REAL' &&
    item.snapshot_status !== 'INCOMPLETO' &&
    item.estado_operacional !== 'NAO_AVALIADO' &&
    item.estado_operacional !== 'CRITICO_VIOLACAO' &&
    item.estado_operacional !== 'MITIGACAO_NECESSARIA' &&
    !item.alertas.some((code) =>
      code === 'DADO_INCONSISTENTE' ||
      code === 'JORNADA_SEM_FATORIZACAO' ||
      code === 'JORNADA_FRMS_SEM_ESCALA'
    );
}

export function hasFrmsOtherConfidenceGaps(item: FrmsOperationalSnapshotItem, todayIso: string): boolean {
  return operationalConfidence(item) === 'BAIXA' &&
    !isFrmsRoutineDutyClosurePending(item, todayIso);
}

/** Independent facts from the canonical snapshot, not a new risk classifier. */
export function frmsAttentionFacts(item: FrmsOperationalSnapshotItem): string[] {
  const period = item.fortnight_indicator;
  const facts: string[] = [];
  const periodAlerts = period?.alertas_quinzena || [];

  if (periodAlerts.includes('SCORE_QUINZENAL_CRITICO')) facts.push('Índice da quinzena em faixa crítica');
  else if (periodAlerts.includes('SCORE_QUINZENAL_ATENCAO')) facts.push('Índice da quinzena na faixa de atenção');

  if (typeof period?.dias_com_checkin_pendente === 'number' && period.dias_com_checkin_pendente > 0) {
    facts.push(period.dias_com_checkin_pendente + ' dia(s) com check-in pendente na quinzena');
  }
  if (typeof period?.dias_com_dado_estimado === 'number' && period.dias_com_dado_estimado > 0) {
    facts.push(period.dias_com_dado_estimado + ' dia(s) com dados estimados no período');
  }
  if (item.alertas.includes('CHECKIN_CRITICO')) facts.push('Check-in diário crítico');
  else if (item.alertas.includes('CHECKIN_PENDENTE') && item.checkin_status !== 'RECEBIDO') {
    facts.push('Check-in do dia ainda não recebido');
  }
  if (item.alertas.includes('SONO_INSUFICIENTE')) facts.push('Sono insuficiente sinalizado');
  if (item.alertas.includes('KSS_ALTO')) facts.push('KSS alto sinalizado');
  if (item.alertas.includes('DADO_INCONSISTENTE')) facts.push('Dados atuais inconsistentes');

  return [...new Set(facts)];
}
