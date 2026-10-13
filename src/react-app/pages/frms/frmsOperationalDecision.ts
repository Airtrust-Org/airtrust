import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { formatFrmsReason } from './frmsPresentation';

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
    (item.checkin_status !== 'RECEBIDO' && requiresOperationalDecision(item)) ||
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
  if (item.estado_operacional === 'CRITICO_VIOLACAO' || item.snapshot_status === 'CRITICO' ||
    item.fortnight_indicator?.status_quinzena === 'CRITICO') {
    return 'BLOQUEIO';
  }

  if (
    item.estado_operacional === 'MITIGACAO_NECESSARIA' ||
    item.estado_operacional === 'ATENCAO' ||
    item.snapshot_status === 'ATENCAO' ||
    item.fortnight_indicator?.status_quinzena === 'ATENCAO' ||
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

export interface FrmsCoordinationGuidance {
  requiresCheckin: boolean;
  checkinComplete: boolean;
  checkinLabel: string;
  reason: string;
  action: string;
}

/** Short coordination copy; never derives a new fatigue threshold or authorizes a flight. */
export function resolveFrmsCoordinationGuidance(
  item: FrmsOperationalSnapshotItem,
  todayIso: string,
): FrmsCoordinationGuidance {
  const requiresCheckin = Boolean(
    item.escalado || item.operacao_requer_decisao || item.teve_jornada ||
    item.teve_atividade_frms || item.hora_apresentacao,
  );
  const checkinComplete = item.checkin_status === 'RECEBIDO';
  const checkinLabel = checkinComplete ? 'Recebido'
    : !requiresCheckin && item.checkin_status === 'NAO_APLICAVEL' ? 'Não exigido'
      : item.checkin_status === 'PENDENTE' ? 'Pendente'
        : item.checkin_status === 'NAO_APLICAVEL' ? 'Não confirmado'
          : 'Não realizado';
  const base = { requiresCheckin, checkinComplete, checkinLabel };
  const fortnight = item.fortnight_indicator;
  const isCritical = item.estado_operacional === 'CRITICO_VIOLACAO' ||
    item.snapshot_status === 'CRITICO' ||
    fortnight?.status_quinzena === 'CRITICO';
  const serious = item.estado_operacional === 'MITIGACAO_NECESSARIA';
  const fortnightNeedsReview = fortnight?.status_quinzena === 'ATENCAO';
  const factors = (fortnight?.agravantes_aplicados || [])
    .map((factor) => factor.descricao?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);
  const fortnightReason = fortnight?.status_quinzena === 'CRITICO' ||
    fortnightNeedsReview
      ? `Fadiga acumulada ${fortnight.status_quinzena === 'CRITICO' ? 'crítica' : 'em atenção'}${factors.length ? `: ${factors.join('; ')}.` : '.'}`
      : null;
  const primaryReasonRaw = item.motivos_principais?.find(Boolean)?.trim();
  const primaryReason = primaryReasonRaw ? formatFrmsReason(primaryReasonRaw) : null;

  // Safety-first: always show critical and missing check-in independently.
  if (isCritical) {
    return {
      ...base,
      reason: fortnight?.status_quinzena === 'CRITICO' ? fortnightReason! :
        primaryReason || 'Restrição operacional crítica identificada.',
      action: 'Não recomendar liberação. Encaminhar à gestão operacional para revisão, recuperação ou substituição e registrar a decisão.',
    };
  }
  if (serious) {
    return {
      ...base,
      reason: primaryReason || 'Medidas de mitigação necessárias antes da atividade.',
      action: 'Manter a decisão pendente. Avaliar repouso, redução da demanda ou substituição; registrar a mitigação.',
    };
  }
  if (requiresCheckin && !checkinComplete) {
    return {
      ...base,
      reason: 'Check-in de fadiga diária não confirmado para a atividade.',
      action: item.data_operacional > todayIso
        ? 'Solicitar o check-in na data da operação; o planejamento pode continuar, mas a liberação depende da confirmação.'
        : 'Não liberar o voo sem check-in recebido de toda a tripulação. Solicitar a avaliação diária.',
    };
  }
  if (fortnightNeedsReview) {
    return {
      ...base,
      reason: fortnightReason!,
      action: 'Revisar sequência de jornadas e recuperação; avaliar ajustes da próxima missão e registrar a providência.',
    };
  }
  if (isOutsideFortnightOperationalExtension(item)) {
    return {
      ...base,
      reason: 'Atividade sem vínculo confirmado com a quinzena operacional.',
      action: 'Confirmar extensão autorizada ou corrigir a escala e a jornada de origem.',
    };
  }
  if (hasIncompleteOperationalData(item)) {
    const dayOpen = resolveOperationalDataMoment(item, todayIso) === 'DIA_EM_ABERTO';
    return {
      ...base,
      reason: dayOpen && checkinComplete
        ? 'Jornada em andamento; encerramento ainda não disponível.'
        : primaryReason || 'Dados obrigatórios não confirmados.',
      action: dayOpen && checkinComplete
        ? 'Confirmar condição pré-missão; conferir o encerramento da jornada após a operação.'
        : 'Confirmar os dados de origem antes da decisão operacional; não presumir condição normal.',
    };
  }
  if (item.estado_operacional === 'ATENCAO' || item.snapshot_status === 'ATENCAO') {
    return {
      ...base,
      reason: primaryReason || 'Indicador de fadiga requer atenção.',
      action: item.acao_recomendada_texto || 'Revisar a condição antes da próxima missão e registrar a providência.',
    };
  }
  return {
    ...base,
    reason: 'Sem pendência FRMS identificada com os dados disponíveis.',
    action: requiresCheckin
      ? 'Confirmar os demais requisitos operacionais do voo antes da liberação.'
      : 'Sem ação imediata; acompanhar a próxima atividade programada.',
  };
}

export function bucketPriority(bucket: FrmsDecisionBucket): number {
  if (bucket === 'BLOQUEIO') return 0;
  if (bucket === 'DECISAO') return 1;
  if (bucket === 'CONFIRMAR') return 2;
  return 3;
}
