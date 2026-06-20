import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

type AccessPreset = {
  isLegacyPlatformAdmin: boolean;
  hasPersistedPlatformAdmin: boolean;
  source: 'persisted' | 'none';
};

const accessByUserId = new Map<number, AccessPreset>();

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }
      const userId = Number(c.req.header('x-test-user-id') || 10);
      c.set('userId', userId);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 1));
      c.set('userRole', 'admin');
      await next();
    },
}));

vi.mock('../../lib/rbac/platform-access', () => ({
  resolvePlatformAccessState: vi.fn(async (_db: D1Database, userId: number | string) => {
    const normalizedUserId = Number(userId || 0);
    const preset = accessByUserId.get(normalizedUserId) || {
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: false,
      source: 'none' as const,
    };
    return {
      userId: normalizedUserId,
      isLegacyPlatformAdmin: preset.isLegacyPlatformAdmin,
      hasPersistedPlatformAdmin: preset.hasPersistedPlatformAdmin,
      hasSupportReadOnlyRole: false,
      hasSupportElevatedRole: false,
      supportGrants: [],
      source: preset.source,
    };
  }),
  isPlatformAdminAccess: vi.fn((state: any) => state.hasPersistedPlatformAdmin),
}));

import { authRoutes } from '../../routes/auth';

type Empresa = {
  id: number;
  nome: string;
  codigo: string;
  logo_url: string | null;
  modulos_ativos: string | null;
  ativo?: number;
  deleted_at?: string | null;
};

type Link = {
  usuario_id: number;
  empresa_id: number;
  role: string;
  is_primary: number;
};

type UserRow = {
  id: number;
  email: string;
  perfil: string;
  nome: string;
};

const EMPRESAS: Empresa[] = [
  { id: 1, nome: 'AirTrust', codigo: 'airtrust', logo_url: null, modulos_ativos: '["core"]', ativo: 1 },
  { id: 2, nome: 'Tenant A', codigo: 'tenant-a', logo_url: null, modulos_ativos: '["lms"]', ativo: 1 },
  { id: 3, nome: 'Tenant B', codigo: 'tenant-b', logo_url: null, modulos_ativos: '["frms"]', ativo: 1 },
];

const USERS: UserRow[] = [
  { id: 1, email: 'admin@airtrust.com', perfil: 'ADMIN', nome: 'Legacy Admin' },
  { id: 10, email: 'user@airtrust.com', perfil: 'ADMIN', nome: 'Airtrust User' },
  { id: 20, email: 'admin@tenanta.com', perfil: 'ADMIN', nome: 'Tenant Admin' },
  { id: 99, email: 'platform@airtrust.com', perfil: 'ADMIN', nome: 'Platform Admin' },
];

function createAuthApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/auth', authRoutes);
  return app;
}

function createDb(initialLinks: Link[]): D1Database {
  const links = [...initialLinks];

  return {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes("sqlite_master") && sql.includes("name = 'usuarios_empresas'")) {
            return { found: 1 } as T;
          }

          if (sql.includes('SELECT ue.empresa_id') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const link = [...links]
              .filter((item) => item.usuario_id === userId)
              .sort((a, b) => b.is_primary - a.is_primary || a.empresa_id - b.empresa_id)[0];
            return (link ? { empresa_id: link.empresa_id } : null) as T;
          }

          if (sql.includes('SELECT e.id AS empresa_id') && sql.includes('FROM empresas e')) {
            const firstActive = [...EMPRESAS].sort((a, b) => a.id - b.id)[0];
            return (firstActive ? ({ empresa_id: firstActive.id } as T) : (null as T));
          }

          if (sql.includes('FROM empresas e') && sql.includes('WHERE e.id = ?')) {
            const empresaId = Number(statement.params[0]);
            const empresa = EMPRESAS.find((item) => item.id === empresaId);
            return (empresa
              ? ({
                  role: 'admin',
                  empresa_id: empresa.id,
                  empresa_nome: empresa.nome,
                  empresa_codigo: empresa.codigo,
                } as T)
              : null) as T;
          }

          if (sql.includes('FROM usuarios_empresas ue') && sql.includes('ue.empresa_id = ?')) {
            const userId = Number(statement.params[0]);
            const empresaId = Number(statement.params[1]);
            const link = links.find((item) => item.usuario_id === userId && item.empresa_id === empresaId);
            if (!link) return null as T;
            const empresa = EMPRESAS.find((item) => item.id === empresaId);
            if (!empresa) return null as T;
            return {
              role: link.role,
              empresa_id: empresa.id,
              empresa_nome: empresa.nome,
              empresa_codigo: empresa.codigo,
            } as T;
          }

          if (sql.includes('SELECT ue.role') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const empresaId = Number(statement.params[1]);
            const link = links.find((item) => item.usuario_id === userId && item.empresa_id === empresaId);
            return (link ? ({ role: link.role } as T) : (null as T));
          }

          if (sql.includes('FROM usuarios') && sql.includes('WHERE id = ?')) {
            const userId = Number(statement.params[0]);
            const user = USERS.find((item) => item.id === userId);
            return (user || null) as T;
          }

          return null as T;
        },
        async all<T>() {
          if (sql.includes('FROM empresas e') && !sql.includes('FROM usuarios_empresas ue')) {
            const empresaAtualId = Number(statement.params[0]);
            return {
              results: EMPRESAS.map((empresa) => ({
                ...empresa,
                role: 'admin',
                is_primary: empresa.id === empresaAtualId ? 1 : 0,
                is_current: empresa.id === empresaAtualId ? 1 : 0,
              })),
            } as T;
          }

          if (sql.includes('FROM usuarios_empresas ue')) {
            const empresaAtualId = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            const linkedEmpresaIds = new Set(
              links.filter((link) => link.usuario_id === userId).map((link) => link.empresa_id),
            );

            return {
              results: EMPRESAS.filter((empresa) => linkedEmpresaIds.has(empresa.id)).map((empresa) => {
                const link = links.find((item) => item.usuario_id === userId && item.empresa_id === empresa.id);
                return {
                  ...empresa,
                  role: link?.role ?? 'member',
                  is_primary: link?.is_primary ?? 0,
                  is_current: empresa.id === empresaAtualId ? 1 : 0,
                };
              }),
            } as T;
          }

          return { results: [] } as T;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO usuarios_empresas')) {
            const [usuarioIdRaw, empresaIdRaw] = statement.params;
            const usuario_id = Number(usuarioIdRaw);
            const empresa_id = Number(empresaIdRaw);
            const exists = links.some((item) => item.usuario_id === usuario_id && item.empresa_id === empresa_id);
            if (!exists) {
              links.push({ usuario_id, empresa_id, role: 'admin', is_primary: 0 });
            }
            return { meta: { changes: exists ? 0 : 1 } };
          }

          if (sql.includes('UPDATE usuarios_empresas') && sql.includes('SET is_primary')) {
            const targetEmpresaId = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            links.forEach((link) => {
              if (link.usuario_id === userId) {
                link.is_primary = link.empresa_id === targetEmpresaId ? 1 : 0;
              }
            });
            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

async function hit(
  db: D1Database,
  path: string,
  options?: { method?: 'GET' | 'POST'; userId?: number; body?: unknown },
) {
  const app = createAuthApp();
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: options?.method || 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        'x-test-user-id': String(options?.userId || 10),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    }),
    { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
    {} as ExecutionContext,
  );
}

