import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 10);
    c.set('userId', 101);
    c.set('userEmail', 'admin@tenant.local');
    c.set('userRole', 'admin');

    if (empresaId > 0) {
      c.set('empresaId', empresaId);
      c.set('tenantContext', {
        empresaId,
        empresaCodigo: `emp-${empresaId}`,
        empresaNome: `Empresa ${empresaId}`,
        role: 'admin',
        plano: 'pro',
        permissions: ['*'],
      });
    }

    await next();
  },
}));

import adminRoutes from '../../routes/admin';

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  run: () => Promise<{ success: boolean; meta: { changes: number; last_row_id?: number } }>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  first: <T = unknown>() => Promise<T | null>;
};

type Modelo = {
  id: number;
  codigo: string;
  empresa_id: number;
  deleted_at: string | null;
};

type Agendamento = {
  id: number;
  template_id: number | null;
  empresa_id: number;
  deleted_at: string | null;
};

type Ficha = {
  id: number;
  agendamento_slot_id: number;
  tipo_sessao: string;
  status: string;
  aprovado: number;
  empresa_id: number;
  deleted_at: string | null;
};

type SessaoCheck = {
  id: number;
  sessao_id: number;
  qualificacao_tipo_id: number;
  deleted_at: string | null;
};

type MockState = {
  modelos: Modelo[];
  agendamentos: Agendamento[];
  fichas: Ficha[];
  modeloChecks: Set<string>;
  sessaoChecks: SessaoCheck[];
  resultados: Set<number>;
  nextSessaoCheckId: number;
  writes: Array<{ sql: string; binds: unknown[] }>;
};

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function modeloCheckKey(modeloId: number, qualificacaoTipoId: number): string {
  return `${modeloId}:${qualificacaoTipoId}`;
}

function createState(): MockState {
  return {
    modelos: [
      { id: 100, codigo: 'PER', empresa_id: 10, deleted_at: null },
      { id: 101, codigo: 'PER', empresa_id: 20, deleted_at: null },
    ],
    agendamentos: [
      { id: 200, template_id: 100, empresa_id: 10, deleted_at: null },
      { id: 201, template_id: 101, empresa_id: 20, deleted_at: null },
      { id: 300, template_id: null, empresa_id: 10, deleted_at: null },
      { id: 301, template_id: null, empresa_id: 20, deleted_at: null },
    ],
    fichas: [
      {
        id: 1,
        agendamento_slot_id: 200,
        tipo_sessao: 'PER',
        status: 'APROVADO',
        aprovado: 1,
        empresa_id: 10,
        deleted_at: null,
      },
      {
        id: 2,
        agendamento_slot_id: 201,
        tipo_sessao: 'PER',
        status: 'APROVADO',
        aprovado: 1,
        empresa_id: 20,
        deleted_at: null,
      },
      {
        id: 3,
        agendamento_slot_id: 300,
        tipo_sessao: 'PER',
        status: 'APROVADO',
        aprovado: 1,
        empresa_id: 10,
        deleted_at: null,
      },
      {
        id: 4,
        agendamento_slot_id: 301,
        tipo_sessao: 'PER',
        status: 'APROVADO',
        aprovado: 1,
        empresa_id: 20,
        deleted_at: null,
      },
    ],
    modeloChecks: new Set(),
    sessaoChecks: [
      { id: 1, sessao_id: 200, qualificacao_tipo_id: 501, deleted_at: null },
      { id: 2, sessao_id: 201, qualificacao_tipo_id: 502, deleted_at: null },
    ],
    resultados: new Set(),
    nextSessaoCheckId: 3,
    writes: [],
  };
}

