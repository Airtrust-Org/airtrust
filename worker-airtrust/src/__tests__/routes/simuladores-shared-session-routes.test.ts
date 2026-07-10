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

function createDbForSharedRoutes(options?: {
  modeloSemManobras?: boolean;
  simuladorForaTenant?: boolean;
  missingSharedSession?: boolean;
  concludedFicha?: boolean;
  historicalLegacyOnly?: boolean;
}) {
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
            if (options?.simuladorForaTenant) {
              return null;
            }
            return { id: Number(args[0]) };
          }

          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            return { total: args.length > 0 ? Number(args.length - 1) : 0 };
          }

          if (query.includes('FROM treinamentos_planejados')) {
            return { total: args.length > 0 ? Number(args.length - 1) : 0 };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('COALESCE(modo_compartilhado, 0) = 1')) {
            if (options?.missingSharedSession) {
              return null;
            }
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

          if (query.includes('FROM simulador_atribuicoes_curriculares sac') && query.includes('sac.id = ?')) {
            return {
              id: Number(args[0]),
              agendamento_id: Number(args[1]),
              participante_id: 701,
              funcionario_id: 101,
            };
          }

          if (query.includes('FROM fichas_sessao') && query.includes('atribuicao_curricular_id = ?')) {
            return null;
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
            const requestedIds = new Set(
              args
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 1000),
            );
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
                {
                  id: 2003,
                  codigo: 'PER',
                  nome: 'Modelo C',
                  tipo_sessao_codigo: 'PER',
                  gera_qualificacao: 0,
                  qualificacao_tipo_id: null,
                },
              ].filter((modelo) => requestedIds.size === 0 || requestedIds.has(modelo.id)),
            };
          }

          if (query.includes('FROM sessoes_participantes sp') && query.includes('INNER JOIN funcionarios f')) {
            if (options?.missingSharedSession) {
              return { results: [] };
            }
            return {
              results: [
                {
                  id: 701,
                  uuid: 'participante-101',
                  funcionario_id: 101,
                  funcionario_nome: 'Piloto 101',
                  funcao: 'PIC',
                  status: 'CONFIRMADO',
                },
                {
                  id: 702,
                  uuid: 'participante-102',
                  funcionario_id: 102,
                  funcionario_nome: 'Piloto 102',
                  funcao: 'SIC',
                  status: 'CONFIRMADO',
                },
              ],
            };
          }

          if (query.includes('FROM simulador_atribuicoes_curriculares sac') && query.includes('INNER JOIN sessoes_participantes sp')) {
            if (options?.missingSharedSession) {
              return { results: [] };
            }
            return {
              results: [
                {
                  id: 501,
                  participante_id: 701,
                  funcionario_id: 101,
                  treinamento_planejado_id: 1001,
                  modelo_sessao_id: 2001,
                  gera_ficha: 1,
                },
                {
                  id: 502,
                  participante_id: 702,
                  funcionario_id: 102,
                  treinamento_planejado_id: 1002,
                  modelo_sessao_id: 2002,
                  gera_ficha: 1,
                },
              ],
            };
          }

          if (query.includes('FROM simulador_agendamento_segmentos') && query.includes('ORDER BY ordem ASC')) {
            if (options?.missingSharedSession) {
              return { results: [] };
            }
            return {
              results: [
                {
                  id: 801,
                  uuid: 'segmento-1',
                  empresa_id: 6,
                  agendamento_id: 9901,
                  ordem: 1,
                  inicio: '07:00',
                  fim: '08:00',
                  duracao_minutos: 60,
                  atribuicao_curricular_id: 501,
                  finalidade_codigo: 'SOP_NORMAL',
                  finalidade_titulo: 'SOP normal',
                  status: 'ATIVO',
                  deleted_at: null,
                },
                {
                  id: 802,
                  uuid: 'segmento-2',
                  empresa_id: 6,
                  agendamento_id: 9901,
                  ordem: 2,
                  inicio: '08:00',
                  fim: '09:00',
                  duracao_minutos: 60,
                  atribuicao_curricular_id: 502,
                  finalidade_codigo: 'ATUACAO_EXAMINADOR',
                  finalidade_titulo: 'Atuacao examinador',
                  status: 'ATIVO',
                  deleted_at: null,
                },
              ],
            };
          }

          if (query.includes('FROM simulador_segmento_atribuicoes ssa')) {
            if (options?.missingSharedSession || options?.historicalLegacyOnly) {
              return { results: [] };
            }
            return {
              results: [
                { id: 9001, segmento_id: 801, atribuicao_curricular_id: 501, participante_id: 701, funcionario_id: 101 },
                { id: 9002, segmento_id: 801, atribuicao_curricular_id: 502, participante_id: 702, funcionario_id: 102 },
                { id: 9003, segmento_id: 802, atribuicao_curricular_id: 501, participante_id: 701, funcionario_id: 101 },
                { id: 9004, segmento_id: 802, atribuicao_curricular_id: 502, participante_id: 702, funcionario_id: 102 },
              ],
            };
          }

          if (query.includes('FROM simulador_segmento_participantes ssp')) {
            if (options?.missingSharedSession) {
              return { results: [] };
            }
            return {
              results: [
                { id: 9101, segmento_id: 801, participante_id: 701, funcionario_id: 101, funcao: 'PF', duracao_minutos: 60 },
                { id: 9102, segmento_id: 801, participante_id: 702, funcionario_id: 102, funcao: 'PM', duracao_minutos: 60 },
                { id: 9103, segmento_id: 802, participante_id: 702, funcionario_id: 102, funcao: 'PF', duracao_minutos: 60 },
                { id: 9104, segmento_id: 802, participante_id: 701, funcionario_id: 101, funcao: 'PM', duracao_minutos: 60 },
              ],
            };
          }

          if (query.includes('FROM fichas_sessao fs') && query.includes('INNER JOIN funcionarios f')) {
            if (options?.missingSharedSession) {
              return { results: [] };
            }
            return {
              results: [
                {
                  id: 3001,
                  agendamento_slot_id: 9901,
                  colaborador_id_aluno: 101,
                  status: options?.concludedFicha ? 'CONCLUIDA' : 'AVALIACAO_PENDENTE',
                  aluno_nome: 'Piloto 101',
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
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'SOP_NORMAL',
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
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

  it('rejects a simulator from another tenant before writing any shared rows', async () => {
    const { db, batches } = createDbForSharedRoutes({ simuladorForaTenant: true });

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
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'SOP_NORMAL',
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
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
      error: 'Simulador fora do tenant',
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
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'SOP_NORMAL',
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
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
    expect(batches[0].filter((item) => item.query.startsWith('INSERT INTO simulador_segmento_atribuicoes'))).toHaveLength(4);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO simulador_segmento_participantes'))).toBe(true);
    expect(batches[0].some((item) => item.query.startsWith('INSERT INTO fichas_sessao'))).toBe(true);
  });

  it('allows the instructor to also be a non-curricular participant in the shared session', async () => {
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
          instrutor_id: 101,
          participantes: [
            {
              funcionario_id: 101,
              cumpre_treinamento: false,
              gera_ficha: false,
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
              atribuicao_funcionario_ids: [102],
              finalidade_codigo: 'SOP_NORMAL',
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_ids: [102],
              finalidade_codigo: 'SOP_ANORMAL_EMERGENCIA',
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
    expect(batches.length).toBeGreaterThan(0);
  });

  it('rejects a shared session when the supervisor instructor is a curricular trainee in examiner training', async () => {
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
          instrutor_id: 101,
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
              atribuicao_funcionario_ids: [101, 102],
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
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
      error: 'Instrutor supervisor não pode ser o próprio treinando curricular',
    });
  });

  it('cancels one curricular assignment without deleting the other segment-curriculum relations', async () => {
    const { db, batches } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901/atribuicoes/501/cancelar', {
        method: 'POST',
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(
      batches[0].some(
        (item) =>
          item.query.startsWith('UPDATE simulador_segmento_atribuicoes') &&
          item.query.includes('WHERE atribuicao_curricular_id = ?') &&
          item.args[0] === 501 &&
          item.args[1] === 6,
      ),
    ).toBe(true);
    expect(
      batches[0].some(
        (item) =>
          item.query.startsWith('UPDATE simulador_segmento_atribuicoes') &&
          !item.query.includes('WHERE atribuicao_curricular_id = ?'),
      ),
    ).toBe(false);
  });

  it('updates a shared session with final M:N relations only, preserving tenant scoping and no duplicate minutes', async () => {
    const { db, batches } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-21',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [
            {
              funcionario_id: 101,
              cumpre_treinamento: true,
              treinamento_planejado_id: 1001,
              modelo_sessao_id: 2003,
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
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'SOP_NORMAL',
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '09:00',
              atribuicao_funcionario_ids: [102],
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
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

    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);

    const statements = batches[0];
    expect(
      statements.some(
        (item) =>
          item.query.startsWith('UPDATE simulador_segmento_atribuicoes SET deleted_at') &&
          item.args[0] === 9901,
      ),
    ).toBe(true);
    expect(
      statements.some(
        (item) =>
          item.query.startsWith('UPDATE simulador_atribuicoes_curriculares SET deleted_at') &&
          item.args[0] === 9901,
      ),
    ).toBe(true);

    const assignmentInserts = statements.filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    );
    expect(assignmentInserts).toHaveLength(2);
    expect(assignmentInserts.map((item) => Number(item.args[item.args.length - 1]))).toEqual([60, 120]);
    expect(assignmentInserts.map((item) => Number(item.args[item.args.length - 2]))).toEqual([1, 1]);
    expect(assignmentInserts.map((item) => Number(item.args[item.args.length - 3]))).toEqual([2003, 2002]);

    const relationInserts = statements.filter((item) =>
      item.query.startsWith('INSERT INTO simulador_segmento_atribuicoes'),
    );
    expect(relationInserts).toHaveLength(3);

    const segmentInserts = statements.filter((item) =>
      item.query.startsWith('INSERT INTO simulador_agendamento_segmentos'),
    );
    expect(segmentInserts).toHaveLength(2);
    expect(segmentInserts.every((item) => item.args.includes(6))).toBe(true);

    const prepareMock = db.prepare as unknown as { mock: { calls: Array<[string, ...unknown[]]> } };
    expect(
      prepareMock.mock.calls.some(
        ([query]: [string, ...unknown[]]) =>
          String(query).includes('FROM simulador_agendamentos') &&
          String(query).includes('empresa_id = ?') &&
          String(query).includes('COALESCE(modo_compartilhado, 0) = 1'),
      ),
    ).toBe(true);
  });

  it('returns 404 on cross-tenant shared-session PUT without revealing existence or writing rows', async () => {
    const { db, batches } = createDbForSharedRoutes({ missingSharedSession: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-21',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [
            { funcionario_id: 101, cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
            { funcionario_id: 102, cumpre_treinamento: true, modelo_sessao_id: 2002, gera_ficha: true },
          ],
          segmentos: [
            {
              inicio: '07:00',
              fim: '08:00',
              atribuicao_funcionario_ids: [101],
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(404);
    expect(batches).toHaveLength(0);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Sessão compartilhada não encontrada',
    });
  });

  it('reads a historical shared session using the legacy scalar fallback without backfill or duplicate minutes', async () => {
    const { db, batches } = createDbForSharedRoutes({ historicalLegacyOnly: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901'),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(batches).toHaveLength(0);

    const json = await response.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.segmentos[0].atribuicao_funcionario_ids).toEqual([]);
    expect(
      json.data.resumo_participantes.map((item: any) => ({
        funcionario_id: item.funcionario_id,
        curricular_minutos: item.curricular_minutos,
      })),
    ).toEqual([
      { funcionario_id: 101, curricular_minutos: 60 },
      { funcionario_id: 102, curricular_minutos: 60 },
    ]);
    const prepareMock = db.prepare as unknown as { mock: { calls: Array<[string, ...unknown[]]> } };
    expect(
      prepareMock.mock.calls.some(([query]: [string, ...unknown[]]) =>
        String(query).includes('FROM simulador_segmento_atribuicoes ssa'),
      ),
    ).toBe(true);
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
