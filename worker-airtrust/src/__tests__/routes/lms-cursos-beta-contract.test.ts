import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';

const { authState, logAuditMock, recordAuditEventV2Mock } = vi.hoisted(() => ({
  authState: {
    role: 'admin',
    userId: 42,
    empresaId: 77,
  },
  logAuditMock: vi.fn(),
  recordAuditEventV2Mock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', authState.userId);
    c.set('userRole', authState.role);
    c.set('empresaId', authState.empresaId);
    c.set('requestId', 'req-lms-123');
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => authState.empresaId,
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

vi.mock('../../lib/audit/audit-events-v2', () => ({
  recordAuditEventV2: recordAuditEventV2Mock,
}));

import lmsCursosRoutes from '../../routes/lms-cursos';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry[1];

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
      };

      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      return {
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        all: async () => executeAll([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
          all: async () => executeAll(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const status =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, status);
  });
  app.route('/cursos', lmsCursosRoutes);
  return app;
}

describe('lms cursos beta contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'admin';
    authState.userId = 42;
    authState.empresaId = 77;
    logAuditMock.mockResolvedValue(undefined);
    recordAuditEventV2Mock.mockResolvedValue({ ok: true, id: 'audit-v2-lms-1' });
  });

  it('lista cursos publicados filtrando por empresa do tenant', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
      [
        'SELECT COUNT(*) as n FROM lms_cursos c',
        {
          first: () => ({ n: 1 }),
        },
      ],
      [
        'FROM lms_cursos c',
        {
          all: () => ({
            results: [
              {
                id: 21,
                empresa_id: 77,
                titulo: 'CRM Recorrente',
                tipo_conteudo: 'video',
                publicado: 1,
                ativo: 1,
              },
            ],
          }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos?page=2&limit=10&publicados=1',
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      pagination: { page: 2, limit: 10, total: 1 },
      data: [
        {
          id: 21,
          titulo: 'CRM Recorrente',
        },
      ],
    });

    const listCall = calls.find((call) => call.method === 'all' && call.query.includes('FROM lms_cursos c'));
    expect(listCall?.args[0]).toBe(77);
    expect(listCall?.args.slice(-2)).toEqual([10, 10]);
  });

  it('cria curso LMS simples no tenant atual sem fluxo extra de qualificacao', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
      [
        'FROM lms_cursos_setores cs',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'INSERT INTO lms_cursos',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 21 } }),
        },
      ],
      [
        'FROM lms_cursos WHERE id = ?',
        {
          first: () => ({
            id: 21,
            empresa_id: 77,
            titulo: 'CRM Recorrente',
            tipo_conteudo: 'video',
            publicado: 1,
          }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
        }),
      },
      { DB: db, AUDIT_EVENTS_V2_DUAL_WRITE: 'true' } as unknown as Env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 21,
        titulo: 'CRM Recorrente',
        tipo_conteudo: 'video',
      },
    });

    const insertCall = calls.find((call) => call.method === 'run' && call.query.includes('INSERT INTO lms_cursos'));
    expect(insertCall?.args[0]).toBe(77);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'LMS_CURSO_CRIADO',
        entityType: 'lms_cursos',
        entityId: 21,
      }),
    );
    expect(recordAuditEventV2Mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        empresaId: 77,
        actorUserId: 42,
        actorEmpresaId: 77,
        actorRole: 'admin',
        requestId: 'req-lms-123',
        eventCategory: 'ADMIN_OPERATION',
        eventAction: 'LMS_CURSO_CRIADO',
        entityType: 'lms_cursos',
        entityId: 21,
        metadata: {
          module: 'lms',
          resource_kind: 'course',
        },
      }),
    );
    expect(recordAuditEventV2Mock.mock.calls[0][1]).not.toHaveProperty('oldValues');
    expect(recordAuditEventV2Mock.mock.calls[0][1]).not.toHaveProperty('newValues');
  });

  it('bloqueia criacao de gestor com setor_ids fora do escopo permitido', async () => {
    authState.role = 'GESTOR';
    const { db, calls } = createMockDb([
      [
        "pragma_table_info('setores_gestores')",
        {
          all: () => ({ results: [{ name: 'usuario_id' }] }),
        },
      ],
      [
        'FROM setores_gestores sg',
        {
          all: () => ({ results: [{ setor_id: 10 }] }),
        },
      ],
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
          setor_ids: [10, 11],
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Acesso negado: setor fora do seu escopo',
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO lms_cursos'))).toBe(false);
  });

  it('bloqueia edicao de gestor quando o curso atual inclui setor fora do escopo', async () => {
    authState.role = 'GESTOR';
    const { db, calls } = createMockDb([
      [
        "pragma_table_info('setores_gestores')",
        {
          all: () => ({ results: [{ name: 'usuario_id' }] }),
        },
      ],
      [
        'FROM setores_gestores sg',
        {
          all: () => ({ results: [{ setor_id: 10 }] }),
        },
      ],
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
      [
        'FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        {
          first: () => ({
            id: 21,
            titulo: 'CRM Recorrente',
            categoria: null,
            tipo_conteudo: 'video',
            publicado: 1,
            ativo: 1,
            qualificacao_tipo_id: null,
            gerar_qualificacao_ao_concluir: 0,
          }),
        },
      ],
      [
        'FROM lms_cursos_setores cs',
        {
          all: () => ({
            results: [
              { id: 10, nome: 'Tripulação' },
              { id: 11, nome: 'Manutenção' },
            ],
          }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos/21',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente v2',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Acesso negado: setor fora do seu escopo',
    });
    expect(calls.some((call) => call.query.includes('UPDATE lms_cursos SET'))).toBe(false);
  });

  it('preserva a resposta principal quando o writer v2 falha inesperadamente', async () => {
    recordAuditEventV2Mock.mockRejectedValue(new Error('synthetic v2 failure'));
    const { db } = createMockDb([
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
      [
        'FROM lms_cursos_setores cs',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'INSERT INTO lms_cursos',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 21 } }),
        },
      ],
      [
        'FROM lms_cursos WHERE id = ?',
        {
          first: () => ({
            id: 21,
            empresa_id: 77,
            titulo: 'CRM Recorrente',
            tipo_conteudo: 'video',
            publicado: 1,
          }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
        }),
      },
      { DB: db, AUDIT_EVENTS_V2_DUAL_WRITE: 'true' } as unknown as Env,
    );

    expect(response.status).toBe(201);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventV2Mock).toHaveBeenCalledTimes(1);
  });

  it('mantem apenas o writer legado quando a flag v2 nao esta ativa', async () => {
    const { db } = createMockDb([
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
      [
        'FROM lms_cursos_setores cs',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'INSERT INTO lms_cursos',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 21 } }),
        },
      ],
      [
        'FROM lms_cursos WHERE id = ?',
        {
          first: () => ({
            id: 21,
            empresa_id: 77,
            titulo: 'CRM Recorrente',
            tipo_conteudo: 'video',
            publicado: 1,
          }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(201);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventV2Mock).not.toHaveBeenCalled();
  });

  it('mantem apenas o writer legado quando a flag v2 esta explicitamente false', async () => {
    const { db } = createMockDb([
      [
        'FROM sqlite_master',
        {
          first: () => ({ ok: 1 }),
        },
      ],
      [
        'FROM lms_cursos_setores cs',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'INSERT INTO lms_cursos',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 21 } }),
        },
      ],
      [
        'FROM lms_cursos WHERE id = ?',
        {
          first: () => ({
            id: 21,
            empresa_id: 77,
            titulo: 'CRM Recorrente',
            tipo_conteudo: 'video',
            publicado: 1,
          }),
        },
      ],
    ]);

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
        }),
      },
      { DB: db, AUDIT_EVENTS_V2_DUAL_WRITE: 'false' } as unknown as Env,
    );

    expect(response.status).toBe(201);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventV2Mock).not.toHaveBeenCalled();
  });
});
