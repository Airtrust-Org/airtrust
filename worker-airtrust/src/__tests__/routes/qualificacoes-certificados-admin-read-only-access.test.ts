import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { requireControlledAdminOrSupportAccess } from '../../middleware/platform-support';
import { recordLegacyAndCanonicalAudit } from '../../lib/audit/record-legacy-and-canonical-audit';
import { resolvePlatformAccessState } from '../../lib/rbac/platform-access';

/**
 * BUG-011 Stage 3 trocou `access: 'query'` (valor inexistente no tipo
 * ControlledScopeAccess, que na prática caía no branch de mutação/elevado
 * por comparação de string sempre falsa) por `access: 'read_only'` nas rotas
 * de dry-run/inventário de certificados (qualificacoes-certificados-admin-ops.ts:722,789).
 *
 * Este arquivo prova que 'read_only' é o valor correto e pretendido: as duas
 * rotas fazem apenas SELECT (nunca INSERT/UPDATE/DELETE — ver docstrings
 * "Não gera nenhum certificado" / "Lista (sem gerar)"), e o próprio arquivo já
 * usa 'mutation' para as rotas que escrevem (RECUPERAR_ORFAOS, LIMPAR_REFS_ORFAS,
 * BACKFILL_APPLY). Os testes travam o novo comportamento e confirmam que ele
 * não abriu a rota para além do necessário: suporte read-only tem acesso,
 * mas segue exigindo role + grant + motivo + tenant correto.
 */

vi.mock('../../lib/audit/record-legacy-and-canonical-audit', () => ({
  recordLegacyAndCanonicalAudit: vi.fn(async () => ({})),
}));

vi.mock('../../lib/rbac/platform-access', () => ({
  resolvePlatformAccessState: vi.fn(async (_db: D1Database, userId: number | string) => {
    const normalized = Number(userId);
    if (normalized === 88) {
      return {
        userId: 88,
        isLegacyPlatformAdmin: false,
        hasPersistedPlatformAdmin: false,
        hasSupportReadOnlyRole: true,
        hasSupportElevatedRole: false,
        supportGrants: [{ empresaId: 7, accessLevel: 'read_only' }],
        source: 'persisted',
      };
    }
    if (normalized === 99) {
      return {
        userId: 99,
        isLegacyPlatformAdmin: false,
        hasPersistedPlatformAdmin: false,
        hasSupportReadOnlyRole: true,
        hasSupportElevatedRole: true,
        supportGrants: [{ empresaId: 7, accessLevel: 'elevated' }],
        source: 'persisted',
      };
    }
    return {
      userId: normalized,
      isLegacyPlatformAdmin: false,
      hasPersistedPlatformAdmin: false,
      hasSupportReadOnlyRole: false,
      hasSupportElevatedRole: false,
      supportGrants: [],
      source: 'none',
    };
  }),
  isPlatformAdminAccess: (state: { hasPersistedPlatformAdmin: boolean; isLegacyPlatformAdmin: boolean }) =>
    state.hasPersistedPlatformAdmin,
  canStartSupportReadOnlySession: (
    state: {
      hasSupportReadOnlyRole: boolean;
      supportGrants: Array<{ empresaId: number; accessLevel: 'read_only' | 'elevated' }>;
    },
    empresaId: number,
    supportReason?: string | null,
  ) =>
    Boolean(supportReason) &&
    state.hasSupportReadOnlyRole &&
    state.supportGrants.some(
      (grant) =>
        grant.empresaId === empresaId && (grant.accessLevel === 'read_only' || grant.accessLevel === 'elevated'),
    ),
  canPerformSupportMutation: (
    state: {
      hasSupportElevatedRole: boolean;
      supportGrants: Array<{ empresaId: number; accessLevel: 'read_only' | 'elevated' }>;
    },
    empresaId: number,
    supportReason?: string | null,
  ) =>
    Boolean(supportReason) &&
    state.hasSupportElevatedRole &&
    state.supportGrants.some((grant) => grant.empresaId === empresaId && grant.accessLevel === 'elevated'),
}));

