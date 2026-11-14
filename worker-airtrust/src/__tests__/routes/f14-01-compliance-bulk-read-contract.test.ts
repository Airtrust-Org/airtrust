import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: () => 6 }));
vi.mock('../../middleware/employee-sector-access', () => ({
  appendEmployeeSectorFilter: vi.fn(),
  assertFuncionarioInScope: vi.fn(async () => undefined),
  getEmployeeSectorAccess: vi.fn(async () => ({
    mode: 'all', setorIds: [], funcionarioId: null,
  })),
}));
import complianceRouter from '../../routes/compliance';

type Call = { sql: string; binds: unknown[] };

function fixture(failure: 'none' | 'lms' | 'requirements' = 'none') {
  const calls: Call[] = [];
  const ids = Array.from({ length: 241 }, (_, i) => i + 1);
  const db = {
    prepare(sql: string) {
      const execute = async (binds: unknown[]) => {
        calls.push({ sql, binds });
        if (binds.length > 100) throw new Error('SQLITE_TOO_MANY_VARIABLES');
        const query = sql.replace(/\s+/g, ' ').trim();
        if (query.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
          return { success: true, results: [
            'funcionario_id', 'empresa_id', 'qualificacao_id', 'data_conclusao',
            'data_vencimento', 'renovacao_de', 'status',
          ].map(name => ({ name })) };
        }
        if (query.startsWith("PRAGMA table_info('licencas')")) {
          return { success: true, results: [
            'funcionario_id', 'empresa_id', 'tipo', 'data_vencimento', 'deleted_at',
          ].map(name => ({ name })) };
        }
        if (query.includes('FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1')) {
          return {
            success: true,
            results: ids.map(id => ({
              id, nome: 'Piloto '+id, matricula:'P'+id, funcao:'Piloto',
            })),
          };
        }
        if (query.includes('FROM requisitos_compliance')) {
          if (failure === 'requirements') throw new Error('D1_REQUISITOS_DOWN');
          return { success: true, results: [
            { id:1,funcao:'Piloto',tipo_recurso:'curso_lms',referencia:'55',descricao:'Curso 55' },
          ] };
        }
        if (query.includes('FROM lms_matriculas')) {
          if (failure === 'lms') throw new Error('D1_LMS_DOWN');
          return { success: true, results:
            binds.includes(1)
              ? [{ funcionario_id:1,curso_id:55,status:'CONCLUIDO',data_expiracao:null }]
              : [] };
        }
        if (query.includes('dias_alerta_vencimento')) {
          return { success: true, results:[{ dias_alerta_vencimento:30 }] };
        }
        return { success: true, results:[] };
      };
      return {
        bind: (...binds: unknown[]) => ({
          all: () => execute(binds),
          first: async () => ((await execute(binds)).results as Record<string, unknown>[])[0] ?? null,
        }),
        all: () => execute([]),
        first: async () => ((await execute([])).results as Record<string, unknown>[])[0] ?? null,
      };
    },
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', complianceRouter);
  return { calls, request: () => app.request('/compliance/funcionarios', undefined, { DB: db } as Env) };
}

describe('F14-01 — Compliance coletivo D1 e falhas explícitas', () => {
  it('241 funcionários são consultados por lotes seguros, sem marcar LMS pendente como conforme', async () => {
    const { calls, request } = fixture();
    const result = await request();
    expect(result.status).toBe(200);
    const body = await result.json() as {
      success: boolean; total: number; data: Array<{funcionario_id:string; status:string}>
    };
    expect(body.success).toBe(true);
    expect(body.total).toBe(241);
    expect(body.data[0]).toMatchObject({ funcionario_id:'1',status:'conforme' });
    expect(body.data[240]).toMatchObject({ funcionario_id:'241',status:'nao_conforme' });
    expect(calls.every(c => c.binds.length <= 100)).toBe(true);
    expect(calls.filter(c => c.sql.includes('WITH qualificacoes_ativas AS'))).toHaveLength(3);
    expect(calls.filter(c => c.sql.includes('FROM licencas'))).toHaveLength(3);
    expect(calls.filter(c => c.sql.includes('FROM lms_matriculas'))).toHaveLength(3);
  });

  it('erro de LMS ou regras de requisitos responde 500, nunca lista conforme sem fonte', async () => {
    for (const failure of ['lms','requirements'] as const) {
      const { request } = fixture(failure);
      const result = await request();
      expect(result.status).toBe(500);
      const body = await result.json() as { success:boolean };
      expect(body.success).toBe(false);
    }
  });
});
