import type { FrmsMaintenanceTeamItem } from '@/react-app/hooks/useFrmsOperationalAccess';

export type MaintenanceDecisionBucket = 'CRITICAL' | 'ATTENTION' | 'PENDING' | 'NORMAL';

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function classifyMaintenanceItem(item: FrmsMaintenanceTeamItem): MaintenanceDecisionBucket {
  const risk = normalized(item.computed_risk_level);
  const readiness = normalized(item.readiness_classification);
  const operationalStatus = normalized(item.status_operacional);

  if (
    risk === 'critical' ||
    risk === 'unfit_for_duty' ||
    readiness === 'operational_review' ||
    operationalStatus === 'inapto' ||
    operationalStatus === 'nao_apto'
  ) {
    return 'CRITICAL';
  }

  if (
    risk === 'attention' ||
    readiness === 'attention' ||
    operationalStatus === 'apto_com_ressalva' ||
    operationalStatus === 'restrito' ||
    Number(item.requires_operational_review || 0) === 1
  ) {
    return 'ATTENTION';
  }

  if (!item.checkin_id || !item.readiness_id) return 'PENDING';
  return 'NORMAL';
}

export function maintenanceActionText(bucket: MaintenanceDecisionBucket): string {
  switch (bucket) {
    case 'CRITICAL':
      return 'Revisão imediata pela gestão antes de atividade crítica, inspeção ou liberação.';
    case 'ATTENTION':
      return 'Revisar fadiga, mitigação e criticidade da tarefa antes de prosseguir.';
    case 'PENDING':
      return 'Solicitar check-in e teste de prontidão antes da atividade operacional.';
    case 'NORMAL':
      return 'Sem ação imediata; manter monitoramento normal da jornada.';
  }
}

export function readinessLabel(value: unknown): string {
  switch (normalized(value)) {
    case 'baseline_building':
      return 'Baseline em formação';
    case 'preserved':
      return 'Preservada';
    case 'attention':
      return 'Atenção';
    case 'operational_review':
      return 'Revisão operacional';
    default:
      return 'Pendente';
  }
}
