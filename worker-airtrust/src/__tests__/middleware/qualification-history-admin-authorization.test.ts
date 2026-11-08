import { describe, expect, it, vi } from 'vitest';
import { requireOperationalAccess } from '../../middleware/operational-domain-access';

function runHistoryUpdate({
  role = 'admin',
  empresaId = 7,
  id = '42',
  owned = true,
  flag = 1,
}: {
  role?: string;
  empresaId?: number;
  id?: string;
  owned?: boolean;
  flag?: number | null;
} = {}) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, args });
        return {
          first: async () => {
            if (sql.includes('operational_domain_rbac_enabled')) {
              return { operational_domain_rbac_enabled: flag };
            }
            if (sql.includes('FROM qualificacoes_historico qh')) {
              return owned && args[0] === 42 && args[1] === empresaId ? { id: 42 } : null;
            }
            return null;
          },
        };
      },
    }),
  };
  const c = {
    env: { DB: db },
    get: (key: string) => ({
      empresaId,
      userId: 5,
      userRole: role,
    })[key as 'empresaId' | 'userId' | 'userRole'],
    req: { param: () => id },
  };
  const next = vi.fn(async () => {});
  const middleware = requireOperationalAccess({ action: 'update', resourceType: 'qualificacao_historico' });
  return { execute: () => middleware(c as never, next), next, calls };
}

describe('qualificacoes history admin unclassified edit', () => {
  it('allows an admin to update an existing qualification within their tenant even without a domain', async () => {
    const { execute, next, calls } = runHistoryUpdate();
    await execute();
    expect(next).toHaveBeenCalledOnce();
    expect(calls.some(({ sql, args }) => sql.includes('FROM qualificacoes_historico qh') && args[1] === 7)).toBe(true);
  });

  it('does not allow a cross-tenant or missing history ID', async () => {
    const { execute, next } = runHistoryUpdate({ owned: false });
    await expect(execute()).rejects.toMatchObject({ status: 404 });
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed when the tenant RBAC flag is invalid', async () => {
    const { execute, next } = runHistoryUpdate({ flag: null });
    await expect(execute()).rejects.toBeTruthy();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid historical ID before modifying any row', async () => {
    const { execute, next } = runHistoryUpdate({ id: 'oops' });
    await expect(execute()).rejects.toMatchObject({ status: 400 });
    expect(next).not.toHaveBeenCalled();
  });
});
