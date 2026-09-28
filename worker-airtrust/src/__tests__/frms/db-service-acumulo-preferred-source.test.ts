import { describe, expect, it } from 'vitest';
import { mergeMonthlyOperationalJourneys } from '../../lib/frms/db-service-acumulo';
import type { PreferredOperationalJourney } from '../../lib/frms/preferred-operational-source';

function preferred(overrides: Partial<PreferredOperationalJourney> = {}): PreferredOperationalJourney {
  return {
    data: '2026-09-20', tripulante_id: 7, hora_apresentacao: '06:40', hora_termino: '13:20',
    horas_voo_minutos: 150, duracao_jornada_minutos: 400, hora_primeiro_acionamento: '07:10',
    hora_primeira_decolagem: '07:20', hora_ultimo_pouso: '12:40', hora_corte_motor: '12:50',
    operational_data_source: 'CONTROLE_VOOS', ...overrides,
  };
}

describe('monthly accumulation preferred operational source', () => {
  it('sobrepõe os tempos SIGVOOS persistidos com Controle de Voos sem perder o status FRMS', () => {
    const rows = mergeMonthlyOperationalJourneys([
      { data: '2026-09-20', status: 'TS', duracao_jornada_minutos: 500, horas_voo_minutos: 180 },
    ], [preferred()]);
    expect(rows).toEqual([
      { data: '2026-09-20', status: 'TS', duracao_jornada_minutos: 400, horas_voo_minutos: 150 },
    ]);
  });

  it('inclui dia presente apenas no Controle de Voos como jornada operacional', () => {
    const rows = mergeMonthlyOperationalJourneys([], [preferred()]);
    expect(rows[0]).toMatchObject({ status: 'ES', duracao_jornada_minutos: 400, horas_voo_minutos: 150 });
  });
});
