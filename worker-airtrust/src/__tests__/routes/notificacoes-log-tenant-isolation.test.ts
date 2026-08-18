import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import notificacoesRoutes from '../../routes/notificacoes';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
    }

    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
    c.set('platformAdmin', c.req.header('x-test-platform-admin') === 'true');
    // These routes now resolve getEmployeeSectorAccess for row-level scoping
    // in addition to the (here pass-through-mocked) role gate. This suite is
    // about tenant isolation, not sector isolation, so fix the role at admin
    // ('all' mode / unrestricted within the tenant) rather than leaving
    // userRole undefined, which would fail closed to an empty sector scope
    // and make every query return nothing regardless of tenant.
    c.set('userRole', 'admin');
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  isPlatformAdminContext: (c: any) => Boolean(c.get('platformAdmin')),
}));

type LogRow = {
  id: number;
  config_id: number | null;
  qualificacao_historico_id: number | null;
  funcionario_cpf: string;
  tipo: string;
  destinatario: string;
  assunto: string;
  corpo: string;
  status: string;
  erro_mensagem: string | null;
  enviado_em: string | null;
  created_at: string;
  empresa_id: number;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/notificacoes', notificacoesRoutes);
  return app;
}

function createMockEnv() {
  const logs: LogRow[] = [
    {
      id: 1,
      config_id: 1,
      qualificacao_historico_id: null,
      funcionario_cpf: '111.111.111-11',
      tipo: 'EMAIL',
      destinatario: 'a@empresa1.com',
      assunto: 'Tenant A',
      corpo: 'log da empresa 1',
      status: 'enviada',
      erro_mensagem: null,
      enviado_em: '2026-07-01 10:00:00',
      created_at: '2026-07-01 10:00:00',
      empresa_id: 1,
    },
    {
      id: 2,
      config_id: 1,
      qualificacao_historico_id: null,
      funcionario_cpf: '222.222.222-22',
      tipo: 'WHATSAPP',
      destinatario: 'b@empresa2.com',
      assunto: 'Tenant B',
      corpo: 'log da empresa 2 - dado sensivel de outro tenant',
      status: 'enviada',
      erro_mensagem: null,
      enviado_em: '2026-07-02 10:00:00',
      created_at: '2026-07-02 10:00:00',
      empresa_id: 2,
    },
  ];

  const configs = [
    {
      id: 1,
      tipo: 'WHATSAPP',
      ativo: 1,
      dias_antes: 7,
      urgencia: 'ALTA',
      destinatarios: '',
      template: '',
      deleted_at: null,
    },
  ];

  const calls: Array<{ query: string; args: unknown[]; method: 'all' | 'first' | 'run' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });

        if (query.includes('FROM notificacoes_log')) {
          const empresaId = args[0] as number | undefined;
          const visible = logs.filter((log) => log.empresa_id === empresaId);

          if (query.includes("nl.tipo = 'WHATSAPP'")) {
            return { results: visible.filter((log) => log.tipo === 'WHATSAPP') };
          }

          if (query.includes('nl.id,')) {
            return { results: visible };
          }

          if (query.includes('COUNT(*) as total')) {
            return {
              results: [
                {
                  total: visible.length,
                  enviadas: visible.filter((l) => l.status === 'enviada').length,
                  erros: 0,
                  pendentes: 0,
                },
              ],
            };
          }

          return { results: [] };
        }

        if (query.includes('FROM notificacoes_config')) {
          return { results: configs };
        }

        return { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return { meta: { changes: 1 } };
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { env: { DB: db } as unknown as Env, calls, logs };
}

