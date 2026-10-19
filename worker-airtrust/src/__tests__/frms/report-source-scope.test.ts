import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildFuncionarioScopeWhere } from '../../services/employee-sector-access';
import { buscarAlertas } from '../../lib/frms/db-service-alertas';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';

vi.mock('../../lib/frms/db-service-acumulo', () => ({ buscarAcumuloFrota: vi.fn() }));
import { buscarAcumuloFrota } from '../../lib/frms/db-service-acumulo';
import { relatorioMapaFadiga } from '../../lib/frms/db-service-relatorios';

const restricted: EmployeeSectorAccess = { mode: 'restricted', setorIds: [10], funcionarioId: null };
const self: EmployeeSectorAccess = { mode: 'self', setorIds: [11], funcionarioId: 41 };
const blocked: EmployeeSectorAccess = { mode: 'restricted', setorIds: [], funcionarioId: null };

describe('FRMS report SQL aliases and runtime-scoped reads', () => {
  beforeEach(() => vi.mocked(buscarAcumuloFrota).mockReset());

  it.each([
    ['manager', restricted, 'f.setor_id IN', 'p.setor_id IN', [6, 10]],
    ['self', self, 'f.id = ?', 'p.id = ?', [6, 41]],
    ['denied', blocked, '1 = 0', '1 = 0', [6]],
  ])('%s: SQL for rest uses f alias; fleet exposure uses p alias', async (_role, access, restClause, fleetClause, restArgs) => {
    const db = {
      prepare(sql: string) {
        expect(sql).toContain('f.empresa_id = ?');
        expect(sql).toContain(restClause);
        expect(sql).not.toContain('p.setor_id');
        return {
          bind(...args: unknown[]) {
            expect(args).toEqual(restArgs);
            return {
              all: async () => ({ results: [{ tripulante_id: '41', repouso_anterior_min: null, repouso_suficiente: 1, data_referencia: '2026-10-16' }] }),
            };
          },
        };
      },
    } as unknown as D1Database;
    vi.mocked(buscarAcumuloFrota).mockResolvedValue([{
      tripulante_id: '41', nome: 'Simulado',
      pct_dia: 1, pct_7d: 2, pct_mes: 3, pct_365d: 4, nivel_max: 'OK',
      hv_mes_min: 1, hv_7d_min: 1, hv_365d_min: 1, hv_dia_min: 1,
      data_referencia: '2026-10-12',
    }]);
    const rows = await relatorioMapaFadiga(db, 6, access);
    const scope = vi.mocked(buscarAcumuloFrota).mock.calls[0][5];
    expect(scope).toEqual(buildFuncionarioScopeWhere(access, 'p'));
    expect(scope?.clause).toContain(fleetClause);
    expect(rows[0]).toMatchObject({
      repouso_suficiente: null, repouso_estado: 'DESCONHECIDO',
      repouso_referencia: '2026-10-16', exposicao_referencia: '2026-10-12',
    });
  });

  it('historical alert total and rows use exactly the same current sector filter', async () => {
    const calls: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            calls.push({ sql, args });
            return {
              first: async () => ({ total: 1 }),
              all: async () => ({ results: [{ tripulante_id: '41', nivel: 'ATENCAO' }] }),
            };
          },
        };
      },
    } as unknown as D1Database;
    const result = await buscarAlertas(db, { limit: 20 }, 6, buildFuncionarioScopeWhere(restricted, 'f'));
    expect(result.total).toBe(1);
    expect(result.alertas).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('f.setor_id IN (?)');
    expect(calls[1].sql).toContain('f.setor_id IN (?)');
    expect(calls[0].args).toEqual(calls[1].args.slice(0, -2));
    expect(calls[0].args).toContain(6);
    expect(calls[0].args).toContain(10);
  });
});