function createBackfillDb(state: MockState): D1Database {
  function tenantModelos(empresaId: number) {
    return state.modelos.filter((modelo) => modelo.empresa_id === empresaId && modelo.deleted_at === null);
  }

  function approvedFichaForAgendamento(agendamentoId: number, empresaId?: number) {
    return state.fichas.find((ficha) => {
      if (ficha.agendamento_slot_id !== agendamentoId) return false;
      if (ficha.deleted_at !== null) return false;
      if (!['APROVADO', 'CONCLUIDA'].includes(ficha.status)) return false;
      if (ficha.aprovado !== 1) return false;
      if (empresaId !== undefined && ficha.empresa_id !== empresaId) return false;
      return true;
    });
  }

  const db = {
    prepare(sqlRaw: string): MockStatement {
      const sql = normalizeSql(sqlRaw);
      let binds: unknown[] = [];

      const stmt: MockStatement = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },

        async all<T = unknown>() {
          if (sql.includes('SELECT DISTINCT sa.template_id AS modelo_id')) {
            expect(sql).toContain('sa.empresa_id = ?');
            expect(sql).toContain('ms.empresa_id = ?');
            const [agendamentoEmpresaId, modeloEmpresaId] = binds.map(Number);
            const rows = state.sessaoChecks
              .filter((check) => check.deleted_at === null)
              .flatMap((check) => {
                const agendamento = state.agendamentos.find(
                  (item) =>
                    item.id === check.sessao_id &&
                    item.deleted_at === null &&
                    item.template_id !== null &&
                    item.empresa_id === agendamentoEmpresaId,
                );
                if (!agendamento || agendamento.template_id === null) return [];

                const modelo = tenantModelos(modeloEmpresaId).find((item) => item.id === agendamento.template_id);
                if (!modelo) return [];

                return [{ modelo_id: modelo.id, qualificacao_tipo_id: check.qualificacao_tipo_id }];
              });

            return { results: rows as T[] };
          }

          if (sql.includes('SELECT DISTINCT sa.id, f.tipo_sessao')) {
            expect(sql).toContain('sa.empresa_id = ?');
            expect(sql).toContain('f.empresa_id = ?');
            const [agendamentoEmpresaId, fichaEmpresaId] = binds.map(Number);
            const rows = state.agendamentos
              .filter(
                (agendamento) =>
                  agendamento.template_id === null &&
                  agendamento.deleted_at === null &&
                  agendamento.empresa_id === agendamentoEmpresaId,
              )
              .flatMap((agendamento) => {
                const ficha = approvedFichaForAgendamento(agendamento.id, fichaEmpresaId);
                return ficha ? [{ id: agendamento.id, tipo_sessao: ficha.tipo_sessao }] : [];
              });

            return { results: rows as T[] };
          }

          if (sql.includes('SELECT id FROM modelos_sessao') && sql.includes('WHERE codigo = ?')) {
            expect(sql).toContain('empresa_id = ?');
            const [codigo, empresaId] = [String(binds[0]), Number(binds[1])];
            const rows = state.modelos
              .filter(
                (modelo) =>
                  modelo.codigo === codigo && modelo.empresa_id === empresaId && modelo.deleted_at === null,
              )
              .map((modelo) => ({ id: modelo.id }));

            return { results: rows as T[] };
          }

          if (sql.includes('SELECT msc.qualificacao_tipo_id')) {
            expect(sql).toContain('ms.empresa_id = ?');
            const [modeloId, empresaId] = [Number(binds[0]), Number(binds[1])];
            const modelo = tenantModelos(empresaId).find((item) => item.id === modeloId);
            if (!modelo) return { results: [] as T[] };

            const rows = Array.from(state.modeloChecks)
              .map((key) => key.split(':').map(Number))
              .filter(([storedModeloId]) => storedModeloId === modeloId)
              .map(([, qualificacaoTipoId]) => ({ qualificacao_tipo_id: qualificacaoTipoId }));

            return { results: rows as T[] };
          }

          if (sql.includes('SELECT DISTINCT sc.id as check_id')) {
            expect(sql).toContain('sa.empresa_id = ?');
            expect(sql).toContain('f.empresa_id = ?');
            const [agendamentoEmpresaId, fichaEmpresaId] = binds.map(Number);
            const rows = state.sessaoChecks
              .filter((check) => check.deleted_at === null && !state.resultados.has(check.id))
              .flatMap((check) => {
                const agendamento = state.agendamentos.find(
                  (item) =>
                    item.id === check.sessao_id &&
                    item.deleted_at === null &&
                    item.empresa_id === agendamentoEmpresaId,
                );
                if (!agendamento) return [];
                return approvedFichaForAgendamento(agendamento.id, fichaEmpresaId)
                  ? [{ check_id: check.id }]
                  : [];
              });

            return { results: rows as T[] };
          }

          return { results: [] as T[] };
        },

        async first<T = unknown>() {
          if (sql.includes('FROM modelos_sessao_checks msc') && sql.includes('msc.qualificacao_tipo_id = ?')) {
            expect(sql).toContain('ms.empresa_id = ?');
            const [modeloId, qualificacaoTipoId, empresaId] = binds.map(Number);
            const modelo = tenantModelos(empresaId).find((item) => item.id === modeloId);
            if (!modelo) return null;
            return (state.modeloChecks.has(modeloCheckKey(modeloId, qualificacaoTipoId))
              ? { id: 900 }
              : null) as T | null;
          }

          if (sql.includes('FROM sessoes_checks sc') && sql.includes('sc.qualificacao_tipo_id = ?')) {
            expect(sql).toContain('sa.empresa_id = ?');
            const [sessaoId, qualificacaoTipoId, empresaId] = binds.map(Number);
            const agendamento = state.agendamentos.find(
              (item) => item.id === sessaoId && item.empresa_id === empresaId && item.deleted_at === null,
            );
            if (!agendamento) return null;
            const check = state.sessaoChecks.find(
              (item) =>
                item.sessao_id === sessaoId &&
                item.qualificacao_tipo_id === qualificacaoTipoId &&
                item.deleted_at === null,
            );
            return (check ? { id: check.id } : null) as T | null;
          }

          return null;
        },

        async run() {
          state.writes.push({ sql, binds });

          const normalizedWriteSql = sql.toUpperCase();
          if (
            normalizedWriteSql.startsWith('INSERT INTO AUDITORIA') ||
            normalizedWriteSql.startsWith('INSERT INTO AUDIT_EVENTS_V2')
          ) {
            return { success: true, meta: { changes: 1, last_row_id: 9999 } };
          }

          if (sql.startsWith('INSERT INTO modelos_sessao_checks')) {
            const [modeloId, qualificacaoTipoId] = binds.map(Number);
            state.modeloChecks.add(modeloCheckKey(modeloId, qualificacaoTipoId));
            return { success: true, meta: { changes: 1, last_row_id: 901 } };
          }

          if (sql.startsWith('UPDATE simulador_agendamentos')) {
            expect(sql).toContain('empresa_id = ?');
            const [modeloId, agendamentoId, empresaId] = binds.map(Number);
            const agendamento = state.agendamentos.find(
              (item) => item.id === agendamentoId && item.empresa_id === empresaId,
            );
            if (!agendamento) {
              return { success: true, meta: { changes: 0 } };
            }
            agendamento.template_id = modeloId;
            return { success: true, meta: { changes: 1 } };
          }

          if (sql.startsWith('INSERT INTO sessoes_checks_resultados')) {
            const checkId = Number(binds[0]);
            state.resultados.add(checkId);
            return { success: true, meta: { changes: 1, last_row_id: 1000 + checkId } };
          }

          if (sql.startsWith('INSERT INTO sessoes_checks')) {
            const [sessaoId, qualificacaoTipoId] = binds.map(Number);
            const id = state.nextSessaoCheckId++;
            state.sessaoChecks.push({
              id,
              sessao_id: sessaoId,
              qualificacao_tipo_id: qualificacaoTipoId,
              deleted_at: null,
            });
            return { success: true, meta: { changes: 1, last_row_id: id } };
          }

          throw new Error(`Unexpected write: ${sql}`);
        },
      };

      return stmt;
    },

    async batch(statements: MockStatement[]) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  };

  return db as unknown as D1Database;
}

