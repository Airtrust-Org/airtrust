import type {
  FrmsOperationalSnapshotAlertCode,
  FrmsOperationalSnapshotItem,
  FrmsOperationalSnapshotStatus,
} from './operational-snapshot';

export type FrmsReadAckEventType =
  | 'CHECKIN_PENDENTE'
  | 'CHECKIN_CRITICO'
  | 'DADO_ESTIMADO'
  | 'DADO_INCONSISTENTE'
  | 'JORNADA_SEM_FATORIZACAO'
  | 'EFETIVIDADE_BAIXA'
  | 'QUINZENA_INCOMPLETA'
  | 'OUTRO_CONTEXTUAL';

export type FrmsReadAckEventSeverity = 'INFO' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
export type FrmsReadAckEventStatus = 'PENDING' | 'ACKED';
export type FrmsReadAckLifecycleStatus = FrmsReadAckEventStatus | 'STALE' | 'ARCHIVED_VIEW_ONLY';
export type FrmsReadAckQueryStatus = 'PENDING' | 'ACKED' | 'ALL' | 'STALE';

export interface FrmsReadAckEventPayload {
  schema_version: 1;
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  funcionario_nome: string | null;
  event_type: FrmsReadAckEventType;
  severity: FrmsReadAckEventSeverity;
  status: FrmsReadAckEventStatus;
  source: 'OPERATIONAL_SNAPSHOT';
  snapshot_status: FrmsOperationalSnapshotStatus;
  snapshot_alertas: FrmsOperationalSnapshotAlertCode[];
  checkin_status: FrmsOperationalSnapshotItem['checkin_status'];
  sleep_data_source: FrmsOperationalSnapshotItem['sleep_data_source'];
  wake_data_source: FrmsOperationalSnapshotItem['wake_data_source'];
  jornada_data_source: FrmsOperationalSnapshotItem['jornada_data_source'];
  fortnight_status: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  acknowledged_by_name: string | null;
  ack_note: string | null;
  limitations: string[];
}

export interface FrmsReadAckEvent extends FrmsReadAckEventPayload {
  id: string;
  stored_created_at: string;
  lifecycle_status?: FrmsReadAckLifecycleStatus;
}

export const FRMS_READ_ACK_EVENT_KIND = 'FRMS_READ_ACK_EVENT';
export const FRMS_READ_ACK_ACK_KIND = 'FRMS_READ_ACK_ACK';

export const FRMS_READ_ACK_LIMITATIONS = [
  'Evento operacional de leitura e ciencia; nao representa mitigacao.',
  'Nao e decisao automatica de aptidao, escala ou substituicao.',
  'Derivado do snapshot operacional FRMS e sujeito as fontes REAL/ESTIMADO/AUSENTE/INCONSISTENTE.',
];

export const FRMS_READ_ACK_STALE_DAYS = 7;

export const FRMS_READ_ACK_QUERY_STATUSES: readonly FrmsReadAckQueryStatus[] = [
  'PENDING',
  'ACKED',
  'ALL',
  'STALE',
];

export function isReadAckEventStale(
  event: Pick<FrmsReadAckEvent, 'status' | 'data_operacional'>,
  now = new Date(),
  staleDays = FRMS_READ_ACK_STALE_DAYS,
): boolean {
  if (event.status !== 'PENDING') return false;
  const dayStart = new Date(`${event.data_operacional}T00:00:00Z`);
  if (Number.isNaN(dayStart.getTime())) return false;
  const msThreshold = staleDays * 24 * 60 * 60 * 1000;
  return now.getTime() - dayStart.getTime() > msThreshold;
}

export function lifecycleStatusOfReadAckEvent(
  event: Pick<FrmsReadAckEvent, 'status' | 'data_operacional'>,
  now = new Date(),
  staleDays = FRMS_READ_ACK_STALE_DAYS,
): FrmsReadAckLifecycleStatus {
  if (event.status === 'ACKED') return 'ACKED';
  return isReadAckEventStale(event, now, staleDays) ? 'STALE' : 'PENDING';
}

function slugPart(value: string): string {
  return value.replace(/[^A-Z0-9_:-]/gi, '_');
}

