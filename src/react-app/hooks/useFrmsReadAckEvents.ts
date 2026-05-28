import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import type { FrmsOperationalSnapshotFilters } from './useFrmsOperationalSnapshot';

export type FrmsReadAckEventStatus = 'PENDING' | 'ACKED';

export interface FrmsReadAckEvent {
  id: string;
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  funcionario_nome: string | null;
  event_type: string;
  severity: 'INFO' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
  status: FrmsReadAckEventStatus;
  source: 'OPERATIONAL_SNAPSHOT';
  snapshot_status: string;
  snapshot_alertas: string[];
  checkin_status: string;
  sleep_data_source: string;
  wake_data_source: string;
  jornada_data_source: string;
  fortnight_status: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  acknowledged_by_name: string | null;
  ack_note: string | null;
  limitations: string[];
}

export interface FrmsReadAckSummary {
  total: number;
  pending: number;
  acked: number;
  derived_from_snapshot?: number;
  inserted?: number;
  existing?: number;
}

interface ReadAckApiResponse {
  success: boolean;
  data: FrmsReadAckEvent[];
  summary?: FrmsReadAckSummary;
  error?: string;
}

interface AckApiResponse {
  success: boolean;
  data: FrmsReadAckEvent;
  error?: string;
}

const EMPTY_SUMMARY: FrmsReadAckSummary = {
  total: 0,
  pending: 0,
  acked: 0,
};

function buildEventsUrl(filters: FrmsOperationalSnapshotFilters): string {
  const params = new URLSearchParams({
    data_inicio: filters.data_inicio,
    data_fim: filters.data_fim,
  });

  if (filters.funcionario_id?.trim()) params.set('funcionario_id', filters.funcionario_id.trim());
  return `${API_BASE_URL}/frms/read-ack/events?${params.toString()}`;
}

export function useFrmsReadAckEvents(filters: FrmsOperationalSnapshotFilters) {
  const [events, setEvents] = useState<FrmsReadAckEvent[]>([]);
  const [summary, setSummary] = useState<FrmsReadAckSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBody = useMemo(
    () => ({
      data_inicio: filters.data_inicio,
      data_fim: filters.data_fim,
      funcionario_id: filters.funcionario_id?.trim()
        ? Number(filters.funcionario_id.trim())
        : undefined,
      base: filters.base?.trim() || undefined,
      aeronave: filters.aeronave?.trim() || undefined,
      status: filters.status?.trim() || undefined,
      include_inconsistencies: filters.include_inconsistencies ?? true,
    }),
    [
      filters.aeronave,
      filters.base,
      filters.data_fim,
      filters.data_inicio,
      filters.funcionario_id,
      filters.include_inconsistencies,
      filters.status,
    ],
  );

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(buildEventsUrl(filters), { method: 'GET' });
      const payload = (await response.json()) as ReadAckApiResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Erro ao carregar eventos D1 (HTTP ${response.status})`);
      }
      setEvents(Array.isArray(payload.data) ? payload.data : []);
      setSummary({ ...EMPTY_SUMMARY, ...(payload.summary || {}) });
    } catch (err) {
      setEvents([]);
      setSummary(EMPTY_SUMMARY);
      setError(err instanceof Error ? err.message : 'Erro ao carregar eventos D1');
    } finally {
      setLoading(false);
    }
  }, [filters.data_fim, filters.data_inicio, filters.funcionario_id]);

  const generateEvents = useCallback(async () => {
    setMutating(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/frms/read-ack/events/generate`, {
        method: 'POST',
        body: JSON.stringify(generateBody),
      });
      const payload = (await response.json()) as ReadAckApiResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Erro ao gerar eventos D1 (HTTP ${response.status})`);
      }
      setEvents(Array.isArray(payload.data) ? payload.data : []);
      setSummary({ ...EMPTY_SUMMARY, ...(payload.summary || {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar eventos D1');
    } finally {
      setMutating(false);
    }
  }, [generateBody]);

  const acknowledgeEvent = useCallback(
    async (eventId: string, ackNote?: string | null) => {
      setMutating(true);
      setError(null);
      try {
        const response = await fetchWithAuth(
          `${API_BASE_URL}/frms/read-ack/events/${encodeURIComponent(eventId)}/ack`,
          {
            method: 'POST',
            body: JSON.stringify({ ack_note: ackNote ?? null }),
          },
        );
        const payload = (await response.json()) as AckApiResponse;
        if (!response.ok || !payload.success) {
          throw new Error(
            payload.error || `Erro ao registrar ciencia D1 (HTTP ${response.status})`,
          );
        }
        await fetchEvents();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao registrar ciencia D1');
      } finally {
        setMutating(false);
      }
    },
    [fetchEvents],
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    summary,
    loading,
    mutating,
    error,
    refetch: fetchEvents,
    generateEvents,
    acknowledgeEvent,
  };
}
