/**
 * POST /qualificacoes/atribuicao — writer canônico, não INSERT desconectado.
 *
 * Prova o gap corrigido: atribuição manual de qualificação criava histórico
 * sem lineage (sem renovacao_de, sem materializar predecessor). Agora delega
 * a createQualificationHistoryAtomic, o mesmo primitivo usado por todo outro
 * writer convergido nesta auditoria. Executa contra SQLite real (não mock).
 */
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database, insertHistory } from '../helpers/qualification-history-sqlite-d1';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({ mode: 'unrestricted' }),
  assertFuncionarioInScope: async () => {},
  appendEmployeeSectorFilter: (sql: string) => sql,
}));
vi.mock('../../services/operational-domain-access', () => ({
  assertQualificacaoAtribuicaoWithinOperationalScope: async () => {},
}));

import atribuicaoRoutes from '../../routes/qualificacoes/atribuicao';

let sqlite: SqliteD1Database;

type TestVariables = {
  empresaId: number;
  userId: number;
  userRole: string;
  tenantContext: {
    empresaId: number;
    empresaCodigo: string;
    empresaNome: string;
    role: string;
    plano: string;
    permissions: string[];
  };
};

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: TestVariables }>();
  app.use('*', async (c, next) => {
    c.set('empresaId', 1);
    c.set('userId', 900);
    c.set('userRole', 'admin');
    c.set('tenantContext', {
      empresaId: 1,
      empresaCodigo: 'TEST',
      empresaNome: 'Test Co',
      role: 'admin',
      plano: 'enterprise',
      permissions: [],
    });
    await next();
  });
  app.route('/qualificacoes/atribuir', atribuicaoRoutes);
  return app;
}

async function postAtribuir(body: Record<string, unknown>) {
  const app = buildApp();
  const response = await app.fetch(
    new Request('http://localhost/qualificacoes/atribuir', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: sqlite.asD1() } as Env,
    {} as ExecutionContext,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  sqlite = new SqliteD1Database();
});

afterEach(() => {
  sqlite.close();
});

