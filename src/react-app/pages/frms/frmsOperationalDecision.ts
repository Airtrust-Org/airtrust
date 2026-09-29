import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

export type FrmsDecisionBucket = 'BLOQUEIO' | 'DECISAO' | 'CONFIRMAR' | 'NORMAL';
export type FrmsDataConfidence = 'ALTA' | 'MEDIA' | 'BAIXA';
export type FrmsOperationalDataMoment =
  | 'SEM_OPERACAO'
  | 'PROGRAMADO'
  | 'DIA_EM_ABERTO'
  | 'FECHAMENTO_RETROSPECTIVO_PENDENTE'
  | 'CONSOLIDADO';

function requiresOperationalDecision(item: FrmsOperationalSnapshotItem): boolean {
  // Compatibilidade com snapshots anteriores enquanto a API nova se propaga.
  return item.operacao_requer_decisao ?? (
    item.escalado ||
    item.teve_jornada ||
    item.teve_atividade_frms === true ||
    Boolean(item.hora_apresentacao)
  );
}

/**
 * O check-in apoia a decisão pré-missão, enquanto a jornada realizada só é
 * confirmada depois da operação. Em dia sem voo, a atividade é declarada no
 * check-in seguinte. Isto classifica o momento da coleta para a apresentação;
 * nunca reduz alertas ou altera a decisão canônica do backend.
 */
export function resolveOperationalDataMoment(
  item: FrmsOperationalSnapshotItem,
  todayIso: string,
): FrmsOperationalDataMoment {
  if (!requiresOperationalDecision(item)) return 'SEM_OPERACAO';
  if (item.teve_jornada || item.teve_atividade_frms === true) return 'CONSOLIDADO';
  if (item.data_operacional > todayIso) return 'PROGRAMADO';
  if (item.data_operacional === todayIso) return 'DIA_EM_ABERTO';
  return 'FECHAMENTO_RETROSPECTIVO_PENDENTE';
}

export function hasIncompleteOperationalData(item: FrmsOperationalSnapshotItem): boolean {
  if (!requiresOperationalDecision(item)) return false;
  return (
    item.snapshot_status === 'INCOMPLETO' ||
    item.estado_operacional === 'NAO_AVALIADO' ||
    item.fatorizacao_status === 'AUSENTE' ||
    item.jornada_data_source === 'AUSENTE' ||
    item.jornada_data_source === 'INCONSISTENTE' ||
    (item.escalado && item.checkin_status !== 'RECEBIDO') ||
    item.alertas.includes('DADO_INCONSISTENTE') ||
    item.alertas.includes('JORNADA_SEM_FATORIZACAO') ||
    item.alertas.includes('ESCALADO_SEM_JORNADA_FRMS')
  );
}

export function hasResolvedFortnightMembership(item: FrmsOperationalSnapshotItem): boolean {
  const indicator = item.fortnight_indicator;
  if (!indicator?.periodo_inicio || !indicator.periodo_fim) return false;
  return (
    item.data_operacional >= indicator.periodo_inicio &&
    item.data_operacional <= indicator.periodo_fim
  );
}

export function isOutsideFortnightOperationalExtension(item: FrmsOperationalSnapshotItem): boolean {
  // `null` mantém compatibilidade com snapshots antigos que ainda não carregavam
  // o indicador quinzenal. O backend atual usa um indicador INCOMPLETO com período
  // nulo quando tentou resolver a quinzena e não conseguiu.
  if (item.fortnight_indicator == null || hasResolvedFortnightMembership(item)) return false;
  return item.escalado || item.teve_jornada || item.teve_atividade_frms === true;
}

export function classifyOperationalItem(item: FrmsOperationalSnapshotItem): FrmsDecisionBucket {
  if (item.estado_operacional === 'CRITICO_VIOLACAO' || item.snapshot_status === 'CRITICO') {
    return 'BLOQUEIO';
  }

  if (
    item.estado_operacional === 'MITIGACAO_NECESSARIA' ||
    item.estado_operacional === 'ATENCAO' ||
    item.snapshot_status === 'ATENCAO' ||
    item.alertas.includes('CHECKIN_CRITICO') ||
    item.alertas.includes('EFETIVIDADE_BAIXA') ||
    item.alertas.includes('KSS_ALTO') ||
    item.alertas.includes('SONO_INSUFICIENTE')
  ) {
    return 'DECISAO';
  }

  // Atividade real/programada fora da quinzena não deve ser aceita silenciosamente.
  // Ela permanece na fila para a coordenação confirmar se é extensão operacional.
  if (isOutsideFortnightOperationalExtension(item)) return 'CONFIRMAR';

  if (hasIncompleteOperationalData(item) || item.alertas.includes('CHECKIN_PENDENTE')) {
    return 'CONFIRMAR';
  }

  return 'NORMAL';
}

export function trustedEffectiveness(item: FrmsOperationalSnapshotItem): number | null {
  const isProjected =
    item.effectiveness_source === 'PROJETADA_APRESENTACAO' ||
    item.effectiveness_source === 'PROJETADA_ATIVIDADE';

  if (
    item.fatorizacao_status === 'AUSENTE' ||
    item.snapshot_status === 'INCOMPLETO' ||
    (!isProjected &&
      (item.jornada_data_source === 'AUSENTE' || item.jornada_data_source === 'INCONSISTENTE')) ||
    item.effectiveness_pct == null ||
    !Number.isFinite(item.effectiveness_pct)
  ) {
    return null;
  }

  return item.effectiveness_pct;
}

export function operationalConfidence(item: FrmsOperationalSnapshotItem): FrmsDataConfidence {
  if (isOutsideFortnightOperationalExtension(item) || hasIncompleteOperationalData(item)) return 'BAIXA';

  const estimated =
    item.sleep_data_source === 'ESTIMADO' ||
    item.wake_data_source === 'ESTIMADO' ||
    item.jornada_data_source === 'ESTIMADO' ||
    item.effectiveness_source === 'PROJETADA_APRESENTACAO' ||
    item.escala_source === 'MANUAL';

  return estimated ? 'MEDIA' : 'ALTA';
}

export function isOperationallyRelevant(item: FrmsOperationalSnapshotItem): boolean {
  if (hasResolvedFortnightMembership(item)) return true;
  if (isOutsideFortnightOperationalExtension(item)) return true;

  if (item.fortnight_indicator != null) {
    // Check-in isolado fora da quinzena é preservado como evidência, mas não cria
    // presença na fila operacional. A fila só acompanha a quinzena ativa ou uma
    // atividade operacional que precise ser confirmada como extensão.
    return false;
  }

  // Compatibilidade com snapshots antigos sem indicador quinzenal.
  return (
    requiresOperationalDecision(item) ||
    item.alertas.length > 0 ||
    item.estado_operacional === 'CRITICO_VIOLACAO'
  );
}

export function bucketPriority(bucket: FrmsDecisionBucket): number {
  if (bucket === 'BLOQUEIO') return 0;
  if (bucket === 'DECISAO') return 1;
  if (bucket === 'CONFIRMAR') return 2;
  return 3;
}