export function buildFrmsReadAckEventId(
  empresaId: number,
  dataOperacional: string,
  funcionarioId: number,
  eventType: FrmsReadAckEventType,
): string {
  return `frms_read_ack_${empresaId}_${slugPart(dataOperacional)}_${funcionarioId}_${eventType}`;
}

function severityFromStatus(status: FrmsOperationalSnapshotStatus): FrmsReadAckEventSeverity {
  if (status === 'CRITICO') return 'CRITICO';
  if (status === 'INCOMPLETO') return 'INCOMPLETO';
  if (status === 'ATENCAO') return 'ATENCAO';
  return 'INFO';
}

function hasAlert(
  item: FrmsOperationalSnapshotItem,
  code: FrmsOperationalSnapshotAlertCode,
): boolean {
  return item.alertas.includes(code);
}

function hasEstimatedData(item: FrmsOperationalSnapshotItem): boolean {
  return (
    item.sleep_data_source === 'ESTIMADO' ||
    item.wake_data_source === 'ESTIMADO' ||
    item.jornada_data_source === 'ESTIMADO' ||
    hasAlert(item, 'SONO_ESTIMADO')
  );
}

function eventTypesForItem(item: FrmsOperationalSnapshotItem): FrmsReadAckEventType[] {
  const types: FrmsReadAckEventType[] = [];

  if (hasAlert(item, 'CHECKIN_PENDENTE')) types.push('CHECKIN_PENDENTE');
  if (hasAlert(item, 'CHECKIN_CRITICO')) types.push('CHECKIN_CRITICO');
  if (hasEstimatedData(item)) types.push('DADO_ESTIMADO');
  if (hasAlert(item, 'DADO_INCONSISTENTE') || item.jornada_data_source === 'INCONSISTENTE') {
    types.push('DADO_INCONSISTENTE');
  }
  if (hasAlert(item, 'JORNADA_SEM_FATORIZACAO')) types.push('JORNADA_SEM_FATORIZACAO');
  if (hasAlert(item, 'EFETIVIDADE_BAIXA')) types.push('EFETIVIDADE_BAIXA');
  if (hasAlert(item, 'ESCALADO_SEM_JORNADA_FRMS') || hasAlert(item, 'JORNADA_FRMS_SEM_ESCALA')) {
    types.push('OUTRO_CONTEXTUAL');
  }

  return [...new Set(types)];
}

export function buildFrmsReadAckEventsFromSnapshot(
  items: FrmsOperationalSnapshotItem[],
  generatedAt: string,
): FrmsReadAckEvent[] {
  return items.flatMap((item) =>
    eventTypesForItem(item).map((eventType) => {
      const id = buildFrmsReadAckEventId(
        item.empresa_id,
        item.data_operacional,
        item.funcionario_id,
        eventType,
      );

      return {
        id,
        schema_version: 1,
        empresa_id: item.empresa_id,
        data_operacional: item.data_operacional,
        funcionario_id: item.funcionario_id,
        funcionario_nome: item.nome_guerra || item.nome || null,
        event_type: eventType,
        severity: severityFromStatus(item.snapshot_status),
        status: 'PENDING',
        source: 'OPERATIONAL_SNAPSHOT',
        snapshot_status: item.snapshot_status,
        snapshot_alertas: item.alertas,
        checkin_status: item.checkin_status,
        sleep_data_source: item.sleep_data_source,
        wake_data_source: item.wake_data_source,
        jornada_data_source: item.jornada_data_source,
        fortnight_status: item.fortnight_indicator?.status_quinzena ?? null,
        created_at: generatedAt,
        stored_created_at: generatedAt,
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledged_by_name: null,
        ack_note: null,
        limitations: FRMS_READ_ACK_LIMITATIONS,
      };
    }),
  );
}

export function sanitizeAckNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, 280);
}

export function parseFrmsReadAckEventPayload(
  id: string,
  payloadJson: string | null,
  storedCreatedAt: string,
): FrmsReadAckEvent | null {
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as Partial<FrmsReadAckEventPayload>;
    if (payload.schema_version !== 1) return null;
    if (!payload.data_operacional || !payload.funcionario_id || !payload.event_type) return null;
    return {
      ...(payload as FrmsReadAckEventPayload),
      id,
      stored_created_at: storedCreatedAt,
    };
  } catch {
    return null;
  }
}
