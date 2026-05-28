import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useFrmsOperationalSnapshot } from '../useFrmsOperationalSnapshot';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: fetchWithAuthMock,
}));

describe('useFrmsOperationalSnapshot', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('chama endpoint com filtros e retorna data + summary', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [
          {
            empresa_id: 1,
            data_operacional: '2026-05-25',
            funcionario_id: 10,
            tripulante_id: 10,
            nome: 'Max',
            nome_guerra: 'Max',
            funcao: 'PIC',
            base: 'SBSP',
            aeronave: 'AW139',
            escalado: true,
            escala_source: 'SIGVOOS',
            hora_apresentacao: '08:00',
            hora_termino: '18:00',
            horas_voo_minutos: 120,
            duracao_jornada_minutos: 600,
            teve_jornada: true,
            checkin_status: 'RECEBIDO',
            checkin_horario: '07:00:00',
            kss_score: 4,
            horas_sono: 7.5,
            qualidade_sono: 4,
            hora_acordar: '06:30',
            fadiga_score: 35,
            status_operacional_checkin: 'APTO',
            effectiveness_pct: 95.3,
            nivel_fadiga_calculado: 'BAIXO',
            fatorizacao_status: 'CALCULADA',
            sleep_data_source: 'REAL',
            wake_data_source: 'REAL',
            jornada_data_source: 'REAL',
            jornada_origem: 'SIGVOOS',
            snapshot_status: 'OK',
            alertas: [],
          },
        ],
        summary: {
          total_tripulantes: 1,
          total_escalados: 1,
          checkins_recebidos: 1,
          checkins_pendentes: 0,
          alertas_criticos: 0,
          alertas_atencao: 0,
          dados_estimados: 0,
          inconsistencias: 0,
          sem_fatorizacao: 0,
        },
      }),
    });

    const { result } = renderHook(() =>
      useFrmsOperationalSnapshot({
        data_inicio: '2026-05-25',
        data_fim: '2026-05-26',
        funcionario_id: '10',
        base: 'SBSP',
        aeronave: 'AW139',
        status: 'CRITICO',
        include_inconsistencies: true,
      }),
    );

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    });

    const calledUrl = String(fetchWithAuthMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/frms/operational-snapshot?');
    expect(calledUrl).toContain('data_inicio=2026-05-25');
    expect(calledUrl).toContain('data_fim=2026-05-26');
    expect(calledUrl).toContain('funcionario_id=10');
    expect(calledUrl).toContain('base=SBSP');
    expect(calledUrl).toContain('aeronave=AW139');
    expect(calledUrl).toContain('status=CRITICO');
    expect(calledUrl).toContain('include_inconsistencies=true');

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toHaveLength(1);
      expect(result.current.summary.total_tripulantes).toBe(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(2);
  });
});
