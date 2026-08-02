import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const TEST_EMPRESA_ID = 1;
const COUNTS = [0, 1, 90, 91, 180, 400] as const;

type MockAuthContext = {
  set: (key: string, value: unknown) => void;
};

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: MockAuthContext, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', 'admin');
    c.set('empresaId', TEST_EMPRESA_ID);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => TEST_EMPRESA_ID,
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({ mode: 'all', setorIds: [], funcionarioId: null }),
  filterRequestedSetorIdsByAccess: (requested: number[]) => requested,
}));

import treinamentosPlanejadosRoutes from '../../routes/treinamentos-planejados';

type DbCall = {
  query: string;
  args: unknown[];
  method: 'all' | 'first' | 'run' | 'batch';
};

type MockOptions = {
  count: number;
  failParticipantChunk?: number;
};

function trainingIds(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function turmaRow(id: number) {
  return {
    id,
    empresa_id: TEST_EMPRESA_ID,
    qualificacao_tipo_id: 9,
    qualificacao_nome: 'CRM',
    qualificacao_codigo: 'CRM',
    data_prevista: `${2000 + id}-01-01`,
    hora_inicio: '08:00',
    hora_fim: '10:00',
    status: 'PLANEJADO',
    instrutor_id: 9000 + id,
    instrutor_nome: `Instrutor ${id}`,
    instrutor_guerra: null,
    local: 'Sala',
    carga_horaria_prevista: 2,
    titulo: `Turma ${id}`,
    descricao: null,
    observacoes: null,
    created_by: 99,
    created_at: '2026-08-02 00:00:00',
    updated_at: '2026-08-02 00:00:00',
    codigo_turma: null,
    modalidade: 'TEORICO',
    data_inicio: `${2000 + id}-01-01`,
    data_fim: `${2000 + id}-01-01`,
    base: null,
    sala: null,
    equipamento_descricao: null,
    limite_participantes: null,
    convocados_total: 1,
    confirmados_total: 0,
    presentes_total: 0,
  };
}

function idsFromArgs(args: unknown[], fixedBindCount: number): number[] {
  return args.slice(fixedBindCount).map(Number);
}

function isTurmaListQuery(query: string): boolean {
  return query.includes('COUNT(tp.id) AS convocados_total');
}

function isParticipantExpansionQuery(query: string): boolean {
  return (
    query.includes('FROM treinamentos_participantes tp') &&
    query.includes('tp.treinamento_id IN') &&
    query.includes('qualificacao_historico_status')
  );
}

function isDayExpansionQuery(query: string): boolean {
  return (
    query.includes('SELECT td.id, td.treinamento_id') && query.includes('FROM treinamentos_dias td')
  );
}

function isDayFallbackQuery(query: string): boolean {
  return query.includes('SELECT t.id * -1 AS id, t.id AS treinamento_id');
}

function isPresenceExpansionQuery(query: string): boolean {
  return query.includes('FROM treinamentos_presencas pr');
}

function isInstructorExpansionQuery(query: string): boolean {
  return (
    query.includes('SELECT ti.treinamento_id') && query.includes('FROM treinamentos_instrutores ti')
  );
}

function isInstructorFallbackQuery(query: string): boolean {
  return (
    query.includes('SELECT t.id AS treinamento_id') &&
    query.includes('FROM treinamentos_planejados t') &&
    query.includes('FROM treinamentos_instrutores ti')
  );
}

function createChunkingDb(options: MockOptions) {
  const calls: DbCall[] = [];
  let participantChunkIndex = 0;

  const executeAll = async (query: string, args: unknown[]) => {
    calls.push({ query, args, method: 'all' });
    if (args.length > 100) {
      throw new Error(`statement exceeded bind limit: ${args.length}`);
    }

    if (query.includes('PRAGMA table_info(')) return { results: [] };
    if (isTurmaListQuery(query)) {
      return { results: trainingIds(options.count).map(turmaRow) };
    }
    if (isParticipantExpansionQuery(query)) {
      const currentChunk = participantChunkIndex;
      participantChunkIndex += 1;
      if (options.failParticipantChunk === currentChunk) {
        throw new Error(`participant chunk ${currentChunk} failed`);
      }
      expect(args[0]).toBe(TEST_EMPRESA_ID);
      return {
        results: idsFromArgs(args, 1).map((treinamentoId) => ({
          id: treinamentoId * 10,
          treinamento_id: treinamentoId,
          funcionario_id: 10000 + treinamentoId,
          funcionario_nome: `Pessoa ${String(treinamentoId).padStart(3, '0')}`,
          funcionario_guerra: null,
          funcionario_matricula: String(treinamentoId),
          funcionario_email: `pessoa${treinamentoId}@example.com`,
          funcionario_setor: 'OPS',
          funcionario_funcao: 'Piloto',
          confirmado: 0,
          presente: null,
          aprovado: null,
          nota: null,
          observacoes: null,
          qualificacao_historico_id: null,
          qualificacao_historico_status: null,
          status_participacao: 'MATRICULADO',
          resultado: null,
          conceito: null,
          data_conclusao_efetiva: null,
          concluido_em: null,
        })),
      };
    }
    if (isDayExpansionQuery(query)) {
      expect(args.slice(0, 2)).toEqual([TEST_EMPRESA_ID, TEST_EMPRESA_ID]);
      return {
        results: idsFromArgs(args, 2).map((treinamentoId) => ({
          id: treinamentoId * 100,
          treinamento_id: treinamentoId,
          data: `${2000 + treinamentoId}-01-01`,
          hora_inicio: '08:00',
          hora_fim: '10:00',
          local: 'Sala',
          instrutor_id: 9000 + treinamentoId,
          instrutor_nome: `Instrutor ${treinamentoId}`,
          simulador_id: null,
          aeronave_id: null,
          sessao_id: null,
          status: 'ATIVO',
          observacoes: null,
        })),
      };
    }
    if (isDayFallbackQuery(query)) {
      expect(args[0]).toBe(TEST_EMPRESA_ID);
      return { results: [] };
    }
    if (isPresenceExpansionQuery(query)) {
      expect(args.slice(0, 2)).toEqual([TEST_EMPRESA_ID, TEST_EMPRESA_ID]);
      return { results: [] };
    }
    if (isInstructorExpansionQuery(query)) {
      expect(args.slice(0, 2)).toEqual([TEST_EMPRESA_ID, TEST_EMPRESA_ID]);
      return {
        results: idsFromArgs(args, 2).map((treinamentoId) => ({
          treinamento_id: treinamentoId,
          funcionario_id: 9000 + treinamentoId,
          nome: `Instrutor ${treinamentoId}`,
          guerra: null,
          papel: 'INSTRUTOR',
          principal: 1,
        })),
      };
    }
    if (isInstructorFallbackQuery(query)) {
      expect(args[0]).toBe(TEST_EMPRESA_ID);
      return { results: [] };
    }

    throw new Error(`Unhandled query: ${query}`);
  };

  const db = {
    prepare: vi.fn((query: string) => ({
      all: async () => executeAll(query, []),
      first: async () => {
        calls.push({ query, args: [], method: 'first' as const });
        return query.includes('sqlite_master') ? { cnt: 1 } : null;
      },
      run: async () => {
        calls.push({ query, args: [], method: 'run' as const });
        throw new Error('read test must not mutate');
      },
      bind: (...args: unknown[]) => ({
        all: async () => executeAll(query, args),
        first: async () => {
          calls.push({ query, args, method: 'first' as const });
          if (args.length > 100) throw new Error(`statement exceeded bind limit: ${args.length}`);
          return query.includes('sqlite_master') ? { cnt: 1 } : null;
        },
        run: async () => {
          calls.push({ query, args, method: 'run' as const });
          throw new Error('read test must not mutate');
        },
      }),
    })),
    batch: vi.fn(async () => {
      calls.push({ query: 'BATCH', args: [], method: 'batch' as const });
      throw new Error('read test must not batch mutations');
    }),
  } as unknown as D1Database;

  return { db, calls };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/treinamentos', treinamentosPlanejadosRoutes);
  return app;
}

async function request(db: D1Database) {
  return createApp().fetch(
    new Request('http://localhost/treinamentos/planejados?source=TURMA'),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

describe('treinamentos planejados bind chunking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(COUNTS)(
    'processa %i IDs sem exceder 100 binds, perder ou duplicar registros',
    async (count) => {
      const { db, calls } = createChunkingDb({ count });
      const response = await request(db);

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        success: boolean;
        data: {
          total: number;
          items: Array<{
            id: number;
            empresa_id: number;
            participantes: Array<{ treinamento_id: number }>;
            dias: Array<{ treinamento_id: number }>;
            instrutores: Array<{ funcionario_id: number }>;
          }>;
        };
      };
      const expectedIds = trainingIds(count);

      expect(body.success).toBe(true);
      expect(body.data.total).toBe(count);
      expect(body.data.items.map((item) => item.id)).toEqual(expectedIds);
      expect(new Set(body.data.items.map((item) => item.id)).size).toBe(count);
      expect(body.data.items.every((item) => item.empresa_id === TEST_EMPRESA_ID)).toBe(true);
      expect(
        body.data.items.flatMap((item) => item.participantes.map((row) => row.treinamento_id)),
      ).toEqual(expectedIds);
      expect(body.data.items.flatMap((item) => item.dias.map((row) => row.treinamento_id))).toEqual(
        expectedIds,
      );
      expect(body.data.items.flatMap((item) => item.instrutores)).toHaveLength(count);

      const boundCalls = calls.filter((call) => call.args.length > 0);
      expect(boundCalls.every((call) => call.args.length <= 100)).toBe(true);
      expect(calls.some((call) => call.method === 'run' || call.method === 'batch')).toBe(false);

      const participantCalls = calls.filter(
        (call) => call.method === 'all' && isParticipantExpansionQuery(call.query),
      );
      expect(participantCalls).toHaveLength(count === 0 ? 0 : Math.ceil(count / 90));
      expect(participantCalls.flatMap((call) => idsFromArgs(call.args, 1))).toEqual(expectedIds);
    },
  );

  it('propaga falha intermediária sem responder com expansão parcial', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { db, calls } = createChunkingDb({ count: 180, failParticipantChunk: 1 });

    const response = await request(db);

    expect(response.status).toBe(500);
    const participantCalls = calls.filter(
      (call) => call.method === 'all' && isParticipantExpansionQuery(call.query),
    );
    expect(participantCalls).toHaveLength(2);
    expect(participantCalls.every((call) => call.args.length <= 100)).toBe(true);
  });
});