async function request(
  env: Env,
  path: string,
  empresaId = 1,
  init: RequestInit = {},
  platformAdmin = false,
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', String(empresaId));
  headers.set('x-test-platform-admin', String(platformAdmin));
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

describe('notificacoes /log tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empresa A ve apenas logs da empresa A', async () => {
    const { env } = createMockEnv();

    const response = await request(env, '/api/notificacoes/log', 1);
    const body = await response.json<{ data: LogRow[] }>();

    expect(response.status).toBe(200);
    expect(body.data.map((item) => item.id)).toEqual([1]);
    expect(body.data.map((item) => item.id)).not.toContain(2);
  });

  it('empresa B nao ve log da empresa A', async () => {
    const { env } = createMockEnv();

    const response = await request(env, '/api/notificacoes/log', 2);
    const body = await response.json<{ data: LogRow[] }>();

    expect(response.status).toBe(200);
    expect(body.data.map((item) => item.id)).toEqual([2]);
    expect(body.data.map((item) => item.id)).not.toContain(1);
  });

  it('query de log inclui filtro empresa_id vinculado ao contexto do tenant', async () => {
    const { env, calls } = createMockEnv();

    await request(env, '/api/notificacoes/log', 1);

    const listQuery = calls.find((call) => call.method === 'all' && call.query.includes('nl.id,'));
    expect(listQuery?.query).toContain('nl.empresa_id = ?');
    expect(listQuery?.args[0]).toBe(1);

    const statsQuery = calls.find(
      (call) => call.method === 'all' && call.query.includes('COUNT(*) as total'),
    );
    // Stats query now joins funcionarios for sector scoping, so empresa_id is
    // aliased (nl.empresa_id) rather than bare.
    expect(statsQuery?.query).toContain('nl.empresa_id = ?');
    expect(statsQuery?.args[0]).toBe(1);
  });

  it('sem contexto de tenant a rota falha fechada (nao retorna todos os logs)', async () => {
    const { env } = createMockEnv();

    // empresaId 0 simula ausencia de contexto valido; nenhum log tem empresa_id 0
    const response = await request(env, '/api/notificacoes/log', 0);
    const body = await response.json<{ data: LogRow[] }>();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

describe('notificacoes /whatsapp/overview tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empresa A ve apenas recentLogs da empresa A no overview de WhatsApp', async () => {
    const { env } = createMockEnv();

    const response = await request(env, '/api/notificacoes/whatsapp/overview', 1);
    const body = await response.json<{ data: { recentLogs: LogRow[] } }>();

    expect(response.status).toBe(200);
    expect(body.data.recentLogs.map((item) => item.id)).toEqual([]);
  });

  it('empresa B ve apenas seu proprio log WHATSAPP, nao o da empresa A', async () => {
    const { env } = createMockEnv();

    const response = await request(env, '/api/notificacoes/whatsapp/overview', 2);
    const body = await response.json<{ data: { recentLogs: LogRow[] } }>();

    expect(response.status).toBe(200);
    expect(body.data.recentLogs.map((item) => item.id)).toEqual([2]);
  });

  it('query do overview inclui filtro empresa_id vinculado ao contexto do tenant', async () => {
    const { env, calls } = createMockEnv();

    await request(env, '/api/notificacoes/whatsapp/overview', 2);

    const overviewQuery = calls.find(
      (call) => call.method === 'all' && call.query.includes("nl.tipo = 'WHATSAPP'"),
    );
    expect(overviewQuery?.query).toContain('nl.empresa_id = ?');
    expect(overviewQuery?.args[0]).toBe(2);
  });

  it('notificacoes_config do overview permanece global (sem filtro empresa_id)', async () => {
    const { env, calls } = createMockEnv();

    await request(env, '/api/notificacoes/whatsapp/overview', 1);

    const configQuery = calls.find(
      (call) => call.method === 'all' && call.query.includes('FROM notificacoes_config'),
    );
    expect(configQuery?.query).not.toContain('empresa_id');
  });
});

describe('notificacoes /config/:id restrito a platform admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin de tenant comum recebe 403 ao tentar alterar config global', async () => {
    const { env } = createMockEnv();

    const response = await request(env, '/api/notificacoes/config/1', 1, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: 0 }),
    });
    const body = await response.json<{ success: boolean; code?: string }>();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('PLATFORM_ADMIN_REQUIRED');
  });

  it('platform admin consegue alterar config global', async () => {
    const { env } = createMockEnv();

    const response = await request(
      env,
      '/api/notificacoes/config/1',
      1,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: 0 }),
      },
      true,
    );

    expect(response.status).toBe(200);
  });
});
