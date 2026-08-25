import { describe, expect, it, vi } from 'vitest';
import {
  hasMaintenanceCapability,
  MAINTENANCE_CAPABILITIES,
} from '../../middleware/maintenance-access';

function createContext(db: D1Database, userId = 101, empresaId = 10) {
  return {
    env: { DB: db },
    get: (key: string) => {
      if (key === 'userId') return userId;
      if (key === 'empresaId') return empresaId;
      return undefined;
    },
  } as any;
}

function createDb(options: {
  permission?: 'GRANT' | 'DENY' | null;
  permissionError?: Error;
  role?: string;
} = {}) {
  const { permission = null, permissionError, role = 'admin' } = options;

  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('usuario_permissoes')) {
        return {
          bind: vi.fn().mockReturnValue({
            all: permissionError
              ? vi.fn().mockRejectedValue(permissionError)
              : vi.fn().mockResolvedValue({
                  results: permission ? [{ tipo: permission }] : [],
                }),
          }),
        };
      }

      if (sql.includes('usuarios_empresas')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ role }),
          }),
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    }),
  } as unknown as D1Database;
}

describe('maintenance capability authorization', () => {
  it('fails closed when the permission override store cannot be read', async () => {
    const db = createDb({
      permissionError: new Error('D1 unavailable'),
      role: 'admin',
    });

    await expect(
      hasMaintenanceCapability(
        createContext(db),
        MAINTENANCE_CAPABILITIES.frmsExecutar,
      ),
    ).resolves.toBe(false);

    expect((db.prepare as any).mock.calls).toHaveLength(1);
  });

  it('keeps an explicit DENY stronger than the tenant role', async () => {
    const db = createDb({ permission: 'DENY', role: 'admin' });

    await expect(
      hasMaintenanceCapability(
        createContext(db),
        MAINTENANCE_CAPABILITIES.frmsExecutar,
      ),
    ).resolves.toBe(false);
  });

  it('keeps an explicit GRANT stronger than the tenant role', async () => {
    const db = createDb({ permission: 'GRANT', role: 'viewer' });

    await expect(
      hasMaintenanceCapability(
        createContext(db),
        MAINTENANCE_CAPABILITIES.frmsExecutar,
      ),
    ).resolves.toBe(true);
  });

  it('falls back to the tenant role only when the override lookup succeeds', async () => {
    const managerDb = createDb({ role: 'manager' });

    await expect(
      hasMaintenanceCapability(
        createContext(managerDb),
        MAINTENANCE_CAPABILITIES.frmsVisualizar,
      ),
    ).resolves.toBe(true);

    await expect(
      hasMaintenanceCapability(
        createContext(createDb({ role: 'manager' })),
        MAINTENANCE_CAPABILITIES.frmsExecutar,
      ),
    ).resolves.toBe(false);
  });
});
