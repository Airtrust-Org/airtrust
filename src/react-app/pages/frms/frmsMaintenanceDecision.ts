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
  // Uma sessão PVT concluída não é evidência de prontidão preservada enquanto
  // o baseline individual não estiver confirmado. Nenhum score é alterado.
  if (readiness !== 'preserved' || item.baseline_ready !== 1) return 'PENDING';
  return 'NORMAL';
}

export function maintenanceActionText(bucket: MaintenanceDecisionBucket, item?: FrmsMaintenanceTeamItem): string {
  switch (bucket) {
    case 'CRITICAL':
      return 'Revisão imediata pela gestão antes de atividade crítica, inspeção ou liberação.';
    case 'ATTENTION':
      return 'Revisar fadiga, mitigação e criticidade da tarefa antes de prosseguir.';
    case 'PENDING':
      if (item?.checkin_id && !item.readiness_id) return 'Check-in recebido; solicitar PVT/Readiness antes da atividade operacional.';
      if (!item?.checkin_id && item?.readiness_id) return 'PVT/Readiness recebido; solicitar check-in antes da atividade operacional.';
      if (item?.checkin_id && item.readiness_id) {
        if (normalized(item.readiness_classification) === 'baseline_building' || item.baseline_ready !== 1) {
          return 'Check-in e PVT recebidos, mas baseline individual ainda não confirmado; prontidão inconclusiva. Encaminhar à gestão de Manutenção para avaliação antes de tarefa crítica.';
        }
        return 'Check-in e PVT recebidos, mas classificação da prontidão não confirmada. Solicitar revisão pela gestão de Manutenção.';
      }
      return 'Solicitar check-in e PVT/Readiness antes da atividade operacional.';
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

/** Fuso explícito → Brasília; timestamps SQLite sem fuso são mostrados sem conversão. */
export function formatMaintenanceEvidenceTime(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(parsed) + ' (Brasília)';
    }
  }
  const unzoned = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (unzoned) {
    return `${unzoned[3]}/${unzoned[2]}/${unzoned[1]}, ${unzoned[4]}:${unzoned[5]} (fuso não informado)`;
  }
  return null;
}
