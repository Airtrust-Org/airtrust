import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../lib/frms/access', () => ({
  canSeeFrmsTeamScopeForContext: vi.fn(async () => true),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all' })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1=1', bindings: [] })),
}));

import router from '../../routes/frms-fadiga-checkin-legacy';

const calls: Array<{ sql: string; bindings: unknown[] }> = [];

function env(): AppEnv['Bindings'] {
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          calls.push({ sql, bindings });
          return this;
        },
        async all() {
          return {
            results: [
              {
                funcionario_id: 201,
                funcionario_nome: 'Tripulante Com Jornada',
                cargo: 'Piloto',
                quinzena_numero: 2,
                quinzena_inicio: '2026-09-16',
                quinzena_fim: '2026-09-30',
                jornada_id: 'j-201',
                checkin_id: null,
              },
              {
                funcionario_id: 202,
                funcionario_nome: 'Tripulante Sem Dados FRMS',
                cargo: 'Piloto',
                quinzena_numero: 2,
                quinzena_inicio: '2026-09-16',
                quinzena_fim: '2026-09-30',
                jornada_id: null,
                checkin_id: null,
              },
            ],
          };
        },
      };
    },
  };
  return { DB: db } as unknown as AppEnv['Bindings'];
}

describe('GET /daily-fatigue?scope=team — roster da quinzena', () => {
  beforeEach(() => calls.splice(0));

  it('parte da quinzena ativa e preserva tripulante mesmo sem jornada/check-in FRMS', async () => {
    const response = await router.request(
      'http://localhost/daily-fatigue?date=2026-09-27&scope=team',
      { headers: { authorization: 'Bearer synthetic' } },
      env(),
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: Array<Record<string, unknown>> } };
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items.find((item) => item.funcionario_id === 202)).toMatchObject({
      funcionario_nome: 'Tripulante Sem Dados FRMS',
      status: 'no_duty',
      data_source: 'not_applicable',
      calculation_available: false,
    });

    const query = calls.find((call) => call.sql.includes('WITH current_fortnight'));
    expect(query).toBeDefined();
    expect(query!.sql).toContain('JOIN current_fortnight cf');
    expect(query!.sql).toContain("LOWER(TRIM(COALESCE(f.quinzena, '')))");
    expect(query!.sql).toContain('LEFT JOIN frms_jornada fj');
    expect(query!.sql).toContain('LEFT JOIN frms_fadiga_checkin ch');
    expect(query!.bindings.slice(0, 5)).toEqual([6, '2026-09-27', '2026-09-27', '2026-09-27', 6]);
  });
});
