import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

// Regression coverage for P1-TRAIN-001 (post-commit integration failures must not surface as a
// generic 500, and must not be silently swallowed as a false 200) and P1-TRAIN-002 (batch
// conclusion writes must be atomic). See
// AIRTRUST_TRAINING_PLANNED_RELIABILITY_FINDINGS_20260817.md for the source finding.

type MockMiddlewareContext = {
  json: (body: unknown, status?: number) => Response;
  set: (key: string, value: unknown) => void;
};

const {
  registrarAuditoriaMock,
  syncTreinamentoPlanejadoIntegrationMock,
  authMode,
  requireRoleMode,
  tenantEmpresaId,
} = vi.hoisted(() => ({
  registrarAuditoriaMock: vi.fn(),
  syncTreinamentoPlanejadoIntegrationMock: vi.fn(),
  authMode: { current: 'pass' as 'pass' | 'missing' },
  requireRoleMode: { current: 'pass' as 'pass' | 'forbidden' },
  tenantEmpresaId: { current: 1 },
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: MockMiddlewareContext, next: () => Promise<void>) => {
    if (authMode.current === 'missing') {
      return c.json({ success: false, error: 'Não autenticado' }, 401);
    }
    c.set('userId', 99);
    c.set('userRole', 'admin');
    c.set('empresaId', tenantEmpresaId.current);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (c: MockMiddlewareContext, next: () => Promise<void>) => {
    if (requireRoleMode.current === 'forbidden') {
      return c.json({ success: false, error: 'Acesso não autorizado' }, 403);
    }
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 1,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
  extrairUsuarioAuditoria: () => ({ usuario_id: '99', usuario_nome: 'Teste' }),
}));

vi.mock('../../services/treinamentos-planejados-integration', () => ({
  syncTreinamentoPlanejadoIntegration: syncTreinamentoPlanejadoIntegrationMock,
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({ mode: 'all', setorIds: [], funcionarioId: null }),
  filterRequestedSetorIdsByAccess: (requested: number[]) => requested,
}));

import treinamentosPlanejadosRoutes from '../../routes/treinamentos-planejados';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const trimmed = query.trim();
      const ddlPrefixes = ['CREATE TABLE', 'CREATE INDEX'];
      const ddlQuery = ddlPrefixes.some((prefix) => trimmed.startsWith(prefix));
      const trainingClassQuery = [
        'treinamentos_dias',
        'treinamentos_instrutores',
        'treinamentos_qualificacoes_geradas',
        'aeronaves',
      ].some((table) => query.includes(table));

      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry && !ddlQuery && !trainingClassQuery) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry?.[1];
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler?.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler?.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler?.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
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
    batch: vi.fn(async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((statement) => statement.run())),
    ),
  } as unknown as D1Database;

  return { db, calls };
}

