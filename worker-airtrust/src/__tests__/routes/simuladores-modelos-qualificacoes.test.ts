import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    c.set('tenantContext', {
      empresaId: 1,
      empresaCodigo: 'tenant-1',
      empresaNome: 'Tenant 1',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

import simuladoresModelosRoutes from '../../routes/simuladores-modelos';

function createDbMock() {
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare(query: string) {
      const sql = query.replace(/\s+/g, ' ').trim();

      if (sql === 'PRAGMA table_info(modelos_sessao)') {
        return {
          async all() {
            return {
              results: [
                { name: 'id' },
                { name: 'empresa_id' },
                { name: 'tipo_sessao_id' },
                { name: 'qualificacao_tipo_id' },
                { name: 'deleted_at' },
              ],
            };
          },
        };
      }

      return {
        bind(...args: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('SELECT qt.id, qt.codigo, qt.nome, qt.descricao') && sql.includes('JOIN qualificacoes_categorias qc')) {
                const checkIds = args.filter(a => typeof a === 'number');
                const validIds = checkIds.filter(id => id === 20 || id === 21);
                const results = validIds.map(id => ({ id, codigo: `CHECK-${id}` }));
                return { results } as T;
              }
              return { results: [] } as T;
            },
            async first<T>() {
              if (sql.includes('FROM empresas WHERE id')) {
                return { operational_domain_rbac_enabled: 0 } as unknown as T;
              }
              // 1. Validar tenant, inativo e VOO do tipo principal
              if (sql.includes('FROM qualificacoes_tipos qt') && sql.includes('JOIN qualificacoes_categorias') && sql.includes('WHERE qt.id = ?')) {
                const tipoId = args[0] as number;
                if (tipoId === 10) return { id: 10 } as T;
                return null as T;
              }

              // Existencia modelo_sessao para edição (ID 77)
              if (sql === 'SELECT * FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?' || sql === 'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?') {
                if (String(args[0]) === '77') return { id: 77, codigo: 'OLD' } as T;
                return null as T;
              }

              // ensureTipoSessaoBelongsToEmpresa
              if (sql === 'SELECT id FROM tipos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ? LIMIT 1') {
                return { id: args[0] } as T;
              }

              // ensureQualificacaoTipoBelongsToEmpresa
              if (sql === 'SELECT id FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL AND empresa_id = ? LIMIT 1') {
                return { id: args[0] } as T;
              }

              return null as T | null;
            },
            async run() {
              runs.push({ query: sql, args });
              return { meta: { changes: 1, last_row_id: 77 } };
            },
          };
        },
        async all() {
          return { results: [] };
        },
      };
    },
  } as unknown as D1Database;

  return { db, runs };
}

describe('simuladores-modelos qualificacoes rigorosas', () => {
  it('14. backend rejeita principal fora de Voo', async () => {
    const { db } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M1', nome: 'M1', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 99, manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Tipo de qualificação de voo inválido') });
  });

  it('15. backend rejeita Check fora de Check', async () => {
    const { db } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M2', nome: 'M2', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 10, checks_ids: [99], manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Checks inválidos') });
  });

  it('16. backend rejeita outro tenant', async () => {
    const { db } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M3', nome: 'M3', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 98, manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Tipo de qualificação de voo inválido') });
  });

  it('17. backend rejeita inativo e soft-deleted', async () => {
    const { db } = createDbMock();
    
    // Inativo principal (97)
    let response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M4', nome: 'M4', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 97, manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);

    // Deleted principal (96)
    response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M5', nome: 'M5', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 96, manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);

    // Check inativo (22)
    response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M6', nome: 'M6', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 10, checks_ids: [22], manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Checks inválidos') });
  });

  it('18 e 19. validação usa categoria_id canônico e não atualiza parcialmente em erro', async () => {
    const { db, runs } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao/77', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M-FAIL', nome: 'FAIL', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 99, manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(422);
    // Não atualizou parcialmente
    expect(runs.some(r => r.query.startsWith('UPDATE modelos_sessao'))).toBe(false);
  });

  it('20. edição válida continua funcionando', async () => {
    const { db, runs } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao/77', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: 'M-OK', nome: 'OK', tipo_sessao_id: 1, tipo: 'SIMULADOR', duracao_estimada: 120, gera_qualificacao: 1, qualificacao_tipo_id: 10, checks_ids: [20, 21], manobras: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(runs.some(r => r.query.startsWith('UPDATE modelos_sessao'))).toBe(true);
    expect(runs.some(r => r.query.startsWith('UPDATE modelos_sessao_checks SET deleted_at'))).toBe(true);
    expect(runs.some(r => r.query.startsWith('INSERT INTO modelos_sessao_checks'))).toBe(true);
  });
});
