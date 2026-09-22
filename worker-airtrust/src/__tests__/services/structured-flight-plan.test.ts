import { describe, expect, it } from 'vitest';
import {
  buildDefaultStructuredFlightPlan,
  buildFplMessage,
  evaluateStructuredFlightPlan,
  normalizeStructuredFlightPlanPayload,
} from '../../services/controle-voos/structured-flight-plan';

describe('structured flight plan', () => {
  it('gera uma perna FPL por par de pontos sem duplicar os dados comuns', () => {
    const payload = buildDefaultStructuredFlightPlan({
      identificacaoAeronave: 'PS-CDV',
      dataOperacional: '2026-09-22',
      horarioPrevistoPartida: '2026-09-22T14:00:00Z',
      horarioPrevistoChegada: '2026-09-22T16:10:00Z',
      modeloAeronave: 'AW139',
      routePoints: [
        { codigo: 'SBME', codigo_icao: 'SBME' },
        { codigo: 'GB', codigo_icao: '9PGB' },
        { codigo: 'SBME', codigo_icao: 'SBME' },
      ],
      plannedPax: 8,
      crewCount: 2,
    });

    expect(payload.comuns.identificacao_aeronave).toBe('PSCDV');
    expect(payload.pernas).toHaveLength(2);
    expect(payload.pernas[0]).toMatchObject({ origem: 'SBME', destino: '9PGB', eobt_utc: '1400', pessoas_bordo: '10' });
    expect(payload.pernas[1]).toMatchObject({ origem: '9PGB', destino: 'SBME', eobt_utc: '' });
    expect(payload.pernas[0].eet).toBe('');
  });

  it('calcula EET automaticamente apenas quando existe uma unica perna', () => {
    const payload = buildDefaultStructuredFlightPlan({
      identificacaoAeronave: 'PS-CDV',
      dataOperacional: '2026-09-22',
      horarioPrevistoPartida: '2026-09-22T14:00:00Z',
      horarioPrevistoChegada: '2026-09-22T15:25:00Z',
      modeloAeronave: 'AW139',
      routePoints: [{ codigo: 'SBME' }, { codigo: '9PGB' }],
      plannedPax: 8,
      crewCount: 2,
    });

    expect(payload.pernas[0].eet).toBe('0125');
  });

  it('so gera previa FPL quando os campos essenciais estao completos', () => {
    const base = buildDefaultStructuredFlightPlan({
      identificacaoAeronave: 'PS-CDV',
      dataOperacional: '2026-09-22',
      horarioPrevistoPartida: '2026-09-22T14:00:00Z',
      horarioPrevistoChegada: '2026-09-22T15:25:00Z',
      modeloAeronave: 'AW139',
      routePoints: [{ codigo: 'SBME' }, { codigo: '9PGB' }],
      plannedPax: 8,
      crewCount: 2,
    });
    expect(evaluateStructuredFlightPlan(base).ready).toBe(false);

    const payload = normalizeStructuredFlightPlanPayload({
      ...base,
      comuns: {
        ...base.comuns,
        regra_voo: 'V',
        tipo_voo: 'G',
        tipo_aeronave: 'A139',
        categoria_esteira: 'L',
        equipamento: 'SDFGRY',
        vigilancia: 'S',
      },
      pernas: [{
        ...base.pernas[0],
        velocidade_cruzeiro: 'N0130',
        nivel_cruzeiro: 'A015',
        rota: 'DCT',
        outros_dados: 'RMK/TESTE',
        autonomia: '0300',
      }],
    }, base);
    const readiness = evaluateStructuredFlightPlan(payload);
    expect(readiness.ready).toBe(true);
    expect(readiness.pernas[0].preview).toBe(buildFplMessage(payload.comuns, payload.pernas[0]));
    expect(readiness.pernas[0].preview).toContain('(FPL-PSCDV-VG');
    expect(readiness.pernas[0].preview).toContain('-SBME1400');
    expect(readiness.pernas[0].preview).toContain('-9PGB0125');
  });
});
