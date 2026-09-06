import { describe, expect, it, vi } from 'vitest';
import {
  readPersistedObservedTemperatureMaxC,
  resolveJornadaLandings,
  resolveOperationalLoadForJornada,
} from '../../lib/frms/operational-load-resolver';

function makeDb(handler: (sql: string, binds: unknown[]) => unknown) {
  return {
    prepare: vi.fn((sql: string) => {
      let binds: unknown[] = [];
      const statement = {
        bind: (...values: unknown[]) => {
          binds = values;
          return statement;
        },
        first: async () => handler(sql, binds),
        all: async () => handler(sql, binds),
      };
      return statement;
    }),
  } as unknown as D1Database;
}

describe('resolveJornadaLandings', () => {
  it('sums deduplicated SIGVOOS day+night landings for the crew member/date', async () => {
    const db = makeDb((sql, binds) => {
      expect(sql).toContain('SELECT DISTINCT e.id');
      expect(sql).toContain('t.empresa_id = ?');
      expect(sql).toContain('t.funcionario_id = ?');
      expect(sql).toContain('v.data_programacao = ?');
      expect(binds).toEqual([6, 42, '2026-08-20']);
      return { landings: 5, legs: 3 };
    });

    const result = await resolveJornadaLandings(db, 6, 42, '2026-08-20');
    expect(result).toEqual({ landingsCount: 5, source: 'SIGVOOS_OBSERVED' });
  });

  it('fails closed when the Controle de Voos query returns zero legs without positive coverage evidence', async () => {
    const db = makeDb(() => ({ landings: 0, legs: 0 }));
    expect(await resolveJornadaLandings(db, 6, 42, '2026-08-20')).toEqual({
      landingsCount: 0,
      source: 'SIGVOOS_UNAVAILABLE',
    });
  });

  it('marks SIGVOOS unavailable if the cv_voo_* tables/query are unavailable', async () => {
    const db = makeDb(() => {
      throw new Error('no such table: cv_voo_tripulantes');
    });
    expect(await resolveJornadaLandings(db, 6, 42, '2026-08-20')).toEqual({
      landingsCount: 0,
      source: 'SIGVOOS_UNAVAILABLE',
    });
  });

  it('marks malformed inputs unavailable without touching the database', async () => {
    const handler = vi.fn(() => {
      throw new Error('should not be called');
    });
    const db = makeDb(handler);
    expect(await resolveJornadaLandings(db, 0, 42, '2026-08-20')).toEqual({
      landingsCount: 0,
      source: 'SIGVOOS_UNAVAILABLE',
    });
    expect(await resolveJornadaLandings(db, 6, 42, 'not-a-date')).toEqual({
      landingsCount: 0,
      source: 'SIGVOOS_UNAVAILABLE',
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('readPersistedObservedTemperatureMaxC', () => {
  it('returns the max ambient temp only when the persisted weather source is observed', async () => {
    const db = makeDb(() => ({
      environmental_json: JSON.stringify({ maxAmbientTempC: 33.4, weatherSource: 'DECEA_REDEMET' }),
    }));
    expect(await readPersistedObservedTemperatureMaxC(db, 6, 'jornada-1')).toBe(33.4);
  });

  it('accepts MIXED weather sources', async () => {
    const db = makeDb(() => ({
      environmental_json: JSON.stringify({ maxAmbientTempC: 31, weatherSource: 'MIXED' }),
    }));
    expect(await readPersistedObservedTemperatureMaxC(db, 6, 'jornada-1')).toBe(31);
  });

  it('returns null when the weather evidence is UNAVAILABLE', async () => {
    const db = makeDb(() => ({
      environmental_json: JSON.stringify({ maxAmbientTempC: 33, weatherSource: 'UNAVAILABLE' }),
    }));
    expect(await readPersistedObservedTemperatureMaxC(db, 6, 'jornada-1')).toBeNull();
  });

  it('returns null when there is no persisted evaluation snapshot', async () => {
    const db = makeDb(() => null);
    expect(await readPersistedObservedTemperatureMaxC(db, 6, 'jornada-1')).toBeNull();
  });

  it('fails closed to null on malformed JSON or a missing table', async () => {
    const bad = makeDb(() => ({ environmental_json: '{not json' }));
    expect(await readPersistedObservedTemperatureMaxC(bad, 6, 'j')).toBeNull();
    const noTable = makeDb(() => {
      throw new Error('no such table: frms_jornada_avaliacoes');
    });
    expect(await readPersistedObservedTemperatureMaxC(noTable, 6, 'j')).toBeNull();
  });
});

describe('resolveOperationalLoadForJornada', () => {
  it('combines deduplicated landings with observed temperature', async () => {
    const db = makeDb((sql) => {
      if (sql.includes('cv_voo_tripulantes')) return { landings: 4, legs: 4 };
      if (sql.includes('frms_jornada_avaliacoes')) {
        return {
          environmental_json: JSON.stringify({ maxAmbientTempC: 32, weatherSource: 'DECEA_REDEMET' }),
        };
      }
      return null;
    });

    const result = await resolveOperationalLoadForJornada(db, {
      empresaId: 6,
      funcionarioId: 42,
      dataYmd: '2026-08-20',
      jornadaId: 'jornada-1',
    });

    expect(result.landings_count).toBe(4);
    expect(result.landings_evidence_quality).toBe('OBSERVED');
    expect(result.temperature_max_c).toBe(32);
    expect(result.operational_load_total_delta).toBe(-3);
    expect(result.landings_source).toBe('SIGVOOS_OBSERVED');
    expect(result.data_quality).toBe('COMPLETE');
  });

  it('stays INCOMPLETE (temp = 0 contribution) when flight exists but no observed weather exists', async () => {
    const db = makeDb((sql) => {
      if (sql.includes('cv_voo_tripulantes')) return { landings: 6, legs: 6 };
      return null;
    });

    const result = await resolveOperationalLoadForJornada(db, {
      empresaId: 6,
      funcionarioId: 42,
      dataYmd: '2026-08-20',
      jornadaId: 'jornada-1',
    });

    expect(result.operational_load_landings_delta).toBe(-4);
    expect(result.operational_load_temperature_delta).toBe(0);
    expect(result.operational_load_total_delta).toBe(-4);
    expect(result.weather_evidence_quality).toBe('INCOMPLETE');
    expect(result.data_quality).toBe('INCOMPLETE');
  });

  it('persists SIGVOOS_UNAVAILABLE even if METAR is observed', async () => {
    const db = makeDb((sql) => {
      if (sql.includes('cv_voo_tripulantes')) throw new Error('SIGVOOS schema unavailable');
      if (sql.includes('frms_jornada_avaliacoes')) {
        return {
          environmental_json: JSON.stringify({ maxAmbientTempC: 32, weatherSource: 'DECEA_REDEMET' }),
        };
      }
      return null;
    });

    const result = await resolveOperationalLoadForJornada(db, {
      empresaId: 6,
      funcionarioId: 42,
      dataYmd: '2026-08-20',
      jornadaId: 'jornada-1',
    });

    expect(result.landings_source).toBe('SIGVOOS_UNAVAILABLE');
    expect(result.landings_evidence_quality).toBe('INCOMPLETE');
    expect(result.operational_load_landings_delta).toBe(0);
    expect(result.temperature_max_c).toBe(32);
    expect(result.operational_load_temperature_delta).toBe(-1);
    expect(result.data_quality).toBe('SIGVOOS_UNAVAILABLE');
  });

  it('keeps zero-leg days incomplete until positive source coverage is proven', async () => {
    const db = makeDb((sql) => {
      if (sql.includes('cv_voo_tripulantes')) return { landings: 0, legs: 0 };
      if (sql.includes('frms_jornada_avaliacoes')) return null;
      return null;
    });

    const result = await resolveOperationalLoadForJornada(db, {
      empresaId: 6,
      funcionarioId: 42,
      dataYmd: '2026-08-20',
      jornadaId: 'jornada-1',
    });

    expect(result.landings_source).toBe('SIGVOOS_UNAVAILABLE');
    expect(result.landings_evidence_quality).toBe('INCOMPLETE');
    expect(result.landings_count).toBe(0);
    expect(result.operational_load_landings_delta).toBe(0);
    expect(result.data_quality).toBe('SIGVOOS_UNAVAILABLE');
  });
});
