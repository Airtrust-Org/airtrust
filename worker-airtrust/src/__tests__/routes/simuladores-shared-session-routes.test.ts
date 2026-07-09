import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', 6);
    c.set('tenantContext', {
      empresaId: 6,
      empresaCodigo: 'tenant-6',
      empresaNome: 'Tenant 6',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

let mockConflict: any = null;

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    findSessaoConflict: vi.fn(async () => mockConflict),
    audit: vi.fn(async () => undefined),
    getSimuladorModeloAeronave: vi.fn(async () => 'AW139'),
    criarQualificacoesPlanejadas: vi.fn(async () => ({
      criadas: 0,
      puladas: 0,
      conflitosUniques: 0,
      bloqueadasDataPassada: 0,
    })),
  };
});

import sharedSessionRoutes from '../../routes/simuladores-shared-session';

type QueryRun = { query: string; args: unknown[] };

function createDbForSharedRoutes(options?: { modeloSemManobras?: boolean }) {
  const batches: Array<Array<QueryRun>> = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        statement: { query },
        args,
        first: async () => {
          if (query === 'SELECT id FROM simulador_agendamentos WHERE uuid = ? LIMIT 1') {
            return { id: 9901 };
          }

          if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
            return { id: Number(args[0]) };
          }

          if (query.includes('FROM simuladores') && query.includes('WHERE id = ?')) {
            return { id: Number(args[0]) };
          }

          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            return { total: args.length > 0 ? Number(args.length - 1) : 0 };
          }

          if (query.includes('FROM treinamentos_planejados')) {
            return { total: args.length > 0 ? Number(args.length - 1) : 0 };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('COALESCE(modo_compartilhado, 0) = 1')) {
            return {
              id: 9901,
              uuid: 'shared-session-uuid',
              simulador_id: 10,
              funcionario_id: 101,
              data: '2026-06-20',
              hora_inicio: '07:00',
              hora_fim: '09:00',
              duracao_minutos: 120,
              instrutor_id: 201,
              tipo_sessao: 'PER',
              template_id: 2001,
              status: 'AGENDADO',
              observacoes: null,
              nome: 'Sessão compartilhada',
              empresa_id: 6,
              modo_compartilhado: 1,
              deleted_at: null,
            };
          }

          return null;
        },
        all: async () => {
          if (query === 'PRAGMA table_info(simulador_agendamentos)') {
            return {
              results: [
                { name: 'id' },
                { name: 'simulador_id' },
                { name: 'aeronave_id' },
                { name: 'tipo_dispositivo' },
                { name: 'empresa_id' },
                { name: 'modo_compartilhado' },
              ],
            };
          }

          if (query.includes('FROM modelos_sessao ms')) {
            return {
              results: [
                {
                  id: 2001,
                  codigo: 'PER',
                  nome: 'Modelo A',
                  tipo_sessao_codigo: 'PER',
                  gera_qualificacao: 0,
                  qualificacao_tipo_id: null,
                },
                {
                  id: 2002,
                  codigo: 'PER',
                  nome: 'Modelo B',
                  tipo_sessao_codigo: 'PER',
                  gera_qualificacao: 0,
                  qualificacao_tipo_id: null,
                },
              ],
            };
          }

          if (query.includes('FROM modelos_sessao_manobras')) {
            return {
              results: options?.modeloSemManobras
                ? []
                : [
                    {
                      codigo: 'MNV-001',
                      nome: 'Manobra 1',
                      descricao: 'Manobra 1',
                      categoria: 'GERAL',
                      ordem: 1,
                      tripulante: 'AB',
                    },
                  ],
            };
          }

          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1, last_row_id: 9901 } }),
      }),
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 1, last_row_id: 9901 } }),
    })),
    batch: vi.fn(async (statements: Array<{ run?: () => Promise<any>; statement?: { query?: string }; args?: unknown[] }>) => {
      batches.push(
        statements.map((statement) => ({
          query: String(statement.statement?.query || ''),
          args: statement.args || [],
        })),
      );
      return [];
    }),
  } as unknown as D1Database;

  return { db, batches };
}

describe('simuladores shared session routes', () => {
  const executionContext = {
    waitUntil: vi.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    mockConflict = null;
  });

  it('returns 404 when the shared-session feature flag is disabled', async () => {
    const { db } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'false' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(404);
  });

  it('rejects an external simulator conflict before writing any shared rows', async () => {
    const { db, batches } = createDbForSharedRoutes();
    mockConflict = { id: 88, hora_inicio: '07:00', hora_fim: '09:00' };

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [
            {
              funcionario_id: 101,
              cumpre_treinamento: true,
              treinamento_planejado_id: 1001,
              modelo_sessao_id: 2001,
              gera_ficha: true,
            },
            {
              funcionario_id: 102,
              cumpre_treinamento: true,
              treinamento_planejado_id: 1002,
              modelo_sessao_id: 2002,
              gera_ficha: true,
            },
          ],
          segmentos: [
            {
              inicio: '07:00',
              fim: '08:00',
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              funcoes: [
                { funcionario_id: 102, funcao: 'PF' },
                { funcionario_id: 101, funcao: 'PM' },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(400);
    expect(batches).toHaveLength(0);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Conflito externo de simulador',
    });
  });

  it('creates a shared session through a transactional batch without planned training ids', async () => {
    const { db, batches } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [
            {
              funcionario_id: 101,
              cumpre_treinamento: true,
              modelo_sessao_id: 2001,
              gera_ficha: true,
            },
            {
              funcionario_id: 102,
              cumpre_treinamento: true,
              modelo_sessao_id: 2002,
              gera_ficha: true,
            },
          ],
          segmentos: [
            {
              inicio: '07:00',
              fim: '08:00',
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              funcoes: [
                { funcionario_id: 102, funcao: 'PF' },
                { funcionario_id: 101, funcao: 'PM' },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(201);
    expect(batches).toHaveLength(1);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO simulador_agendamentos'))).toBe(true);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'))).toBe(true);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO simulador_agendamento_segmentos'))).toBe(true);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO simulador_segmento_participantes'))).toBe(true);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO fichas_sessao'))).toBe(true);
  });

  it('creates shared session even when ficha model has no specific manobras (NOTECHS always appended)', async () => {
    const { db, batches } = createDbForSharedRoutes({ modeloSemManobras: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [
            {
              funcionario_id: 101,
              cumpre_treinamento: true,
              modelo_sessao_id: 2001,
              gera_ficha: true,
            },
            {
              funcionario_id: 102,
              cumpre_treinamento: true,
              modelo_sessao_id: 2002,
              gera_ficha: true,
            },
          ],
          segmentos: [
            {
              inicio: '07:00',
              fim: '08:00',
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              funcoes: [
                { funcionario_id: 102, funcao: 'PF' },
                { funcionario_id: 101, funcao: 'PM' },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    // NOTECHS items are always appended by buildOperationalFichaManobras,
    // so the session is created successfully even when the model has no specific manobras.
    // assertModeloSessaoTemManobras is effectively dead code until a product decision is made.
    expect(response.status).toBe(201);
  });
});