describe('auth platform admin boundaries', () => {
  beforeEach(() => {
    accessByUserId.clear();
  });

  it('userId=1 with explicit platform role lists all empresas and selects unlinked tenant', async () => {
    accessByUserId.set(1, {
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: true,
      source: 'persisted',
    });
    const db = createDb([{ usuario_id: 1, empresa_id: 1, role: 'admin', is_primary: 1 }]);

    const empresasResp = await hit(db, '/api/auth/empresas', { userId: 1 });
    const empresasJson = (await empresasResp.json()) as any;
    expect(empresasResp.status).toBe(200);
    expect(empresasJson.data.empresas).toHaveLength(3);

    const selectResp = await hit(db, '/api/auth/select-empresa', {
      method: 'POST',
      userId: 1,
      body: { empresaId: 3 },
    });
    const selectJson = (await selectResp.json()) as any;
    expect(selectResp.status).toBe(200);
    expect(selectJson.data.empresa.id).toBe(3);
  });

  it('userId=1 without persisted role does not receive platform bridge behavior', async () => {
    accessByUserId.set(1, {
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: false,
      source: 'none',
    });
    const db = createDb([{ usuario_id: 1, empresa_id: 1, role: 'admin', is_primary: 1 }]);

    const response = await hit(db, '/api/auth/empresas', { userId: 1 });
    const json = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(json.data.empresas).toHaveLength(1);
    expect(json.data.empresas[0].codigo).toBe('airtrust');
  });

  it('regular user in airtrust tenant is not platform admin and cannot select arbitrary empresa', async () => {
    const db = createDb([{ usuario_id: 10, empresa_id: 1, role: 'admin', is_primary: 1 }]);

    const empresasResp = await hit(db, '/api/auth/empresas', { userId: 10 });
    const empresasJson = (await empresasResp.json()) as any;
    expect(empresasResp.status).toBe(200);
    expect(empresasJson.data.empresas).toHaveLength(1);
    expect(empresasJson.data.empresas[0].codigo).toBe('airtrust');

    const selectResp = await hit(db, '/api/auth/select-empresa', {
      method: 'POST',
      userId: 10,
      body: { empresaId: 3 },
    });
    expect(selectResp.status).toBeGreaterThanOrEqual(400);
  });

  it('tenant admin without platform role does not list/select outside linked tenant', async () => {
    const db = createDb([{ usuario_id: 20, empresa_id: 2, role: 'admin', is_primary: 1 }]);

    const empresasResp = await hit(db, '/api/auth/empresas', { userId: 20 });
    const empresasJson = (await empresasResp.json()) as any;
    expect(empresasResp.status).toBe(200);
    expect(empresasJson.data.empresas).toHaveLength(1);
    expect(empresasJson.data.empresas[0].codigo).toBe('tenant-a');

    const selectResp = await hit(db, '/api/auth/select-empresa', {
      method: 'POST',
      userId: 20,
      body: { empresaId: 1 },
    });
    expect(selectResp.status).toBeGreaterThanOrEqual(400);
  });

  it('explicit platform admin not equal to userId=1 receives platform access', async () => {
    accessByUserId.set(99, {
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: true,
      source: 'persisted',
    });
    const db = createDb([{ usuario_id: 99, empresa_id: 2, role: 'admin', is_primary: 1 }]);

    const empresasResp = await hit(db, '/api/auth/empresas', { userId: 99 });
    const empresasJson = (await empresasResp.json()) as any;
    expect(empresasResp.status).toBe(200);
    expect(empresasJson.data.empresas).toHaveLength(3);

    const selectResp = await hit(db, '/api/auth/select-empresa', {
      method: 'POST',
      userId: 99,
      body: { empresaId: 1 },
    });
    const selectJson = (await selectResp.json()) as any;
    expect(selectResp.status).toBe(200);
    expect(selectJson.data.empresa.id).toBe(1);
  });
});