function createDbStub() {
  return {
    prepare: vi.fn((_query: string) => {
      const statement = {
        bind: vi.fn(() => statement),
        first: vi.fn(async () => ({ found: 0 })),
        run: vi.fn(async () => ({ success: true })),
      };
      return statement;
    }),
  } as unknown as D1Database;
}

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('userId', Number(c.req.header('x-user-id') || 44));
    c.set('empresaId', Number(c.req.header('x-empresa-id') || 7));
    c.set('userRole', c.req.header('x-role') || 'viewer');
    await next();
  });
  // Espelha CERTIFICADOS_DRY_RUN_INVENTORY / CERTIFICADOS_BACKFILL_DRY_RUN.
  app.get(
    '/dry-run-inventory',
    requireControlledAdminOrSupportAccess({
      action: 'CERTIFICADOS_DRY_RUN_INVENTORY',
      access: 'read_only',
      entityType: 'certificados_admin_ops',
      module: 'qualificacoes_certificados',
    }),
    (c) => c.json({ success: true }),
  );
  // Espelha CERTIFICADOS_BACKFILL_APPLY — ancora de regressão: precisa continuar elevado.
  app.post(
    '/backfill-apply',
    requireControlledAdminOrSupportAccess({
      action: 'CERTIFICADOS_BACKFILL_APPLY',
      access: 'mutation',
      entityType: 'certificados_admin_ops',
      module: 'qualificacoes_certificados',
    }),
    (c) => c.json({ success: true }),
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('certificados admin ops — access read_only vs mutation', () => {
  it('permite suporte read-only na rota de dry-run/inventário (comportamento novo e pretendido)', async () => {
    const response = await buildApp().request(
      '/dry-run-inventory',
      {
        headers: {
          'x-role': 'viewer',
          'x-user-id': '88',
          'x-empresa-id': '7',
          'x-airtrust-support-reason': 'ticket_123',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(recordLegacyAndCanonicalAudit)).toHaveBeenCalledTimes(1);
  });

  it('permite suporte elevado na rota de dry-run (grant elevado também cobre sessão read-only)', async () => {
    const response = await buildApp().request(
      '/dry-run-inventory',
      {
        headers: {
          'x-role': 'viewer',
          'x-user-id': '99',
          'x-empresa-id': '7',
          'x-airtrust-support-reason': 'ticket_456',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
  });

  it('bloqueia usuario sem nenhuma role de suporte na rota de dry-run', async () => {
    const response = await buildApp().request(
      '/dry-run-inventory',
      {
        headers: {
          'x-role': 'viewer',
          'x-user-id': '1',
          'x-empresa-id': '7',
          'x-airtrust-support-reason': 'ticket_789',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    const payload = (await response.json()) as { code?: string };
    expect(response.status).toBe(403);
    expect(payload.code).toBe('SUPPORT_ACCESS_FORBIDDEN');
  });

  it('bloqueia suporte read-only sem motivo explicito (x-airtrust-support-reason ausente)', async () => {
    const response = await buildApp().request(
      '/dry-run-inventory',
      {
        headers: {
          'x-role': 'viewer',
          'x-user-id': '88',
          'x-empresa-id': '7',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(403);
  });

  it('bloqueia suporte read-only cross-tenant (grant é apenas para empresaId=7)', async () => {
    const response = await buildApp().request(
      '/dry-run-inventory',
      {
        headers: {
          'x-role': 'viewer',
          'x-user-id': '88',
          'x-empresa-id': '999',
          'x-airtrust-support-reason': 'ticket_123',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(403);
  });

  it('mantem a rota de mutacao (backfill-apply) exigindo suporte elevado, nao apenas read-only', async () => {
    const response = await buildApp().request(
      '/backfill-apply',
      {
        method: 'POST',
        headers: {
          'x-role': 'viewer',
          'x-user-id': '88',
          'x-empresa-id': '7',
          'x-airtrust-support-reason': 'ticket_123',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    const payload = (await response.json()) as { code?: string };
    expect(response.status).toBe(403);
    expect(payload.code).toBe('SUPPORT_ACCESS_FORBIDDEN');
  });

  it('permite suporte elevado na rota de mutacao (backfill-apply)', async () => {
    const response = await buildApp().request(
      '/backfill-apply',
      {
        method: 'POST',
        headers: {
          'x-role': 'viewer',
          'x-user-id': '99',
          'x-empresa-id': '7',
          'x-airtrust-support-reason': 'ticket_456',
        },
      },
      { DB: createDbStub(), ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
  });
});
