import { describe, expect, it } from 'vitest';
import {
  ANAC_PUBLIC_DATA_SOURCES,
  isOfficialAnacPublicDataUrl,
} from '../../services/anac/public-data-catalog';
import {
  mapAnacRabAirworthinessStatus,
  normalizeAnacRabAircraft,
  normalizeBrazilianAircraftRegistration,
} from '../../services/anac/rab-normalization';

describe('ANAC public-data foundation', () => {
  it('keeps every configured source on an official HTTPS ANAC host', () => {
    for (const source of Object.values(ANAC_PUBLIC_DATA_SOURCES)) {
      expect(isOfficialAnacPublicDataUrl(source.metadataUrl)).toBe(true);
      expect(isOfficialAnacPublicDataUrl(source.dataUrl)).toBe(true);
      expect(source.classification).toBe('OFFICIAL_PUBLIC_DATA');
      expect(source.ingestionPolicy).toBe('MINIMIZED_PROJECTION_ONLY');
    }
  });

  it('normalizes Brazilian registrations without accepting arbitrary identifiers', () => {
    expect(normalizeBrazilianAircraftRegistration('prabc')).toBe('PR-ABC');
    expect(normalizeBrazilianAircraftRegistration(' PT-XYZ ')).toBe('PT-XYZ');
    expect(normalizeBrazilianAircraftRegistration('N12345')).toBeNull();
    expect(normalizeBrazilianAircraftRegistration('PR-12A')).toBeNull();
  });

  it('projects only operational RAB aircraft fields and drops personal data', () => {
    const raw = {
      MARCAS: 'PR-ABC',
      'NÚM. SÉRIE': 'AW-12345',
      CATEGORIA: 'TPX',
      'TIPO CERT': 'A139',
      MODELO: 'AW139',
      'NOME FABRICANTE': 'LEONARDO S.P.A.',
      CLASSE: 'H2T',
      PMD: '7.000,00',
      TIPO_ICAO: 'A139',
      'TRIP. MÍN.': '2',
      'PAX MAX': '12',
      ASSENTOS: '15',
      'ANO FAB': '2020',
      'VAL CAV': '31/12/2026',
      'VAL CA': 'INDETERMINADA',
      CD_INTERDICAO: 'N',
      PROPRIETÁRIO: 'Pessoa que nao deve ser copiada',
      OPERADOR: 'Operador que nao deve ser copiado por este projection',
      CPF_CNPJ: '00000000000',
      'DESCRIÇÃO DO GRAVAME': 'texto que nao deve sair da fonte',
    };

    const projected = normalizeAnacRabAircraft(raw);

    expect(projected).toMatchObject({
      source: 'ANAC_RAB_PUBLIC_DATA',
      registration: 'PR-ABC',
      serialNumber: 'AW-12345',
      category: 'TPX',
      typeCertificate: 'A139',
      model: 'AW139',
      manufacturer: 'LEONARDO S.P.A.',
      maximumTakeoffWeight: 7000,
      minimumCrew: 2,
      maximumPassengers: 12,
      manufactureYear: 2020,
      airworthinessCode: 'N',
      airworthinessStatus: 'NORMAL',
    });

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('Pessoa que nao deve ser copiada');
    expect(serialized).not.toContain('Operador que nao deve ser copiado');
    expect(serialized).not.toContain('00000000000');
    expect(serialized).not.toContain('texto que nao deve sair da fonte');
  });

  it('uses ANAC RAB status codes without treating unknown values as normal', () => {
    expect(mapAnacRabAirworthinessStatus('N')).toBe('NORMAL');
    expect(mapAnacRabAirworthinessStatus('X')).toBe('AIRCRAFT_INTERDICTED');
    expect(mapAnacRabAirworthinessStatus('V')).toBe('AIRWORTHINESS_CERTIFICATE_EXPIRED');
    expect(mapAnacRabAirworthinessStatus('unexpected')).toBe('UNKNOWN');
  });
});
