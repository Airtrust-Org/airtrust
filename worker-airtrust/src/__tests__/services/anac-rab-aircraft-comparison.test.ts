import { describe, expect, it } from 'vitest';
import { compareAirTrustAircraftWithAnacRab } from '../../services/anac/rab-aircraft-comparison';
import { normalizeAnacRabAircraft } from '../../services/anac/rab-normalization';

function rabAircraft() {
  const aircraft = normalizeAnacRabAircraft({
    MARCAS: 'PR-ABC',
    MODELO: 'AW139',
    'NOME FABRICANTE': 'LEONARDO S.P.A.',
    'ANO FAB': 2020,
    CD_INTERDICAO: 'N',
  });
  if (!aircraft) throw new Error('synthetic RAB aircraft must normalize');
  return aircraft;
}

describe('AirTrust aircraft x ANAC RAB comparison', () => {
  it('reports a clean match without ever allowing automatic application', () => {
    const result = compareAirTrustAircraftWithAnacRab(
      {
        id: 10,
        tenantId: 7,
        registration: 'prabc',
        model: 'AW139',
        manufacturer: 'Leonardo S.p.A.',
        manufactureYear: 2020,
      },
      rabAircraft(),
    );

    expect(result.classification).toBe('READ_ONLY_REFERENCE_COMPARISON');
    expect(result.canAutoApply).toBe(false);
    expect(result.requiresHumanReview).toBe(false);
    expect(result.findings.every((finding) => finding.state === 'MATCH')).toBe(true);
  });

  it('flags divergences and missing AirTrust fields for review', () => {
    const result = compareAirTrustAircraftWithAnacRab(
      {
        id: 10,
        tenantId: 7,
        registration: 'PR-ABC',
        model: 'AB139',
        manufacturer: null,
        manufactureYear: 2019,
      },
      rabAircraft(),
    );

    expect(result.requiresHumanReview).toBe(true);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        { field: 'registration', state: 'MATCH' },
        { field: 'model', state: 'MISMATCH' },
        { field: 'manufacturer', state: 'AIRTRUST_VALUE_MISSING' },
        { field: 'manufactureYear', state: 'MISMATCH' },
      ]),
    );
  });

  it('does not treat an ANAC missing value as a tenant value to erase', () => {
    const rab = rabAircraft();
    rab.manufacturer = null;

    const result = compareAirTrustAircraftWithAnacRab(
      {
        id: 10,
        tenantId: 7,
        registration: 'PR-ABC',
        model: 'AW139',
        manufacturer: 'Leonardo',
        manufactureYear: 2020,
      },
      rab,
    );

    expect(result.findings).toContainEqual({
      field: 'manufacturer',
      state: 'ANAC_VALUE_MISSING',
    });
    expect(result.canAutoApply).toBe(false);
  });
});
