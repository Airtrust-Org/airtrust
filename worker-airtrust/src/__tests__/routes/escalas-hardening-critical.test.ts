import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', c.req.header('x-user-id') || 'user-1');
    c.set('userRole', c.req.header('x-role') || 'manager');
    c.set('empresaId', Number(c.req.header('x-empresa-id') || 1));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: vi.fn(async () => undefined),
}));

import escalasRoutes from '../../routes/escalas';
import {
  regenerarEventosAutomaticosFuncionarioEscala,
} from '../../routes/escalas-alocacoes-engine';
import { substituirAlocacaoSobreposta } from '../../routes/escalas-alocacoes';

type QueryLog = { sql: string; binds: unknown[]; method: 'first' | 'all' | 'run' };

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createEscalasHardeningDb() {
  const logs: QueryLog[] = [];

  const db = {
    prepare: vi.fn((sql: string) => {
      const normalized = normalizeSql(sql);
      let binds: unknown[] = [];

      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          logs.push({ sql: normalized, binds, method: 'first' });

          if (normalized.includes('FROM escalas_mensais') && normalized.includes('WHERE empresa_id = ?')) {
            return {
              id: 'esc-1',
              nome: 'Escala Junho',
              mes: 6,
              ano: 2026,
              status: 'publicada',
            } as T;
          }

          if (normalized.includes('FROM usuarios u JOIN funcionarios f ON f.id = u.funcionario_id')) {
            return { id: 'func-1' } as T;
          }

          if (normalized.includes('FROM funcionarios') && normalized.includes('empresa_id = ?')) {
            const [funcionarioId, empresaId] = binds as [string, number];
            if (funcionarioId === 'func-1' && empresaId === 1) {
              return { id: 'func-1' } as T;
            }
            return null as T | null;
          }

          if (
            normalized.includes('FROM frms_jornada') &&
            normalized.includes('horas_voo_minutos')
          ) {
            return { total_jornadas: 4, total_minutos: 600 } as T;
          }

          if (normalized.includes('SELECT ano, mes FROM escalas_mensais')) {
            const [escalaId, empresaId] = binds as [string, number];
            if (escalaId === 'esc-1' && empresaId === 1) {
              return { ano: 2026, mes: 6 } as T;
            }
            return null as T | null;
          }

          if (normalized.includes('FROM escala_alocacoes ea') && normalized.includes('WHERE ea.id = ?')) {
            return {
              id: 'conf-1',
              escala_id: 'esc-1',
              aeronave_id: 10,
              funcionario_id: 'func-1',
              quinzena_id: 2,
              situacao_tipo: null,
              mes: 6,
              ano: 2026,
            } as T;
          }

          return null as T | null;
        },
        all: async <T = unknown>() => {
          logs.push({ sql: normalized, binds, method: 'all' });

          if (normalized.includes('FROM escala_eventos') && normalized.includes('WHERE escala_id = ?')) {
            return {
              results: [
                {
                  id: 'evt-1',
                  tipo_evento: 'voo',
                  data_inicio: '2026-06-10',
                  data_fim: '2026-06-10',
                  turno: 'manha',
                  local: 'SBSP',
                  aeronave: 'PR-ABC',
                  observacoes: null,
                  status: 'confirmado',
                  gerado_automaticamente: 0,
                },
              ] as T[],
            };
          }

          if (normalized.includes('SELECT DISTINCT data FROM frms_jornada')) {
            return { results: [{ data: '2026-06-10' }, { data: '2026-06-11' }] as T[] };
          }

          if (normalized.includes('FROM escala_alocacoes ea JOIN escalas_mensais em ON em.id = ea.escala_id')) {
            return { results: [] as T[] };
          }

          return { results: [] as T[] };
        },
        run: async () => {
          logs.push({ sql: normalized, binds, method: 'run' });
          return { meta: { changes: 1 } };
        },
      };

      return statement;
    }),
  } as unknown as D1Database;

  return { db, logs };
}

describe('escalas hardening critical fixes', () => {
  it('usa escalas_mensais em /minha-escala e retorna a escala do funcionario autenticado', async () => {
    const { db, logs } = createEscalasHardeningDb();

    const response = await escalasRoutes.fetch(
      new Request('http://localhost/minha-escala?mes=6&ano=2026', {
        method: 'GET',
        headers: { 'x-empresa-id': '1', 'x-user-id': 'user-1' },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload.success).toBe(true);
    expect(payload.data.escala.id).toBe('esc-1');
    expect(logs.some((entry) => entry.sql.includes('FROM escalas_mensais'))).toBe(true);
    expect(logs.some((entry) => entry.sql.includes('FROM escala_mensal'))).toBe(false);
  });

  it('bloqueia /frms-score quando o funcionario nao pertence ao tenant autenticado', async () => {
    const { db } = createEscalasHardeningDb();

    const response = await escalasRoutes.fetch(
      new Request('http://localhost/frms-score/func-outro-tenant', {
        method: 'GET',
        headers: { 'x-empresa-id': '1' },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Funcionário não encontrado',
    });
  });

  it('escopa o score FRMS pelo tenant antes de consultar jornadas', async () => {
    const { db, logs } = createEscalasHardeningDb();

    const response = await escalasRoutes.fetch(
      new Request('http://localhost/frms-score/func-1', {
        method: 'GET',
        headers: { 'x-empresa-id': '1' },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload.success).toBe(true);
    expect(typeof payload.data.total_horas_30d).toBe('number');

    const frmsQuery = logs.find(
      (entry) =>
        entry.method === 'first' &&
        entry.sql.includes('FROM frms_jornada') &&
        entry.sql.includes('horas_voo_minutos'),
    );
    expect(frmsQuery?.sql).toContain('f.empresa_id = ?');
    expect(frmsQuery?.binds).toEqual(['func-1', 1]);
  });

  it('exige empresa_id valido para regenerar eventos automaticos da escala', async () => {
    const { db, logs } = createEscalasHardeningDb();

    const result = await regenerarEventosAutomaticosFuncionarioEscala({
      db,
      empresa_id: 1,
      escala_id: 'esc-outro-tenant',
      funcionario_id: 'func-1',
      created_by: 'user-1',
    });

    expect(result).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0].sql).toContain('empresa_id = ?');
    expect(logs[0].binds).toEqual(['esc-outro-tenant', 1]);
  });

  it('escopa o soft-delete de eventos ao tenant na substituicao de alocacao sobreposta', async () => {
    const { db, logs } = createEscalasHardeningDb();

    await substituirAlocacaoSobreposta(db, {
      conflitoId: 'conf-1',
      empresaId: 1,
      userId: 'user-1',
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      } as any,
    });

    const eventosUpdate = logs.find(
      (entry) => entry.method === 'run' && entry.sql.includes('UPDATE escala_eventos'),
    );
    expect(eventosUpdate?.sql).toContain('em.empresa_id = ?');
    expect(eventosUpdate?.binds[3]).toBe(1);
  });
});
