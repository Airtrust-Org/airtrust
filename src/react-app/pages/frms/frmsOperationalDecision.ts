import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

export type FrmsDecisionBucket = 'BLOQUEIO' | 'DECISAO' | 'CONFIRMAR' | 'NORMAL';
export type FrmsDataConfidence = 'ALTA' | 'MEDIA' | 'BAIXA';

export function hasIncompleteOperationalData(item: FrmsOperationalSnapshotItem): boolean {
  return (
    item.snapshot_status === 'INCOMPLETO' ||
    item.estado_operacional === 'NAO_AVALIADO' ||
    item.fatorizacao_status !== 'CALCULADA' ||
    item.jornada_data_source === 'AUSENTE' ||
    item.jornada_data_source === 'INCONSISTENTE' ||
    (item.escalado && item.checkin_status !== 'RECEBIDO') ||
    item.alertas.includes('DADO_INCONSISTENTE') ||
    item.alertas.includes('JORNADA_SEM_FATORIZACAO') ||
    item.alertas.includes('ESCALADO_SEM_JORNADA_FRMS')
  );
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

  if (hasIncompleteOperationalData(item) || item.alertas.includes('CHECKIN_PENDENTE')) {
    return 'CONFIRMAR';
  }

  return 'NORMAL';
}

export function trustedEffectiveness(item: FrmsOperationalSnapshotItem): number | null {
  if (
    item.fatorizacao_status !== 'CALCULADA' ||
    item.snapshot_status === 'INCOMPLETO' ||
    item.jornada_data_source === 'AUSENTE' ||
    item.jornada_data_source === 'INCONSISTENTE' ||
    item.effectiveness_pct == null ||
    !Number.isFinite(item.effectiveness_pct)
  ) {
    return null;
  }

  return item.effectiveness_pct;
}

export function operationalConfidence(item: FrmsOperationalSnapshotItem): FrmsDataConfidence {
  if (hasIncompleteOperationalData(item)) return 'BAIXA';

  const estimated =
    item.sleep_data_source === 'ESTIMADO' ||
    item.wake_data_source === 'ESTIMADO' ||
    item.jornada_data_source === 'ESTIMADO' ||
    item.escala_source === 'MANUAL';

  return estimated ? 'MEDIA' : 'ALTA';
}

export function isOperationallyRelevant(item: FrmsOperationalSnapshotItem): boolean {
  return (
    item.escalado ||
    item.teve_jornada ||
    item.alertas.length > 0 ||
    classifyOperationalItem(item) !== 'NORMAL'
  );
}

export function bucketPriority(bucket: FrmsDecisionBucket): number {
  if (bucket === 'BLOQUEIO') return 0;
  if (bucket === 'DECISAO') return 1;
  if (bucket === 'CONFIRMAR') return 2;
  return 3;
}
