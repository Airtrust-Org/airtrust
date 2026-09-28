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
};
export function formatDataQuality(value: string | null | undefined): string {
  if (!value) return 'Não informada';
  return DATA_QUALITY_LABELS[value] || humanizeCode(value);
}

export function formatSnapshotSource(value: string | null | undefined): string {
  if (!value || value === 'AUSENTE') return 'Ausente';
  if (value === 'REAL') return 'Confirmado';
  if (value === 'MANUAL') return 'Manual';
  if (value === 'ESTIMADO') return 'Estimado';
  if (value === 'INCONSISTENTE') return 'Inconsistente';
  return humanizeCode(value);
}

function humanizeCode(value: string): string {
  const normalized = value.trim().replace(/_/g, ' ').toLocaleLowerCase('pt-BR');
  if (!normalized) return 'Não informado';
  return normalized.charAt(0).toLocaleUpperCase('pt-BR') + normalized.slice(1);
}
