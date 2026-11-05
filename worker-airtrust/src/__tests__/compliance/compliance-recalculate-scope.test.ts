/**
 * Auditoria de Compliance (2ª rodada) — POST /api/compliance/recalculate.
 *
 * Achado D7: `scope='funcionario'|'tipo_qualificacao'` sem `entity_id` válido ignorava o escopo e
 * recalculava a empresa inteira em silêncio (a tela de Configurações permite deixar o campo vazio).
 * Corrigido: o contrato agora exige alvo para escopo restrito e responde 400 antes de tocar o banco.
 * Parâmetros inválidos (ex.: scope desconhecido) também passam a ser 400 e não mais 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('empresaId', 7);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import recalc from '../../routes/compliance-recalculate';

const queries: Array<{ sql: string; params: unknown[] }> = [];

function db() {
  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        queries.push({ sql, params });
        return {
          all: async () => ({ success: true, results: [] }),
          first: async () => null,
          run: async () => ({ success: true, meta: { changes: 0 } }),
        };
      },
    }),
    batch: async () => [],
  } as unknown as D1Database;
}

async function post(body: unknown) {
  const app = new Hono<AppEnv>();
  app.route('/api/compliance', recalc);
  return app.fetch(
    new Request('http://localhost/api/compliance/recalculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db() } as AppEnv['Bindings'],
    {} as ExecutionContext,
  );
}

beforeEach(() => {
  queries.length = 0;
});

describe('recalculate: escopo restrito exige alvo (D7)', () => {
  it.each([
    ['funcionario sem entity_id', { scope: 'funcionario', dry_run: true }],
    ['tipo_qualificacao sem entity_id', { scope: 'tipo_qualificacao', dry_run: true }],
    ['funcionario com entity_id 0', { scope: 'funcionario', entity_id: 0, dry_run: true }],
    ['funcionario com entity_id negativo', { scope: 'funcionario', entity_id: -3, dry_run: true }],
    ['funcionario com entity_id fracionário', { scope: 'funcionario', entity_id: 1.5, dry_run: true }],
  ])('%s → 400 e nenhuma consulta ao banco', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/entity_id/);
    expect(queries).toHaveLength(0);
  });

  it('scope desconhecido é 400 (antes: 500)', async () => {
    const res = await post({ scope: 'tudo', dry_run: true });
    expect(res.status).toBe(400);
    expect(queries).toHaveLength(0);
  });
});

describe('recalculate: contratos válidos continuam funcionando', () => {
  it('scope all (ou omitido) sem entity_id segue válido e filtra por empresa', async () => {
    for (const body of [{ scope: 'all', dry_run: true }, { dry_run: true }]) {
      queries.length = 0;
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(queries.length).toBeGreaterThan(0);
      for (const q of queries) expect(q.params[0]).toBe(7);
    }
  });

  it('scope funcionario com entity_id válido restringe ao funcionário e à empresa', async () => {
    const res = await post({ scope: 'funcionario', entity_id: 55, dry_run: true });
    expect(res.status).toBe(200);
    const qual = queries.find((q) => /FROM qualificacoes_historico/.test(q.sql));
    expect(qual?.sql).toMatch(/qh\.empresa_id = \?/);
    expect(qual?.sql).toMatch(/qh\.funcionario_id = \?/);
    expect(qual?.params).toEqual([7, 55]);
  });

  it('scope tipo_qualificacao com entity_id válido restringe ao tipo e à empresa', async () => {
    const res = await post({ scope: 'tipo_qualificacao', entity_id: 9, dry_run: true });
    expect(res.status).toBe(200);
    const qual = queries.find((q) => /FROM qualificacoes_historico/.test(q.sql));
    expect(qual?.sql).toMatch(/qh\.qualificacao_id = \?/);
    expect(qual?.params).toEqual([7, 9]);
  });
});
