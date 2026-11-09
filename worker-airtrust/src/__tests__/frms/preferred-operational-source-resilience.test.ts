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

  it('restringe SIGVOOS ao mesmo tenant da jornada e do funcionário', async () => {
    fetchControleVoosOperationalRecordsMock.mockResolvedValue([]);
    const prepare = vi.fn(() => ({
      bind: vi.fn((...params: unknown[]) => {
        expect(params).toEqual([6, '2026-09-27', '2026-09-27']);
        return { all: vi.fn().mockResolvedValue({ results: [] }) };
      }),
    }));
    const db = { prepare } as unknown as D1Database;
    await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');
    const sql = String(prepare.mock.calls[0]?.[0]);
    expect(sql).toContain('f.empresa_id = ?');
    expect(sql).toMatch(/j\.empresa_id\s*=\s*f\.empresa_id/);
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

  it('usa Controle de Voos quando prepare do legado lança erro síncrono', async () => {
    fetchControleVoosOperationalRecordsMock.mockResolvedValue([cv()]);
    const db = { prepare: vi.fn(() => { throw new Error('LEGACY_SCHEMA_SYNC_FAILURE'); }) } as unknown as D1Database;
    const rows = await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');
    expect(rows).toHaveLength(1);
    expect(rows[0].operational_data_source).toBe('CONTROLE_VOOS');
    expect(fetchControleVoosOperationalRecordsMock).toHaveBeenCalledOnce();
  });

  it('usa SIGVOOS quando a consulta CV lança erro síncrono', async () => {
    fetchControleVoosOperationalRecordsMock.mockImplementation(() => { throw new Error('CV_SYNC_FAILURE'); });
    const db = dbWithLegacyResult(Promise.resolve({ results: [{
      data: '2026-09-27', tripulante_id: 7, hora_apresentacao: '06:45',
      hora_termino: '13:00', horas_voo_minutos: 150, duracao_jornada_minutos: 375,
    }] }));
    const rows = await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');
    expect(rows).toHaveLength(1);
    expect(rows[0].operational_data_source).toBe('SIGVOOS');
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

  it('não registra mensagens brutas do D1/CV nos logs quando o fallback funciona', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      fetchControleVoosOperationalRecordsMock.mockResolvedValue([cv()]);
      const secret = 'SQL contains confidential operational data / Bearer sensitive-token';
      const db = dbWithLegacyResult(Promise.reject(new Error(secret)));
      const rows = await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');
      expect(rows).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('SIGVOOS fallback unavailable'),
        expect.objectContaining({ reason: 'SOURCE_QUERY_FAILED' }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    } finally {
      warn.mockRestore();
    }
  });

  it('não registra mensagens brutas de erro do Controle de Voos', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const secret = 'tripulante confidential record / Bearer sensitive-token';
      fetchControleVoosOperationalRecordsMock.mockRejectedValue(new Error(secret));
      const db = dbWithLegacyResult(Promise.resolve({ results: [{
        data: '2026-09-27', tripulante_id: 7, hora_apresentacao: '06:45',
        hora_termino: '13:00', horas_voo_minutos: 150, duracao_jornada_minutos: 375,
      }] }));
      const rows = await loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27');
      expect(rows).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Controle de Voos unavailable'),
        expect.objectContaining({ reason: 'SOURCE_QUERY_FAILED' }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    } finally {
      warn.mockRestore();
    }
  });

  it('falha explicitamente apenas quando as duas fontes operacionais estão indisponíveis', async () => {
    fetchControleVoosOperationalRecordsMock.mockRejectedValue(new Error('cv unavailable'));
    const db = dbWithLegacyResult(Promise.reject(new Error('legacy unavailable')));

    await expect(
      loadPreferredOperationalJourneys(db, 6, '2026-09-27', '2026-09-27'),
    ).rejects.toThrow('FRMS_OPERATIONAL_SOURCES_UNAVAILABLE');
  });
});
