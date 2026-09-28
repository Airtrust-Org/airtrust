import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import type { ControleVoosOperationalRecord } from '../../lib/frms/controle-voos-source';

const { fetchControleVoosOperationalRecordsMock } = vi.hoisted(() => ({
  fetchControleVoosOperationalRecordsMock: vi.fn(),
}));

vi.mock('../../lib/frms/controle-voos-source', () => ({
  fetchControleVoosOperationalRecords: (...args: unknown[]) =>
    fetchControleVoosOperationalRecordsMock(...args),
}));

import { loadPreferredOperationalJourneys } from '../../lib/frms/preferred-operational-source';

function cv(): ControleVoosOperationalRecord {
  return {
    empresaId: 6, identificadorInterno: 'v1-e1-t7', identificadorExterno: null,
    identificadorExternoTripulante: null, origem: 'CONTROLE_VOOS', origemDados: 'manual_interno',
    tripulanteId: 7, funcao: 'PIC', horaApresentacao: '07:00', horaDispensa: '12:30',
    dataOperacional: '2026-09-27', horaMotorLigado: '07:30', horaDecolagem: '08:00',
    horaPouso: '10:00', horaMotorDesligado: '10:15', timezone: null,
    timezoneFonte: 'INDISPONIVEL', vooId: 1, etapaId: 1, aeronaveIdentificador: 'PS-CDV',
    origemIcao: 'SBME', destinoIcao: '9PGB', statusOperacional: 'REALIZADO',
    statusOperacionalRaw: 'concluido', cancelado: false, corrigido: false,
    minutosVoo: 120, minutosTotal: 165, pousos: 1, atualizadoEm: null,
    qualidadeDado: 'completo', estadoConflito: null,
  };
}

function dbWithLegacyResult(result: unknown): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(() => result),
      })),
    })),
  } as unknown as D1Database;
}

describe('FRMS preferred operational source resilience', () => {
  beforeEach(() => {
    fetchControleVoosOperationalRecordsMock.mockReset();
  });

  it('mantém Controle de Voos disponível quando a leitura SIGVOOS falha', async () => {
    fetchControleVoosOperationalRecordsMock.mockResolvedValue([cv()]);
    const db = dbWithLegacyResult(Promise.reject(new Error('legacy schema unavailable')));

    const rows = await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tripulante_id: 7,
      operational_data_source: 'CONTROLE_VOOS',
      hora_apresentacao: '07:00',
    });
  });

  it('mantém SIGVOOS como fallback quando Controle de Voos falha', async () => {
    fetchControleVoosOperationalRecordsMock.mockRejectedValue(new Error('cv unavailable'));
    const db = dbWithLegacyResult(Promise.resolve({
      results: [{
        data: '2026-09-27', tripulante_id: 7, hora_apresentacao: '06:45',
        hora_termino: '13:00', horas_voo_minutos: 150, duracao_jornada_minutos: 375,
        hora_primeiro_acionamento: '07:10', hora_primeira_decolagem: '07:20',
        hora_ultimo_pouso: '12:40', hora_corte_motor: '12:50',
      }],
    }));

    const rows = await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');

    expect(rows).toHaveLength(1);
    expect(rows[0].operational_data_source).toBe('SIGVOOS');
  });

  it('falha explicitamente apenas quando as duas fontes operacionais estão indisponíveis', async () => {
    fetchControleVoosOperationalRecordsMock.mockRejectedValue(new Error('cv unavailable'));
    const db = dbWithLegacyResult(Promise.reject(new Error('legacy unavailable')));

    await expect(
      loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27'),
    ).rejects.toThrow('FRMS_OPERATIONAL_SOURCES_UNAVAILABLE');
  });
});
