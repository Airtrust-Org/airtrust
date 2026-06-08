import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import notificacoesRoutes from '../../routes/notificacoes';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', c.req.header('x-test-user-id') || '10');
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  getTenantContext: (c: any) => ({
    empresaId: Number(c.get('empresaId') || 0),
    empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
    empresaNome: 'Empresa Teste',
    role: 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

type NotificationRow = {
  id: number;
  tipo: string;
  grupo: string | null;
  titulo: string;
  mensagem: string;
  empresa_id: number | null;
  user_id: string | null;
  funcionario_id: number | null;
  lida: number;
  prioridade: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  nome: string;
  matricula: string;
  deleted_at: string | null;
};

const ALLOWED_GLOBAL_TYPES = new Set(['ALERTA_DADOS', 'ALERTA_SEMANAL_QUALIFICACOES']);
const ALLOWED_GLOBAL_GROUPS = new Set(['auditoria', 'qualificacoes']);

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/notificacoes', notificacoesRoutes);
  return app;
}

function createMockEnv() {
  const notifications: NotificationRow[] = [
    {
      id: 1,
      tipo: 'FRMS_CHECKIN_FADIGA',
      grupo: 'frms',
      titulo: 'Tenant A',
      mensagem: 'notif A',
      empresa_id: 1,
      user_id: null,
      funcionario_id: 101,
      lida: 0,
      prioridade: 'ALTA',
      created_at: '2026-06-08 10:00:00',
      updated_at: '2026-06-08 10:00:00',
      deleted_at: null,
    },
    {
      id: 2,
      tipo: 'FRMS_CHECKIN_FADIGA',
      grupo: 'frms',
      titulo: 'Tenant B',
      mensagem: 'notif B',
      empresa_id: 2,
      user_id: null,
      funcionario_id: 202,
      lida: 0,
      prioridade: 'ALTA',
      created_at: '2026-06-08 10:01:00',
      updated_at: '2026-06-08 10:01:00',
      deleted_at: null,
    },
    {
      id: 3,
      tipo: 'ALERTA_DADOS',
      grupo: 'auditoria',
      titulo: 'Global allowed',
      mensagem: 'global ok',
      empresa_id: null,
      user_id: null,
      funcionario_id: null,
      lida: 0,
      prioridade: 'MEDIA',
      created_at: '2026-06-08 10:02:00',
      updated_at: '2026-06-08 10:02:00',
      deleted_at: null,
    },
    {
      id: 4,
      tipo: 'ALERTA_DADOS',
      grupo: 'auditoria',
      titulo: 'Global malformed',
      mensagem: 'global malformed',
      empresa_id: null,
      user_id: null,
      funcionario_id: 202,
      lida: 0,
      prioridade: 'MEDIA',
      created_at: '2026-06-08 10:03:00',
      updated_at: '2026-06-08 10:03:00',
      deleted_at: null,
    },
    {
      id: 5,
      tipo: 'FICHA_EDICAO_APROVADA',
      grupo: 'simuladores',
      titulo: 'User specific',
      mensagem: 'for user 10',
      empresa_id: 1,
      user_id: '10',
      funcionario_id: null,
      lida: 0,
      prioridade: 'MEDIA',
      created_at: '2026-06-08 10:04:00',
      updated_at: '2026-06-08 10:04:00',
      deleted_at: null,
    },
    {
      id: 6,
      tipo: 'FICHA_EDICAO_APROVADA',
      grupo: 'simuladores',
      titulo: 'Other user',
      mensagem: 'for user 99',
      empresa_id: 1,
      user_id: '99',
      funcionario_id: null,
      lida: 0,
      prioridade: 'MEDIA',
      created_at: '2026-06-08 10:05:00',
      updated_at: '2026-06-08 10:05:00',
      deleted_at: null,
    },
    {
      id: 7,
      tipo: 'FRMS_CHECKIN_REMINDER',
      grupo: 'frms',
      titulo: 'Private global',
      mensagem: 'should stay hidden',
      empresa_id: null,
      user_id: null,
      funcionario_id: null,
      lida: 0,
      prioridade: 'MEDIA',
      created_at: '2026-06-08 10:06:00',
      updated_at: '2026-06-08 10:06:00',
      deleted_at: null,
    },
  ];

  const funcionarios: FuncionarioRow[] = [
    { id: 101, empresa_id: 1, nome: 'Funcionario A', matricula: 'A-101', deleted_at: null },
    { id: 202, empresa_id: 2, nome: 'Funcionario B', matricula: 'B-202', deleted_at: null },
  ];

  const state = {
    empresaId: 1,
    userId: '10',
  };

  const calls: Array<{ query: string; args: unknown[]; method: 'all' | 'first' | 'run' }> = [];

  const isAllowedGlobal = (notification: NotificationRow) =>
    ALLOWED_GLOBAL_TYPES.has(notification.tipo) ||
    ALLOWED_GLOBAL_GROUPS.has(String(notification.grupo || '').toLowerCase());

  const isVisible = (notification: NotificationRow) => {
    if (notification.deleted_at) return false;

    if (notification.empresa_id === state.empresaId) {
      return notification.user_id === null || notification.user_id === state.userId;
    }

    if (notification.empresa_id === null) {
      if (notification.user_id) return notification.user_id === state.userId;
      return isAllowedGlobal(notification);
    }

    return false;
  };

  const decorateNotification = (notification: NotificationRow) => {
    const funcionario =
      notification.funcionario_id === null
        ? null
        : funcionarios.find(
            (item) =>
              item.id === notification.funcionario_id &&
              item.empresa_id === state.empresaId &&
              !item.deleted_at,
          ) || null;

    return {
      ...notification,
      funcionario_nome: funcionario?.nome || null,
      funcionario_matricula: funcionario?.matricula || null,
    };
  };

  const db = {
    prepare: vi.fn((query: string) => {
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });

        if (query.includes('FROM notificacoes_sistema n')) {
          const onlyUnread = query.includes('n.lida = 0');
          const onlyRead = query.includes('n.lida = 1');
          const visible = notifications.filter((notification) => {
            if (!isVisible(notification)) return false;
            if (onlyUnread) return notification.lida === 0;
            if (onlyRead) return notification.lida === 1;
            return true;
          });

          return { results: visible.map(decorateNotification) };
        }

        return { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });

        if (query.includes('SELECT COUNT(*) as total FROM notificacoes_sistema')) {
          const total = notifications.filter((notification) => isVisible(notification) && notification.lida === 0)
            .length;
          return { total };
        }

        return null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });

        if (query.includes('WHERE id = ?')) {
          const id = Number(args[1]);
          const target = notifications.find((notification) => notification.id === id);
          if (!target || !isVisible(target)) return { meta: { changes: 0 } };
          target.lida = 1;
          return { meta: { changes: 1 } };
        }

        if (query.includes('WHERE lida = 0')) {
          let changes = 0;
          for (const notification of notifications) {
            if (notification.lida === 0 && isVisible(notification)) {
              notification.lida = 1;
              changes += 1;
            }
          }
          return { meta: { changes } };
        }

        return { meta: { changes: 0 } };
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

  return {
    env: { DB: db } as unknown as Env,
    calls,
    notifications,
    setCurrentContext: (empresaId: number, userId: string) => {
      state.empresaId = empresaId;
      state.userId = userId;
    },
  };
}

