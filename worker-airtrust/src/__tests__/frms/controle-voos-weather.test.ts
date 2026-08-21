import { describe, expect, it } from 'vitest';
import { enrichControleVoosRecordWeather, resolveOperationalTimezone } from '../../lib/frms/controle-voos-weather';
import { RedemetClient } from '../../lib/frms/redemet-weather';
import type { ControleVoosOperationalRecord } from '../../lib/frms/controle-voos-source';

function record(overrides: Partial<ControleVoosOperationalRecord> = {}): ControleVoosOperationalRecord {
  return {
    empresaId: 1,
    identificadorInterno: 'cv:12043:1:73',
    identificadorExterno: '12043',
    identificadorExternoTripulante: '73',
    origem: 'CONTROLE_VOOS',
    origemDados: 'importado',
    tripulanteId: 10,
    funcao: 'PIC',
    dataOperacional: '2026-04-02',
    horaDecolagem: '07:06',
    horaPouso: '07:54',
    timezone: null,
    timezoneFonte: 'INDISPONIVEL',
    vooId: 12043,
    etapaId: 1,
    aeronaveIdentificador: 'PR-ABC',
    origemIcao: 'SBME',
    destinoIcao: 'PMXL',
    statusOperacional: 'REALIZADO',
    statusOperacionalRaw: 'realizado',
    cancelado: false,
    corrigido: false,
    minutosVoo: 48,
    atualizadoEm: '2026-04-03T00:00:00.000Z',
    qualidadeDado: 'completo',
    estadoConflito: null,
    ...overrides,
  };
}

describe('Controle de Voos -> weather enrichment', () => {
  it('prefere timezone explícito do registro e só depois configuração explícita do tenant', () => {
    expect(
      resolveOperationalTimezone(record({ timezone: 'America/Sao_Paulo', timezoneFonte: 'EXPLICITO' }), 'UTC'),
    ).toEqual({ timezoneIana: 'America/Sao_Paulo', source: 'RECORD_EXPLICIT' });

    expect(resolveOperationalTimezone(record(), 'America/Sao_Paulo')).toEqual({
      timezoneIana: 'America/Sao_Paulo',
      source: 'TENANT_OPERATIONAL_CONFIG',
    });

    expect(resolveOperationalTimezone(record(), null)).toEqual({
      timezoneIana: null,
      source: 'UNAVAILABLE',
    });
  });

  it('enriquece SBME usando timezone operacional explicitamente configurado no tenant', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: true,
          message: 200,
          data: {
            data: [
              {
                id_localidade: 'SBME',
                validade_inicial: '2026-04-02 10:00:00',
                mens: 'METAR SBME 021000Z 06010KT 9999 SCT020 29/24 Q1014=',
                recebimento: '2026-04-02 09:58:00',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new RedemetClient({ apiKey: 'segredo-de-teste', fetchImpl: fakeFetch });

    const result = await enrichControleVoosRecordWeather(client, record(), {
      tenantOperationalTimezoneIana: 'America/Sao_Paulo',
    });

    expect(result.timezoneSource).toBe('TENANT_OPERATIONAL_CONFIG');
    expect(result.weather.departure).toMatchObject({
      quality: 'EXACT_STATION',
      stationIcao: 'SBME',
      temperatureC: 29,
      eventAtUtc: '2026-04-02T10:06:00.000Z',
    });
    expect(result.weather.arrival).toMatchObject({
      quality: 'UNAVAILABLE',
      stationIcao: 'PMXL',
    });
  });
});
