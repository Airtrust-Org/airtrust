import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useFrmsReadAckEvents } from '../useFrmsReadAckEvents';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: fetchWithAuthMock,
}));

describe('useFrmsReadAckEvents', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('lista, gera e registra ciencia em eventos D1', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          summary: { total: 0, pending: 0, acked: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'event-1',
              status: 'PENDING',
              event_type: 'CHECKIN_PENDENTE',
              limitations: ['Nao representa mitigacao.'],
            },
          ],
          summary: { total: 1, pending: 1, acked: 0, inserted: 1 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: 'event-1', status: 'ACKED' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: 'event-1', status: 'ACKED' }],
          summary: { total: 1, pending: 0, acked: 1 },
        }),
      });

    const { result } = renderHook(() =>
      useFrmsReadAckEvents({
        data_inicio: '2026-05-28',
        data_fim: '2026-05-28',
        funcionario_id: '10',
        base: 'SBSP',
        aeronave: 'AW139',
        status: 'CRITICO',
        include_inconsistencies: true,
      }, {
        status: 'STALE',
        event_type: 'CHECKIN_PENDENTE',
        severity: 'CRITICO',
      }),
    );

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));
    expect(String(fetchWithAuthMock.mock.calls[0][0])).toContain('/frms/read-ack/events?');
    expect(String(fetchWithAuthMock.mock.calls[0][0])).toContain('status=STALE');
    expect(String(fetchWithAuthMock.mock.calls[0][0])).toContain('event_type=CHECKIN_PENDENTE');
    expect(String(fetchWithAuthMock.mock.calls[0][0])).toContain('severity=CRITICO');

    await act(async () => {
      await result.current.generateEvents();
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(2);
    expect(String(fetchWithAuthMock.mock.calls[1][0])).toContain('/frms/read-ack/events/generate');
    expect(String(fetchWithAuthMock.mock.calls[1][1].body)).not.toContain('apto_para_voo');
    expect(result.current.summary.pending).toBe(1);

    await act(async () => {
      await result.current.acknowledgeEvent('event-1', 'Ciente.');
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(4);
    expect(String(fetchWithAuthMock.mock.calls[2][0])).toContain('/frms/read-ack/events/event-1/ack');
    expect(result.current.summary.acked).toBe(1);
  });
});