async function request(
  env: Env,
  setCurrentContext: (empresaId: number, userId: string) => void,
  path: string,
  empresaId = 1,
  userId = '10',
  init: RequestInit = {},
) {
  setCurrentContext(empresaId, userId);
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', String(empresaId));
  headers.set('x-test-user-id', userId);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

describe('notificacoes sistema tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empresa A ve notificacao da empresa A e nao ve da empresa B', async () => {
    const { env, setCurrentContext } = createMockEnv();

    const response = await request(env, setCurrentContext, '/api/notificacoes/sistema');
    const body = await response.json<{ data: Array<{ id: number }> }>();

    expect(response.status).toBe(200);
    expect(body.data.map((item) => item.id)).toContain(1);
    expect(body.data.map((item) => item.id)).not.toContain(2);
  });

  it('empresa A ve notificacao global permitida', async () => {
    const { env, setCurrentContext } = createMockEnv();

    const response = await request(env, setCurrentContext, '/api/notificacoes/sistema');
    const body = await response.json<{ data: Array<{ id: number }> }>();

    expect(body.data.map((item) => item.id)).toContain(3);
    expect(body.data.map((item) => item.id)).not.toContain(7);
  });

  it('nao vaza nome ou matricula de funcionario de outra empresa em notificacao global', async () => {
    const { env, setCurrentContext } = createMockEnv();

    const response = await request(env, setCurrentContext, '/api/notificacoes/sistema');
    const body = await response.json<
      { data: Array<{ id: number; funcionario_nome: string | null; funcionario_matricula: string | null }> }
    >();

    const malformed = body.data.find((item) => item.id === 4);
    expect(malformed).toBeDefined();
    expect(malformed?.funcionario_nome).toBeNull();
    expect(malformed?.funcionario_matricula).toBeNull();
  });

  it('contador nao soma notificacao da empresa B', async () => {
    const { env, setCurrentContext } = createMockEnv();

    const response = await request(env, setCurrentContext, '/api/notificacoes/sistema/contador');
    const body = await response.json<{ total_nao_lidas: number }>();

    expect(response.status).toBe(200);
    expect(body.total_nao_lidas).toBe(4);
  });

  it('marcar lida por id nao marca notificacao da empresa B', async () => {
    const { env, setCurrentContext, notifications, calls } = createMockEnv();

    const response = await request(
      env,
      setCurrentContext,
      '/api/notificacoes/sistema/2/marcar-lida',
      1,
      '10',
      { method: 'PUT' },
    );

    expect(response.status).toBe(404);
    expect(notifications.find((item) => item.id === 2)?.lida).toBe(0);
    const updateQuery = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE notificacoes_sistema'),
    );
    expect(updateQuery?.query).toContain('empresa_id = ?');
    expect(updateQuery?.query).toContain('user_id = ? OR user_id IS NULL');
  });

  it('marcar todas nao marca notificacao da empresa B', async () => {
    const { env, setCurrentContext, notifications, calls } = createMockEnv();

    const response = await request(
      env,
      setCurrentContext,
      '/api/notificacoes/sistema/marcar-todas-lidas',
      1,
      '10',
      { method: 'PUT' },
    );
    const body = await response.json<{ total_marcadas: number }>();

    expect(response.status).toBe(200);
    expect(body.total_marcadas).toBe(4);
    expect(notifications.find((item) => item.id === 2)?.lida).toBe(0);
    const updateQuery = calls.find(
      (call) =>
        call.method === 'run' &&
        call.query.includes('UPDATE notificacoes_sistema') &&
        call.query.includes('WHERE lida = 0'),
    );
    expect(updateQuery?.query).toContain('empresa_id = ?');
    expect(updateQuery?.query).toContain('user_id = ? OR user_id IS NULL');
  });

  it('notificacao user_id especifica so aparece para o user_id correto', async () => {
    const { env, setCurrentContext } = createMockEnv();

    const responseUser10 = await request(env, setCurrentContext, '/api/notificacoes/sistema', 1, '10');
    const bodyUser10 = await responseUser10.json<{ data: Array<{ id: number }> }>();

    const responseUser55 = await request(env, setCurrentContext, '/api/notificacoes/sistema', 1, '55');
    const bodyUser55 = await responseUser55.json<{ data: Array<{ id: number }> }>();

    expect(bodyUser10.data.map((item) => item.id)).toContain(5);
    expect(bodyUser10.data.map((item) => item.id)).not.toContain(6);
    expect(bodyUser55.data.map((item) => item.id)).not.toContain(5);
    expect(bodyUser55.data.map((item) => item.id)).not.toContain(6);
  });

  it('query de leitura faz join de funcionario com tenant guard', async () => {
    const { env, setCurrentContext, calls } = createMockEnv();

    await request(env, setCurrentContext, '/api/notificacoes/sistema');

    const listQuery = calls.find(
      (call) => call.method === 'all' && call.query.includes('FROM notificacoes_sistema n'),
    );
    expect(listQuery?.query).toContain('LEFT JOIN funcionarios f');
    expect(listQuery?.query).toContain('f.empresa_id = ?');
  });
});
