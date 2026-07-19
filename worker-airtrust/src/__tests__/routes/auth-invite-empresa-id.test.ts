import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/rate-limit')>();
  return {
    ...actual,
    rateLimiter:
      () =>
      async (_c: any, next: () => Promise<void>) => {
        await next();
      },
  };
});

vi.mock('../../utils/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/security')>();
  return {
    ...actual,
    hashPassword: vi.fn(async () => 'hashed-invite-password'),
  };
});

import { authRoutes } from '../../routes/auth';
import { buildInviteLink } from '../../routes/admin-usuarios';

type MockInvite = {
  id: number;
  token: string;
  usuario_id: number;
  empresa_id: number;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
};

type MockLink = {
  usuario_id: number;
  empresa_id: number;
  role: string;
  is_primary: number;
};

function createAuthApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/auth', authRoutes);
  return app;
}

function createDb(
  initialInvites: MockInvite[],
  initialLinks: MockLink[] = [],
  initialSetorLinks: Array<{ usuario_id: number; empresa_id: number }> = [],
) {
  const invites = initialInvites.map((invite) => ({ ...invite }));
  const links = initialLinks.map((link) => ({ ...link }));
  const setorLinks = initialSetorLinks.map((link) => ({ ...link }));
  const users = new Map<number, { password_hash: string | null; active: number }>();

  for (const invite of invites) {
    users.set(invite.usuario_id, { password_hash: null, active: 0 });
  }

  const queries: string[] = [];

  const db = {
    prepare(sql: string) {
      queries.push(sql);
      if (sql.includes('LOWER(dominio)') || sql.includes('empresas.dominio')) {
        throw new Error('invite flow must not resolve tenant by email domain');
      }

      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes('FROM convites_usuarios') && sql.includes('WHERE token = ?')) {
            const token = String(statement.params[0] || '');
            const invite = invites.find((item) => item.token === token);
            return (invite || null) as T;
          }

          if (sql.includes('SELECT CASE WHEN datetime(?) <= datetime')) {
            const expiresAt = String(statement.params[0] || '');
            return { expired: expiresAt <= '2000-01-01 00:00:00' ? 1 : 0 } as T;
          }

          if (sql.includes('FROM setores_gestores') && sql.includes('WHERE usuario_id = ?')) {
            const [usuarioIdRaw, empresaIdRaw] = statement.params;
            const hasSetor = setorLinks.some(
              (link) =>
                link.usuario_id === Number(usuarioIdRaw) &&
                link.empresa_id === Number(empresaIdRaw),
            );
            return (hasSetor ? { id: 1 } : null) as T;
          }

          return null as T;
        },
        async all<T>() {
          if (sql.includes("PRAGMA table_info('usuarios')")) {
            return { results: [{ name: 'active' }] } as T;
          }

          return { results: [] } as T;
        },
        async run() {
          if (sql.includes('UPDATE usuarios SET password_hash = ?')) {
            const [passwordHashRaw, userIdRaw] = statement.params;
            const userId = Number(userIdRaw);
            users.set(userId, {
              password_hash: String(passwordHashRaw || ''),
              active: 1,
            });
            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT OR IGNORE INTO usuarios_empresas')) {
            const [userIdRaw, empresaIdRaw, roleRaw, primaryUserIdRaw] = statement.params;
            const usuario_id = Number(userIdRaw);
            const empresa_id = Number(empresaIdRaw);
            const exists = links.some(
              (link) => link.usuario_id === usuario_id && link.empresa_id === empresa_id,
            );

            if (!exists) {
              const hasPrimary = links.some(
                (link) => link.usuario_id === Number(primaryUserIdRaw) && link.is_primary === 1,
              );
              links.push({
                usuario_id,
                empresa_id,
                role: String(roleRaw || 'member'),
                is_primary: hasPrimary ? 0 : 1,
              });
            }

            return { meta: { changes: exists ? 0 : 1 } };
          }

          if (sql.includes('UPDATE usuarios_empresas') && sql.includes('SET role = ?')) {
            const [roleRaw, userIdRaw, empresaIdRaw] = statement.params;
            const link = links.find(
              (item) =>
                item.usuario_id === Number(userIdRaw) && item.empresa_id === Number(empresaIdRaw),
            );
            if (link) {
              link.role = String(roleRaw || 'member');
            }
            return { meta: { changes: link ? 1 : 0 } };
          }

          if (sql.includes('UPDATE convites_usuarios SET used_at = datetime')) {
            const inviteId = Number(statement.params[0]);
            const invite = invites.find((item) => item.id === inviteId);
            if (invite) {
              invite.used_at = 'now';
            }
            return { meta: { changes: invite ? 1 : 0 } };
          }

          return { meta: { changes: 0 } };
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return { db, invites, links, users, queries };
}

async function acceptInvite(db: D1Database, token: string) {
  const app = createAuthApp();
  return app.fetch(
    new Request('http://localhost/api/auth/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, senha: 'SenhaForte123' }),
    }),
    { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
    {} as ExecutionContext,
  );
}

describe('auth invite accept empresa_id canonical link', () => {
  beforeEach(() => {
    resetSchemaCache();
  });

  it('accepts a personal Yahoo email invite using convite.empresa_id instead of email domain', async () => {
    const state = createDb(
      [
        {
          id: 1,
          token: 'invite-yahoo',
          usuario_id: 42,
          empresa_id: 6,
          email: 'pessoa@yahoo.com.br',
          role: 'GESTOR',
          expires_at: '2099-01-01 00:00:00',
          used_at: null,
        },
      ],
      [],
      // Gestor exige setor já vinculado antes de aceitar o convite (fail-closed).
      [{ usuario_id: 42, empresa_id: 6 }],
    );

    const response = await acceptInvite(state.db, 'invite-yahoo');
    const json = await response.json<{ success: boolean }>();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(state.links).toEqual([
      { usuario_id: 42, empresa_id: 6, role: 'GESTOR', is_primary: 1 },
    ]);
    expect(state.users.get(42)).toEqual({ password_hash: 'hashed-invite-password', active: 1 });
    expect(state.invites[0].used_at).toBe('now');
    expect(state.queries.join('\n')).not.toContain('dominio');
  });

  it('links an existing personal Hotmail user to the invited empresa without duplicating users or links', async () => {
    const state = createDb(
      [
        {
          id: 2,
          token: 'invite-hotmail',
          usuario_id: 77,
          empresa_id: 6,
          email: 'pessoa@hotmail.com',
          role: 'ALUNO',
          expires_at: '2099-01-01 00:00:00',
          used_at: null,
        },
      ],
      [{ usuario_id: 77, empresa_id: 2, role: 'GESTOR', is_primary: 1 }],
    );

    const response = await acceptInvite(state.db, 'invite-hotmail');

    expect(response.status).toBe(200);
    expect(state.links).toEqual([
      { usuario_id: 77, empresa_id: 2, role: 'GESTOR', is_primary: 1 },
      { usuario_id: 77, empresa_id: 6, role: 'ALUNO', is_primary: 0 },
    ]);
  });

  it('does not duplicate an existing invite link and refreshes the invited role', async () => {
    const state = createDb(
      [
        {
          id: 3,
          token: 'invite-existing-link',
          usuario_id: 88,
          empresa_id: 6,
          email: 'pessoa@yahoo.com',
          role: 'GESTOR',
          expires_at: '2099-01-01 00:00:00',
          used_at: null,
        },
      ],
      [{ usuario_id: 88, empresa_id: 6, role: 'ALUNO', is_primary: 1 }],
      // Gestor exige setor já vinculado antes de aceitar o convite (fail-closed).
      [{ usuario_id: 88, empresa_id: 6 }],
    );

    const response = await acceptInvite(state.db, 'invite-existing-link');

    expect(response.status).toBe(200);
    expect(state.links).toEqual([
      { usuario_id: 88, empresa_id: 6, role: 'GESTOR', is_primary: 1 },
    ]);
  });

  it('rejects accepting a manager invite when no sector has been assigned yet (fail-closed)', async () => {
    const state = createDb([
      {
        id: 4,
        token: 'invite-manager-no-sector',
        usuario_id: 99,
        empresa_id: 6,
        email: 'gestor.sem.setor@voecostadosol.com.br',
        role: 'GESTOR',
        expires_at: '2099-01-01 00:00:00',
        used_at: null,
      },
    ]);

    const response = await acceptInvite(state.db, 'invite-manager-no-sector');
    const json = await response.json<{ success: boolean; code: string }>();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.code).toBe('MANAGER_INVITE_MISSING_SECTOR');
    expect(state.links).toEqual([]);
    expect(state.users.get(99)).toEqual({ password_hash: null, active: 0 });
  });

  it('returns a friendly API error for an invalid token without echoing the token', async () => {
    const state = createDb([]);

    const response = await acceptInvite(state.db, 'missing-token-value');
    const json = await response.json<{ success: boolean; error: string; code: string }>();

    expect(response.status).toBe(401);
    expect(json).toMatchObject({
      success: false,
      error: 'Convite inválido',
      code: 'INVALID_INVITE_TOKEN',
    });
    expect(JSON.stringify(json)).not.toContain('missing-token-value');
  });

  it('builds invitation links on the production React route by default', () => {
    expect(buildInviteLink(undefined, 'abc 123')).toBe(
      'https://airtrust.online/aceitar-convite?token=abc%20123',
    );
    expect(buildInviteLink('https://airtrust.online/', 'token')).toBe(
      'https://airtrust.online/aceitar-convite?token=token',
    );
  });
});