describe('POST /qualificacoes/atribuicao — atribuição manual usa lineage canônica', () => {
  it('primeira qualificação: cria CONCLUIDA sem predecessor, renovacao_de fica NULL', async () => {
    const { status, body } = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100, // MNT-12, empresa 1
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });

    expect(status).toBe(201);
    const id = (body.data as Record<string, unknown>).id as number;

    const row = sqlite.database
      .prepare('SELECT status, renovacao_de FROM qualificacoes_historico WHERE id = ?')
      .get(id) as Record<string, unknown>;
    expect(row.status).toBe('CONCLUIDA');
    expect(row.renovacao_de).toBeNull();
  });

  it('predecessor existente: atribuição CONCLUIDA seta renovacao_de e materializa o predecessor como RENOVADA', async () => {
    const predecessorId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 100,
      qualificationCode: 'MNT-12',
      completionDate: '2025-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    const { status, body } = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100,
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });

    expect(status).toBe(201);
    const newId = (body.data as Record<string, unknown>).id as number;

    const successor = sqlite.database
      .prepare('SELECT renovacao_de FROM qualificacoes_historico WHERE id = ?')
      .get(newId) as Record<string, unknown>;
    expect(successor.renovacao_de).toBe(predecessorId);

    const predecessor = sqlite.database
      .prepare('SELECT status, renovada FROM qualificacoes_historico WHERE id = ?')
      .get(predecessorId) as Record<string, unknown>;
    expect(predecessor.status).toBe('RENOVADA');
    expect(predecessor.renovada).toBe(1);
  });

  it('múltiplos predecessores legados: escolhe o cronologicamente mais recente como renovacao_de', async () => {
    insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 100,
      qualificationCode: 'MNT-12',
      completionDate: '2023-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });
    const maisRecenteId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 100,
      qualificationCode: 'MNT-12',
      completionDate: '2025-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    const { status, body } = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100,
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });

    expect(status).toBe(201);
    const newId = (body.data as Record<string, unknown>).id as number;
    const successor = sqlite.database
      .prepare('SELECT renovacao_de FROM qualificacoes_historico WHERE id = ?')
      .get(newId) as Record<string, unknown>;
    expect(successor.renovacao_de).toBe(maisRecenteId);
  });

  it('data futura nasce PLANEJADA e não toca nenhum predecessor', async () => {
    const predecessorId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 100,
      qualificationCode: 'MNT-12',
      completionDate: '2025-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    const futureDate = new Date();
    futureDate.setUTCFullYear(futureDate.getUTCFullYear() + 1);
    const futureIso = futureDate.toISOString().slice(0, 10);
    const futureExpiry = new Date(futureDate);
    futureExpiry.setUTCFullYear(futureExpiry.getUTCFullYear() + 1);

    const { status, body } = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100,
      data_realizacao: futureIso,
      data_vencimento: futureExpiry.toISOString().slice(0, 10),
    });

    expect(status).toBe(201);
    const newId = (body.data as Record<string, unknown>).id as number;
    const successor = sqlite.database
      .prepare('SELECT status, renovacao_de FROM qualificacoes_historico WHERE id = ?')
      .get(newId) as Record<string, unknown>;
    expect(successor.status).toBe('PLANEJADA');
    expect(successor.renovacao_de).toBeNull();

    // PLANEJADA creation must never touch/renew a predecessor.
    const predecessor = sqlite.database
      .prepare('SELECT status, renovada FROM qualificacoes_historico WHERE id = ?')
      .get(predecessorId) as Record<string, unknown>;
    expect(predecessor.status).toBe('CONCLUIDA');
    expect(predecessor.renovada).toBe(0);
  });

  it('registro futuro de outra qualificação permanece intacto (future-safe)', async () => {
    const futureOtherId = insertHistory(sqlite.database, {
      funcionarioId: 1000,
      qualificationId: 100,
      qualificationCode: 'MNT-12',
      completionDate: '2030-01-10',
      empresaId: 1,
      status: 'CONCLUIDA',
    });

    const { status } = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100,
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });

    expect(status).toBe(201);
    const untouched = sqlite.database
      .prepare('SELECT status, renovada FROM qualificacoes_historico WHERE id = ?')
      .get(futureOtherId) as Record<string, unknown>;
    expect(untouched.status).toBe('CONCLUIDA');
    expect(untouched.renovada).toBe(0);
  });

  it('retry idempotente: reenviar a mesma atribuição não duplica (ON CONFLICT DO NOTHING converge)', async () => {
    const first = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100,
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });
    expect(first.status).toBe(201);

    const retry = await postAtribuir({
      funcionario_id: 1000,
      qualificacao_id: 100,
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });
    expect(retry.status).toBe(201);
    expect((retry.body.data as Record<string, unknown>).id).toBe(
      (first.body.data as Record<string, unknown>).id,
    );

    const rows = sqlite.database
      .prepare(
        "SELECT COUNT(*) as n FROM qualificacoes_historico WHERE funcionario_id = 1000 AND qualificacao_codigo = 'MNT-12' AND data_conclusao = '2026-01-10'",
      )
      .get() as Record<string, unknown>;
    expect(rows.n).toBe(1);
  });

  it('tenant A nunca vê/afeta histórico do tenant B ao atribuir', async () => {
    // Predecessor pertence ao tenant 2 — não pode ser escolhido como
    // predecessor de uma atribuição feita no tenant 1.
    insertHistory(sqlite.database, {
      funcionarioId: 2000,
      qualificationId: 200,
      qualificationCode: 'MNT-12',
      completionDate: '2025-01-10',
      empresaId: 2,
      status: 'CONCLUIDA',
    });

    const { status, body } = await postAtribuir({
      funcionario_id: 1000, // tenant 1
      qualificacao_id: 100, // tenant 1's MNT-12 tipo
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });

    expect(status).toBe(201);
    const newId = (body.data as Record<string, unknown>).id as number;
    const row = sqlite.database
      .prepare('SELECT empresa_id, renovacao_de FROM qualificacoes_historico WHERE id = ?')
      .get(newId) as Record<string, unknown>;
    expect(row.empresa_id).toBe(1);
    expect(row.renovacao_de).toBeNull();
  });

  it('funcionário de outro tenant retorna 404, nenhum histórico é criado', async () => {
    const { status } = await postAtribuir({
      funcionario_id: 2000, // tenant 2, request feito com empresaId 1
      qualificacao_id: 100,
      data_realizacao: '2026-01-10',
      data_vencimento: '2027-01-10',
    });

    expect(status).toBe(404);
    const rows = sqlite.database
      .prepare('SELECT COUNT(*) as n FROM qualificacoes_historico WHERE funcionario_id = 2000')
      .get() as Record<string, unknown>;
    expect(rows.n).toBe(0);
  });
});
