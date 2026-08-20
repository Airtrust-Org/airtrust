import { describe, expect, it } from 'vitest';
import {
  RedemetClient,
  calculateRelativeHumidityPct,
  enrichFlightLegWeatherFromRedemet,
  localDateTimeToUtcIso,
  parseMetarCore,
  selectMetarObservation,
  type RedemetMetarRow,
} from '../../lib/frms/redemet-weather';

describe('FRMS REDEMET weather enrichment', () => {
  const rows: RedemetMetarRow[] = [
    {
      id_localidade: 'SBME',
      validade_inicial: '2026-04-02 09:00:00',
      mens: 'METAR SBME 020900Z 04008KT 9999 FEW020 27/23 Q1014=',
      recebimento: '2026-04-02 08:58:00',
    },
    {
      id_localidade: 'SBME',
      validade_inicial: '2026-04-02 10:00:00',
      mens: 'METAR SBME 021000Z 06010KT 9999 SCT020 29/24 Q1014=',
      recebimento: '2026-04-02 09:58:00',
    },
  ];

  it('decodifica temperatura, ponto de orvalho, vento e UR derivada sem chamar WBGT de medido', () => {
    const parsed = parseMetarCore('METAR SBME 021000Z 06010KT 9999 SCT020 29/24 Q1014=');
    expect(parsed.temperatureC).toBe(29);
    expect(parsed.dewPointC).toBe(24);
    expect(parsed.windSpeedKt).toBe(10);
    expect(parsed.relativeHumidityPct).toBeCloseTo(calculateRelativeHumidityPct(29, 24)!, 1);
  });

  it('converte 07:06 America/Sao_Paulo em 10:06Z em 02/04/2026', () => {
    expect(localDateTimeToUtcIso('2026-04-02', '07:06', 'America/Sao_Paulo')).toBe(
      '2026-04-02T10:06:00.000Z',
    );
  });

  it('trata pouso após meia-noite como dia operacional seguinte', async () => {
    const requested: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ status: true, message: 200, data: { data: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new RedemetClient({ apiKey: 'segredo-de-teste', fetchImpl: fakeFetch });
    const result = await enrichFlightLegWeatherFromRedemet(client, {
      departureIcao: 'SBME',
      arrivalIcao: 'SBJR',
      dataOperacional: '2026-04-02',
      takeoffLocal: '23:30',
      landingLocal: '00:30',
      timezoneIana: 'America/Sao_Paulo',
    });
    expect(result.arrival).toMatchObject({ eventAtUtc: '2026-04-03T03:30:00.000Z' });
    expect(requested[0]).toContain('data_fim=2026040304');
  });

  it('seleciona a observacao exata mais recente anterior ao evento', () => {
    const evidence = selectMetarObservation(rows, 'SBME', new Date('2026-04-02T10:06:00.000Z'));
    expect(evidence).toMatchObject({
      stationIcao: 'SBME',
      observedAtUtc: '2026-04-02T10:00:00.000Z',
      eventAtUtc: '2026-04-02T10:06:00.000Z',
      temperatureC: 29,
      dewPointC: 24,
      quality: 'EXACT_STATION',
      selectionMode: 'LATEST_AT_OR_BEFORE',
    });
    expect(evidence?.ageMinutes).toBe(6);
  });

  it('não fabrica weather de destino quando a estação não existe', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ status: true, message: 200, data: { data: rows, total: rows.length } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new RedemetClient({ apiKey: 'segredo-de-teste', fetchImpl: fakeFetch });

    const result = await enrichFlightLegWeatherFromRedemet(client, {
      departureIcao: 'SBME',
      arrivalIcao: 'PMXL',
      dataOperacional: '2026-04-02',
      takeoffLocal: '07:06',
      landingLocal: '07:54',
      timezoneIana: 'America/Sao_Paulo',
    });

    expect(result.departure).toMatchObject({
      quality: 'EXACT_STATION',
      stationIcao: 'SBME',
      temperatureC: 29,
    });
    expect(result.arrival).toMatchObject({
      quality: 'UNAVAILABLE',
      stationIcao: 'PMXL',
      reason: 'SEM_OBSERVACAO_COMPATIVEL',
    });
  });

  it('falha conservadoramente quando timezone não está configurado', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('não deveria consultar REDEMET');
    };
    const client = new RedemetClient({ apiKey: 'segredo-de-teste', fetchImpl: fakeFetch });
    const result = await enrichFlightLegWeatherFromRedemet(client, {
      departureIcao: 'SBME',
      arrivalIcao: 'SBJR',
      dataOperacional: '2026-04-02',
      takeoffLocal: '07:06',
      landingLocal: '08:05',
      timezoneIana: null,
    });
    expect(result.departure).toMatchObject({
      quality: 'UNAVAILABLE',
      reason: 'TIMEZONE_NAO_CONFIGURADO',
    });
    expect(result.arrival).toMatchObject({
      quality: 'UNAVAILABLE',
      reason: 'TIMEZONE_NAO_CONFIGURADO',
    });
  });
});