describe('treinamentos planejados — confiabilidade pós-commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrarAuditoriaMock.mockResolvedValue(undefined);
    syncTreinamentoPlanejadoIntegrationMock.mockResolvedValue(undefined);
    authMode.current = 'pass';
    requireRoleMode.current = 'pass';
    tenantEmpresaId.current = 1;
  });

  it('TRAIN-REL-001: presença — integração falha após commit retorna 409 TRAINING_INTEGRATION_PENDING sem reverter o write principal', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        { first: () => ({ id: 31 }) },
      ],
      ['FROM treinamentos_participantes', { first: () => ({ id: 7 }) }],
      ['UPDATE treinamentos_participantes', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    syncTreinamentoPlanejadoIntegrationMock.mockRejectedValueOnce(new Error('escala indisponível'));

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados/31/presenca', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ funcionario_id: 11, confirmado: true, presente: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    // O write principal já aconteceu — a falha de integração não pode virar um 500 genérico
    // nem um falso 200; o contrato é 409 com código explícito e committed=true.
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'TRAINING_INTEGRATION_PENDING',
      data: { id: 31, committed: true, retryable: true },
    });

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE treinamentos_participantes'),
    );
    expect(updateCall).toBeDefined();
    expect(syncTreinamentoPlanejadoIntegrationMock).toHaveBeenCalledTimes(1);
  });

  it('presença — integração ok retorna 200 normalmente (não regride caminho feliz)', async () => {
    const { db } = createMockDb([
      [
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        { first: () => ({ id: 31 }) },
      ],
      ['FROM treinamentos_participantes', { first: () => ({ id: 7 }) }],
      ['UPDATE treinamentos_participantes', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados/31/presenca', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ funcionario_id: 11, confirmado: true, presente: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { id: 31 } });
  });

  it('cancelamento — integração falha após marcar CANCELADO retorna 409 pendente e não executa o soft-delete', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id FROM treinamentos_planejados WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        { first: () => ({ id: 31 }) },
      ],
      [
        "UPDATE treinamentos_planejados\n            SET status = 'CANCELADO'",
        { run: () => ({ meta: { changes: 1 } }) },
      ],
      [
        "SET deleted_at = datetime('now')",
        { run: () => ({ meta: { changes: 1 } }) },
      ],
    ]);

    syncTreinamentoPlanejadoIntegrationMock.mockRejectedValueOnce(new Error('escala indisponível'));

    const app = new Hono<{ Bindings: Env }>();
    app.route('/treinamentos', treinamentosPlanejadosRoutes);

    const response = await app.fetch(
      new Request('http://localhost/treinamentos/planejados/31', { method: 'DELETE' }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'TRAINING_INTEGRATION_PENDING',
      data: { id: 31, committed: true, retryable: true },
    });

    const softDeleteCall = calls.find((call) => call.query.includes('SET deleted_at'));
    expect(softDeleteCall).toBeUndefined();
  });
});

describe('treinamentos-planejados reliability source contract', () => {
  const source = readFileSync(
    decodeURIComponent(new URL('../../routes/treinamentos-planejados.ts', import.meta.url).pathname),
    'utf8',
  );

  it('define o helper trySync* e o contrato TRAINING_INTEGRATION_PENDING', () => {
    expect(source).toContain('async function trySyncTreinamentoPlanejadoIntegration');
    expect(source).toContain("'TRAINING_INTEGRATION_PENDING'");
    expect(source).toContain('committed: true');
    expect(source).toContain('retryable: true');
  });

  it('usa db.batch para os writes aceitos da conclusão em lote e estreita o WHERE por treinamento_id', () => {
    const start = source.indexOf("'/planejados/:id/conclusao-lote'");
    const end = source.indexOf("'/planejados/:id/participantes/conclusao'", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const route = source.slice(start, end);
    expect(route).toContain('const conclusionStatements: D1PreparedStatement[]');
    expect(route).toContain('await db.batch(conclusionStatements)');
    expect(route).toContain('WHERE id = ? AND treinamento_id = ?');
  });

  it('não deixa nenhuma falha de integração pós-commit virar sucesso silencioso nos caminhos alterados', () => {
    const occurrences = source.match(/TRAINING_INTEGRATION_PENDING/g) || [];
    // helper string constant + at least 6 route usages (PATCH principal, participantes,
    // presença, conclusão em lote, conclusão individual, cancelamento).
    expect(occurrences.length).toBeGreaterThanOrEqual(6);
  });

  it('preserva o POST de criação e o backfill-sync sem alterar seus caminhos de syncTreinamentoPlanejadoIntegration', () => {
    // POST create mantém seu próprio try/catch de compensação (fora do escopo deste delta).
    const createIdx = source.indexOf('const treinamentoId = Number(result.meta.last_row_id || 0);');
    expect(createIdx).toBeGreaterThan(0);
    const createSlice = source.slice(createIdx, createIdx + 400);
    expect(createSlice).toContain('await syncTreinamentoPlanejadoIntegration({ db, empresaId, treinamentoId });');

    // backfill-sync continua chamando a versão direta (idempotente, endpoint administrativo).
    const backfillIdx = source.indexOf("'/planejados/backfill-sync'");
    expect(backfillIdx).toBeGreaterThan(0);
    const backfillSlice = source.slice(backfillIdx);
    expect(backfillSlice).toContain('await syncTreinamentoPlanejadoIntegration({ db, empresaId, treinamentoId });');
  });
});
