import { describe, expect, it } from 'vitest';
vi.mock('../../lib/frms/parameter-governance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/parameter-governance')>();
  return {
    ...actual,
    resolveFrmsOperationalContext: vi.fn(async () => ({
      empresaId: 42, profileCode: 'HELICOPTER_OFFSHORE', regulatoryProfileId: 'profile-42',
      configRevisionId: 'rev-42', modelVersion: 'TEST', effectiveFrom: '2026-01-01', effectiveTo: null,
      parameters: {}, cyclePolicyApproved: true, fadigaPolicy: {} as never, fortnightPolicy: {} as never,
    })),
    asOperationalLimitesMap: vi.fn(() => ({ FDP_MAXIMO_HORAS: 11, HV_DIARIA_HORAS: 8, HV_MES_HORAS: 90 })),
  };
});

import { buscarJornadas } from '../../lib/frms/db-service-jornadas';

function createDb() {
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      const stmt: any = {
        bind() {
          return stmt;
        },
        async first() {
          if (sql.includes('FROM funcionarios')) return { empresa_id: 42 };
          if (sql.includes('SELECT COUNT(*)')) return { total: 0 };
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, queries };
}

describe('buscarJornadas — legacy check-in placeholders', () => {
  it('exclui FRMS_CHECKIN_AUTO vazio tanto do total quanto da listagem mensal', async () => {
    const { db, queries } = createDb();

    const result = await buscarJornadas(db, '66', { mes: '2026-09' });

    expect(result.total).toBe(0);
    expect(result.data).toEqual([]);
    const journeyQueries = queries.filter((sql) => sql.includes('FROM frms_jornada j'));
    expect(journeyQueries).toHaveLength(2);
    for (const sql of journeyQueries) {
      expect(sql).toContain("COALESCE(j.registrado_por, '') = 'FRMS_CHECKIN_AUTO'");
      expect(sql).toContain("UPPER(COALESCE(j.origem, '')) = 'MANUAL'");
      expect(sql).toContain('COALESCE(j.horas_voo_minutos, 0) = 0');
      expect(sql).toContain('COALESCE(j.duracao_jornada_minutos, 0) = 0');
      expect(sql).toContain('j.hora_termino IS NULL');
    }
  });
});
