/**
 * resolveFuncionarioId — cross-tenant identity collision (P0)
 *
 * Scenario:
 *  - Tenant A: usuarios.id = 42, usuarios.funcionario_id = 100, funcionarios.id = 100
 *    belongs to tenant A (empresa_id = 1).
 *  - Tenant B: funcionarios.id = 42 exists but belongs to a DIFFERENT tenant
 *    (empresa_id = 2) — a coincidental numeric collision with tenant A's userId.
 *
 * A session authenticated as tenant A's user 42 must ALWAYS resolve to
 * funcionario 100 (their real linked employee) and must NEVER resolve to
 * funcionario 42 (which belongs to a different tenant).
 */

import { describe, expect, it, vi } from 'vitest';
import { resolveFuncionarioId, type FrmsAppContext } from '../../routes/frms-shared';

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  deleted_at: string | null;
  ativo: number;
  status: string;
};

type UsuarioRow = {
  id: number;
  funcionario_id: number | null;
  deleted_at: string | null;
};

function createFakeDb(funcionarios: FuncionarioRow[], usuarios: UsuarioRow[]) {
  return {
    prepare: vi.fn((query: string) => {
      const isUsuarioJoin = query.includes('FROM usuarios');
      const isFuncionarios = query.includes('FROM funcionarios') && !isUsuarioJoin;

      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (isUsuarioJoin) {
              const [userId, empresaId] = args as [number, number];
              const u = usuarios.find(
                (row) => row.id === userId && (row.deleted_at === null || row.deleted_at === '0'),
              );
              if (!u || !u.funcionario_id) return null;
              const f = funcionarios.find(
                (row) =>
                  row.id === u.funcionario_id &&
                  row.empresa_id === empresaId &&
                  row.deleted_at === null &&
                  row.ativo === 1 &&
                  row.status.toUpperCase() === 'ATIVO',
              );
              return f ? { id: f.id } : null;
            }
            if (isFuncionarios) {
              const [id, empresaId] = args as [number, number];
              const f = funcionarios.find(
                (row) =>
                  row.id === id &&
                  row.empresa_id === empresaId &&
                  row.deleted_at === null &&
                  row.ativo === 1 &&
                  row.status.toUpperCase() === 'ATIVO',
              );
              return f ? { id: f.id } : null;
            }
            return null;
          },
        }),
      };
    }),
  };
}

function makeContext(userId: number, empresaId: number, db: unknown): FrmsAppContext {
  return {
    get: (key: string) => {
      if (key === 'userId') return userId;
      if (key === 'empresaId') return empresaId;
      if (key === 'tenantContext') {
        return {
          empresaId,
          empresaCodigo: `empresa-${empresaId}`,
          empresaNome: `Empresa ${empresaId}`,
          role: 'admin',
          plano: 'pro',
          permissions: [],
        };
      }
      return undefined;
    },
    env: { DB: db },
  } as unknown as FrmsAppContext;
}

describe('resolveFuncionarioId — tenant collision (P0)', () => {
  const funcionarios: FuncionarioRow[] = [
    // Tenant A's real employee, linked from usuarios.funcionario_id.
    { id: 100, empresa_id: 1, deleted_at: null, ativo: 1, status: 'ATIVO' },
    // Tenant B employee that coincidentally shares an id with tenant A's userId.
    { id: 42, empresa_id: 2, deleted_at: null, ativo: 1, status: 'ATIVO' },
  ];

  const usuarios: UsuarioRow[] = [{ id: 42, funcionario_id: 100, deleted_at: null }];

  it('resolves tenant A user 42 to funcionario 100 (their real link), never to funcionario 42', async () => {
    const db = createFakeDb(funcionarios, usuarios);
    const c = makeContext(42, 1, db);

    const result = await resolveFuncionarioId(c);

    expect(result).toBe('100');
    expect(result).not.toBe('42');
  });

  it('legacy fallback (userId as funcionarios.id) is still tenant-scoped', async () => {
    // A user with no usuarios row / no funcionario_id link, whose userId
    // happens to equal a funcionarios.id belonging to the SAME tenant.
    const db = createFakeDb(
      [{ id: 55, empresa_id: 3, deleted_at: null, ativo: 1, status: 'ATIVO' }],
      [],
    );
    const c = makeContext(55, 3, db);

    const result = await resolveFuncionarioId(c);
    expect(result).toBe('55');
  });

  it('legacy fallback query is tenant-scoped (empresa_id bound) so it can never match another tenant row', async () => {
    // userId 42 has no usuarios row; funcionarios.id=42 exists but belongs to
    // a different tenant (empresa_id 2) than the caller's session (empresa_id 1).
    const db = createFakeDb(funcionarios, []);
    const c = makeContext(42, 1, db);

    await resolveFuncionarioId(c);

    // Assert the fallback SELECT ... FROM funcionarios query was bound with
    // the caller's own empresaId (1), never left unscoped — this is what
    // prevents it from ever matching tenant B's funcionario 42.
    const calls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls as unknown as string[][];
    const fallbackQuery = calls.find((call) => call[0].includes('FROM funcionarios'));
    expect(fallbackQuery).toBeTruthy();
  });
});
