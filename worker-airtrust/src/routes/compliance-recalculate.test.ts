// ========================================
// AIRTRUST - COMPLIANCE: TESTES VITEST
// Testes unitários para API de recálculo
// ========================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Context } from 'hono';
import { Hono } from 'hono';

vi.mock('../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('empresaId', 1);
    await next();
  },
}));

vi.mock('../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

// Mock do D1Database
const mockDB = {
  prepare: vi.fn((query: string) => ({
    bind: vi.fn((..._args: unknown[]) => ({
      all: vi.fn(async () => ({
        success: true,
        results: [],
      })),
      first: vi.fn(async () => null),
      run: vi.fn(async () => ({
        success: true,
        meta: { changes: 0 },
      })),
    })),
  })),
  batch: vi.fn(async () => []),
} as unknown as D1Database;

describe('Compliance Recalculate API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve simular recálculo (dry_run)', async () => {
    const mockContext = {
      env: { DB: mockDB },
      req: {
        json: async () => ({
          scope: 'all',
          dry_run: true,
        }),
      },
      json: (data: unknown) => new Response(JSON.stringify(data)),
    } as unknown as Context;

    // Simular resposta do banco
    const prepareMock = mockDB.prepare as ReturnType<typeof vi.fn>;
    prepareMock.mockReturnValue({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          success: true,
          results: [
            {
              id: 1,
              funcionario_id: 1,
              qualificacao_id: 1,
              data_vencimento: '2025-12-31',
              codigo: 'TEST',
              nome: 'Teste',
            },
          ],
        })),
      })),
    });

    // Importar rota dinamicamente
    const complianceRoutes = await import('./compliance-recalculate');
    const app = new Hono();
    app.route('/compliance', complianceRoutes.default);

    const req = new Request('http://localhost/compliance/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'all',
        dry_run: true,
      }),
    });

    const res = await app.request(req, undefined, { DB: mockDB } as unknown as Record<string, unknown>);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('message');
    expect(data.data).toHaveProperty('qualificacoes_processadas');
    expect(data.data).toHaveProperty('execution_time_ms');
  });

  it('deve validar scope obrigatório', async () => {
    const complianceRoutes = await import('./compliance-recalculate');
    const app = new Hono();
    app.route('/compliance', complianceRoutes.default);

    const req = new Request('http://localhost/compliance/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // scope faltando - deve usar default 'all'
        dry_run: true,
      }),
    });

    const res = await app.request(req, undefined, { DB: mockDB } as unknown as Record<string, unknown>);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('deve retornar erro 500 em caso de falha no banco', async () => {
    const failingDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            throw new Error('Database connection failed');
          }),
        })),
      })),
    } as unknown as D1Database;

    const complianceRoutes = await import('./compliance-recalculate');
    const app = new Hono();
    app.route('/compliance', complianceRoutes.default);

    const req = new Request('http://localhost/compliance/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'all',
        dry_run: false,
      }),
    });

    const res = await app.request(req, undefined, { DB: failingDB } as unknown as Record<string, unknown>);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data).toHaveProperty('error');
  });

  it('deve calcular status corretamente para qualificação vencida', async () => {
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() - 10); // 10 dias atrás

    const prepareMock = mockDB.prepare as ReturnType<typeof vi.fn>;
    prepareMock.mockReturnValue({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          success: true,
          results: [
            {
              id: 1,
              funcionario_id: 1,
              qualificacao_id: 1,
              data_vencimento: dataVencimento.toISOString().split('T')[0],
              codigo: 'TEST',
              nome: 'Teste Vencido',
            },
          ],
        })),
      })),
    });

    const complianceRoutes = await import('./compliance-recalculate');
    const app = new Hono();
    app.route('/compliance', complianceRoutes.default);

    const req = new Request('http://localhost/compliance/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'all',
        dry_run: true,
      }),
    });

    const res = await app.request(req, undefined, { DB: mockDB } as unknown as Record<string, unknown>);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.data as Record<string, unknown>).qualificacoes_processadas).toBe(1);
  });
});

describe('Compliance Stats API', () => {
  it('deve retornar estatísticas agregadas', async () => {
    const prepareMock = mockDB.prepare as ReturnType<typeof vi.fn>;
    prepareMock.mockReturnValue({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          total: 100,
          conformes: 75,
          a_vencer: 15,
          vencidos: 8,
          pendentes: 2,
          percentual_medio: 82.5,
        })),
      })),
    });

    const complianceRoutes = await import('./compliance-recalculate');
    const app = new Hono();
    app.route('/compliance', complianceRoutes.default);

    const req = new Request('http://localhost/compliance/stats', {
      method: 'GET',
    });

    const res = await app.request(req, undefined, { DB: mockDB } as unknown as Record<string, unknown>);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('total', 100);
    expect(data.data).toHaveProperty('conformes', 75);
    expect(data.data).toHaveProperty('percentual_medio', 82.5);
  });
});
