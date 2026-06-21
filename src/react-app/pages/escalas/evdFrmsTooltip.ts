import type { FrmsFortnightIndicator } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { buildFortnightTooltipSuffix } from '@/react-app/pages/frms/fortnightOperationalLabels';

export type FrmsTripulanteSignalLike = {
  status: string;
  statusLabel?: string;
  dataSource?: string;
  requiresReview?: boolean;
  hasAlert?: boolean;
} | null | undefined;

export function getFrmsVerboseLabel(signal: FrmsTripulanteSignalLike): string {
  if (!signal) return 'Sem dado FRMS';
  if (signal.status === 'no_duty') return 'Sem jornada FRMS';
  if (signal.status === 'not_submitted') return 'Check-in pendente';
  if (signal.status === 'critical' || signal.status === 'unfit_for_duty') return 'Revisar com gestor';
  if (signal.requiresReview || signal.hasAlert) return 'Revisar com gestor';
  if (signal.status === 'attention') return 'Atenção';
  if (signal.dataSource === 'default_estimate') return 'Dado estimado';
  if (signal.dataSource === 'crew_reported') return 'Check-in recebido';
  return 'FRMS OK';
}

export function buildFrmsLink(data: string, funcionarioId?: number | string | null): string {
  const params = new URLSearchParams({ data_inicio: data, data_fim: data });
  const id = Number(funcionarioId);
  if (Number.isFinite(id) && id > 0) params.set('funcionario_id', String(id));
  return `/frms/controle-operacional?${params.toString()}`;
}

export function buildFrmsTooltipLabel(
  signal: FrmsTripulanteSignalLike,
  fortnight?: FrmsFortnightIndicator | null,
): string {
  const base = getFrmsVerboseLabel(signal);
  const suffix = buildFortnightTooltipSuffix(fortnight);
  if (!suffix) return `${base} — clique para ver no Controle FRMS`;
  return `${base} · Quinzena: ${suffix} — clique para ver no Controle FRMS`;
}