describe('admin backfill-session-checks tenant scope', () => {
  it('executa backfill apenas no tenant atual e preserva dados de outro tenant', async () => {
    const state = createState();
    const db = createBackfillDb(state);

    const response = await adminRoutes.fetch(
      new Request('http://localhost/backfill-session-checks', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 10 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        modelos_checks_inseridos: 1,
        agendamentos_linkados: 1,
        checks_criados: 1,
        resultados_criados: 2,
        erros: [],
      },
    });

    expect(state.modeloChecks.has(modeloCheckKey(100, 501))).toBe(true);
    expect(state.modeloChecks.has(modeloCheckKey(101, 502))).toBe(false);
    expect(state.agendamentos.find((item) => item.id === 300)?.template_id).toBe(100);
    expect(state.agendamentos.find((item) => item.id === 301)?.template_id).toBeNull();
    expect(state.sessaoChecks).toEqual(
      expect.arrayContaining([{ id: 3, sessao_id: 300, qualificacao_tipo_id: 501, deleted_at: null }]),
    );
    expect(state.sessaoChecks.some((item) => item.sessao_id === 301)).toBe(false);
    expect(Array.from(state.resultados).sort()).toEqual([1, 3]);

    const businessWrites = state.writes.filter((write) => {
      const normalizedWriteSql = write.sql.toUpperCase();
      return (
        !normalizedWriteSql.startsWith('INSERT INTO AUDITORIA') &&
        !normalizedWriteSql.startsWith('INSERT INTO AUDIT_EVENTS_V2')
      );
    });
    expect(
      businessWrites.some((write) => write.binds.includes(101) || write.binds.includes(301)),
    ).toBe(false);

    const legacyAudit = state.writes.find((write) =>
      write.sql.toUpperCase().startsWith('INSERT INTO AUDITORIA'),
    );
    expect(legacyAudit).toBeDefined();
    const legacyPayload = JSON.parse(String(legacyAudit?.binds[6]));
    expect(legacyPayload).toMatchObject({
      modelos_checks_inseridos: 1,
      agendamentos_associados: 1,
      checks_criados: 1,
      resultados_criados: 2,
      error_count: 0,
    });

    const canonicalAudit = state.writes.find((write) =>
      write.sql.toUpperCase().startsWith('INSERT INTO AUDIT_EVENTS_V2'),
    );
    expect(canonicalAudit).toBeDefined();
    expect(canonicalAudit?.binds[1]).toBe(10);
    expect(canonicalAudit?.binds[2]).toBe(10);
    expect(canonicalAudit?.binds[13]).toBe('ADMIN_OPERATION');
    expect(canonicalAudit?.binds[14]).toBe('BACKFILL_SESSION_CHECKS');
    const canonicalMetadata = JSON.parse(String(canonicalAudit?.binds[20]));
    expect(canonicalMetadata).toMatchObject({
      operation: 'BACKFILL_SESSION_CHECKS',
      scope: 'tenant',
      count: 5,
    });
  });

  it('mantem idempotencia dentro do tenant', async () => {
    const state = createState();
    const db = createBackfillDb(state);

    await adminRoutes.fetch(
      new Request('http://localhost/backfill-session-checks', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 10 } as unknown as Env,
      {} as ExecutionContext,
    );

    const response = await adminRoutes.fetch(
      new Request('http://localhost/backfill-session-checks', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 10 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        modelos_checks_inseridos: 0,
        agendamentos_linkados: 0,
        checks_criados: 0,
        resultados_criados: 0,
        erros: [],
      },
    });
  });

  it('bloqueia admin sem tenant em vez de executar backfill global', async () => {
    const db = {
      prepare: vi.fn(() => {
        throw new Error('DB should not be touched without tenant scope');
      }),
    } as unknown as D1Database;

    const response = await adminRoutes.fetch(
      new Request('http://localhost/backfill-session-checks', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 0 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'tenant_scope_required',
    });
  });
});