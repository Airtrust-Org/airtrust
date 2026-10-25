import { describe, expect, it } from 'vitest';
import { listBombeirosWorkforce } from '../../lib/frms/bombeiros-workforce';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';

const admin: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };

type Row = {
  id: number; empresa_id: number; nome: string; nome_guerra: string | null;
  cargo: string | null; funcao: string | null; cpf?: string; email?: string;
};
function fakeDb(rows: Row[]) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const q = { sql, binds: [] as unknown[] };
      calls.push(q);
      const statement = {
        bind(...bindings: unknown[]) { q.binds = bindings; return statement; },
        async all() { return { results: rows }; },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe('BOA canonical workforce read', () => {
  it('always parameterizes empresa_id, cursor, sector and limit', async () => {
    const { db, calls } = fakeDb([{ id: 21, empresa_id: 130, nome: 'QA Aerotático',
      nome_guerra: 'QA', cargo: 'Bombeiro Militar', funcao: 'Operador Aerotático' }]);
    const access: EmployeeSectorAccess = {
      mode: 'restricted', setorIds: [22, 23], funcionarioId: null,
    };
    const result = await listBombeirosWorkforce(db, 130, access, { cursor: 19, limit: 10 });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/FROM funcionarios f[\s\S]*f.empresa_id = \?[\s\S]*f.deleted_at IS NULL/);
    expect(calls[0].sql).toMatch(/f.setor_id IN \(\?, \?\)/);
    expect(calls[0].binds).toEqual([130, 19, 22, 23, 11]);
    expect(result.items[0].perfil_frms).toBe('flight');
    expect(result.source).toBe('FUNCIONARIOS');
  });

  it('refuses empresa 6 before database read', async () => {
    const { db, calls } = fakeDb([]);
    await expect(listBombeirosWorkforce(db, 6, admin)).rejects.toThrow('BOMBEIROS_INVALID_EMPRESA_CONTEXT');
    expect(calls).toHaveLength(0);
  });

  it('rejects any mixed-tenant database result without exposing employees', async () => {
    const { db } = fakeDb([{ id: 21, empresa_id: 6, nome: 'SECRET_EMPRESA_6',
      nome_guerra: null, cargo: 'Piloto', funcao: null }]);
    await expect(listBombeirosWorkforce(db, 130, admin)).rejects.toThrow('BOMBEIROS_EMPLOYEE_TENANT_INTEGRITY_ERROR');
  });

  it('returns only minimal allowed fields and does not infer aptness', async () => {
    const { db } = fakeDb([
      { id: 21, empresa_id: 130, nome: 'QA 1', nome_guerra: null,
        cargo: 'Bombeiro Militar', funcao: null, cpf: 'SENSITIVE_CPF', email: 'SENSITIVE_EMAIL' },
      { id: 22, empresa_id: 130, nome: 'QA 2', nome_guerra: 'QA2',
        cargo: 'Operador de Guincho', funcao: 'Voo' },
    ]);
    const x = await listBombeirosWorkforce(db, 130, admin);
    expect(x.items.map(i => i.perfil_frms)).toEqual(['other', 'flight']);
    expect(JSON.stringify(x)).not.toMatch(/SENSITIVE_CPF|SENSITIVE_EMAIL|apto_para_voar/);
    expect(x.next_cursor).toBeNull();
  });

  it('has a stable paged cursor without going beyond the configured limit', async () => {
    const { db } = fakeDb([
      { id: 130, empresa_id: 130, nome: 'QA A', nome_guerra: null, cargo: 'Piloto', funcao: null },
      { id: 140, empresa_id: 130, nome: 'QA B', nome_guerra: null, cargo: 'Piloto', funcao: null },
    ]);
    const x = await listBombeirosWorkforce(db, 130, admin, { cursor: 120, limit: 1 });
    expect(x.items).toHaveLength(1);
    expect(x.next_cursor).toBe(130);
  });
});
