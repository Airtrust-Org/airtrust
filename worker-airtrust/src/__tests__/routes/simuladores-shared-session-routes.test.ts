import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const sendSimulatorSessionEmailNotificationsMock = vi.hoisted(
  () => vi.fn(async (..._args: unknown[]) => []),
);

let mockAuthenticated = true;
let mockUserRole = 'admin';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!mockAuthenticated) {
      return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
    }
    c.set('userId', 1);
    c.set('userRole', mockUserRole);
    c.set('empresaId', 6);
    c.set('tenantContext', {
      empresaId: 6,
      empresaCodigo: 'tenant-6',
      empresaNome: 'Tenant 6',
      role: mockUserRole,
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

vi.mock('../../routes/simuladores-sessoes-rbac', () => ({
  requireOperacoesSessao:
    () =>
    async (_c: unknown, next: () => Promise<void>) =>
      next(),
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

vi.mock('../../services/simuladores-session-notifications', () => ({
  loadSimulatorSessionNotificationData: vi.fn(async () => null),
  sendSimulatorSessionEmailNotifications: (...args: unknown[]) =>
    sendSimulatorSessionEmailNotificationsMock(
      args[0],
      args[1],
      args[2],
      args[3],
    ),
  shouldNotifySimulatorSessionUpdate: vi.fn((before: Record<string, unknown>, after: Record<string, unknown>, participantsChanged: boolean) => {
    if (participantsChanged) return true;
    const relevantFields = [
      'data',
      'hora_inicio',
      'hora_fim',
      'simulador_id',
      'aeronave_id',
      'tipo_dispositivo',
      'instrutor_id',
      'examinador_id',
      'tipo_sessao',
      'template_id',
      'status',
      'observacoes',
      'nome',
    ];
    return relevantFields.some((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
  }),
}));

import sharedSessionRoutes from '../../routes/simuladores-shared-session';
import { errorHandler } from '../../middleware/error-handler';

// requireRole() throws an ApiError that the production app converts to a
// JSON response via the global app.onError(errorHandler) registered once in
// index.ts. These tests call the sub-router's .fetch() directly, bypassing
// that global handler, so it must be registered here too — otherwise a
// thrown 403 surfaces as an unhandled 500 in the test harness only.
sharedSessionRoutes.onError(errorHandler);

type QueryRun = { query: string; args: unknown[] };

function createDbForSharedRoutes(options?: {
  modeloSemManobras?: boolean;
  simuladorForaTenant?: boolean;
  missingSharedSession?: boolean;
  concludedFicha?: boolean;
  historicalLegacyOnly?: boolean;
  examinerModelos?: boolean;
  fichaGenerationFails?: boolean;
  demotedParticipantAlreadyReconciled?: boolean;
}) {
  const batches: Array<Array<QueryRun>> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      // Direct .all() — used by simuladoresHasEmpresaId (PRAGMA without .bind())
      const directAll = async () => {
        if (query === 'PRAGMA table_info(simuladores)') {
          // Default: simuladores IS tenant-scoped (has empresa_id)
          if (options?.simuladorForaTenant) {
            // Even when testing cross-tenant rejection, the column still exists
            // — it's the VALUE that differs, not the schema.
            return { results: [{ name: 'id' }, { name: 'empresa_id' }, { name: 'deleted_at' }] };
          }
          return { results: [{ name: 'id' }, { name: 'empresa_id' }, { name: 'deleted_at' }] };
        }
        return { results: [] };
      };

      return {
        all: directAll,
        first: async () => null,
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

          // Ficha-generator's own tenant-scoped session lookup (distinct
          // column list from the broader shared-detail query above) — the
          // Phase 3 backfill call needs this to succeed, mirroring that
          // Phase 1's transactional batch already created/persisted the
          // session by the time Phase 3 runs.
          if (query.startsWith('SELECT id, data, instrutor_id, simulador_id')) {
            if (options?.missingSharedSession || options?.fichaGenerationFails) {
              return null;
            }
            return { id: 9901, data: '2026-06-20', instrutor_id: 201, simulador_id: 10 };
          }

          // Ficha-generator's canonical existing-ficha check (agendamento
          // slot + colaborador + template + atribuicao). Reports "already
          // exists" so Phase 3 skips rather than duplicating what Phase 1's
          // transactional batch already inserted.
          if (
            query.includes('FROM fichas_sessao') &&
            query.includes('agendamento_slot_id = ?') &&
            query.includes('colaborador_id_aluno = ?') &&
            query.includes('template_id = ?')
          ) {
            return { id: 3001 };
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
            const allModelos = options?.examinerModelos
              ? [
                  { id: 2001, codigo: 'EXA-V01', nome: 'Treinamento Prático de Examinador — SOP Normal e Condução Inicial' },
                  { id: 2002, codigo: 'EXA-V02', nome: 'Treinamento Prático de Examinador — SOP Anormal e Avaliação' },
                  { id: 2003, codigo: 'EXA-V03', nome: 'Treinamento Prático de Examinador — Emergência, Intervenção e Segurança' },
                  { id: 2004, codigo: 'EXA-V04', nome: 'Treinamento Prático de Examinador — Atuação Integrada' },
                ].map((modelo) => ({
                  ...modelo,
                  tipo_sessao_codigo: 'EXA',
                  gera_qualificacao: 0,
                  qualificacao_tipo_id: null,
                }))
              : [
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
                ];
            return {
              results: allModelos.filter(
                (modelo) => requestedIds.size === 0 || requestedIds.has(modelo.id),
              ),
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
            if (options?.demotedParticipantAlreadyReconciled) {
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
                ],
              };
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
            if (options?.demotedParticipantAlreadyReconciled) {
              return {
                results: [
                  { id: 9001, segmento_id: 801, atribuicao_curricular_id: 501, participante_id: 701, funcionario_id: 101, modelo_sessao_id: 2001, treinamento_planejado_id: 1001, gera_ficha: 1 },
                  { id: 9003, segmento_id: 802, atribuicao_curricular_id: 501, participante_id: 701, funcionario_id: 101, modelo_sessao_id: 2001, treinamento_planejado_id: 1001, gera_ficha: 1 },
                ],
              };
            }
            return {
              results: [
                { id: 9001, segmento_id: 801, atribuicao_curricular_id: 501, participante_id: 701, funcionario_id: 101, modelo_sessao_id: 2001, treinamento_planejado_id: 1001, gera_ficha: 1 },
                { id: 9002, segmento_id: 801, atribuicao_curricular_id: 502, participante_id: 702, funcionario_id: 102, modelo_sessao_id: 2002, treinamento_planejado_id: 1002, gera_ficha: 1 },
                { id: 9003, segmento_id: 802, atribuicao_curricular_id: 501, participante_id: 701, funcionario_id: 101, modelo_sessao_id: 2001, treinamento_planejado_id: 1001, gera_ficha: 1 },
                { id: 9004, segmento_id: 802, atribuicao_curricular_id: 502, participante_id: 702, funcionario_id: 102, modelo_sessao_id: 2002, treinamento_planejado_id: 1002, gera_ficha: 1 },
              ],
            };
          }

          if (query.includes('FROM simulador_segmento_participantes ssp')) {
            if (options?.missingSharedSession) {
              return { results: [] };
            }
            if (options?.demotedParticipantAlreadyReconciled) {
              return {
                results: [
                  { id: 9101, segmento_id: 801, participante_id: 701, funcionario_id: 101, funcao: 'PF', duracao_minutos: 60 },
                  { id: 9102, segmento_id: 801, participante_id: 702, funcionario_id: 102, funcao: 'PM', duracao_minutos: 60 },
                  { id: 9103, segmento_id: 802, participante_id: 701, funcionario_id: 101, funcao: 'PF', duracao_minutos: 60 },
                  { id: 9104, segmento_id: 802, participante_id: 702, funcionario_id: 102, funcao: 'PM', duracao_minutos: 60 },
                ],
              };
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
    };
    }),
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
    mockAuthenticated = true;
    mockUserRole = 'admin';
    sendSimulatorSessionEmailNotificationsMock.mockClear();
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

  it('surfaces a batch failure as an error response instead of a false 201, relying on D1 batch atomicity for no partial writes', async () => {
    // db.batch() on Cloudflare D1 executes its statements as a single atomic
    // unit at the platform level (all-or-nothing) — this repo does not layer
    // its own two-phase commit on top of it. What we can and do verify here is
    // the contract this code controls: if the platform batch call itself
    // rejects, the route must report failure, not silently return 201 with a
    // sessaoId that was never actually persisted.
    const { db } = createDbForSharedRoutes();
    (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('D1_ERROR: batch aborted'));

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
            { funcionario_id: 101, cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
            { funcionario_id: 102, cumpre_treinamento: true, modelo_sessao_id: 2002, gera_ficha: true },
          ],
          segmentos: [
            {
              inicio: '07:00',
              fim: '09:00',
              atribuicao_funcionario_id: 101,
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'SOP_NORMAL',
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

    const body = (await response.json()) as { success: boolean };
    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
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

    // Cross-tenant ownership failures must never leak which entity or tenant
    // was involved — 404 generic, not 400 with the literal "fora do tenant"
    // message (that would confirm the record exists in another tenant).
    expect(response.status).toBe(404);
    expect(batches).toHaveLength(0);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Registro não encontrado',
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

  it('gives the same physical participant two curricula across two segments, one assignment and one ficha each', async () => {
    const { db, batches } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '08:00',
          hora_fim: '10:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [{ funcionario_id: 101 }, { funcionario_id: 102 }],
          segmentos: [
            {
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              inicio: '09:00',
              fim: '10:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2002, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
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

    const atribuicaoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    );
    // One physical participant (101), one agendamento, two distinct modelo_sessao_id
    // values → two separate curricular assignments, not a merged/duplicated one.
    expect(atribuicaoInserts).toHaveLength(2);
    expect(atribuicaoInserts.every((item) => Number(item.args.at(-1)) === 60)).toBe(true);

    const segmentoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_agendamento_segmentos'),
    );
    expect(segmentoInserts).toHaveLength(2);

    const segmentoAtribuicaoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_segmento_atribuicoes'),
    );
    expect(segmentoAtribuicaoInserts).toHaveLength(2);

    const fichaInserts = batches[0].filter((item) => item.query.startsWith('INSERT INTO fichas_sessao\n'));
    expect(fichaInserts).toHaveLength(2);

    const participanteInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO sessoes_participantes'),
    );
    // Exactly one physical participant row per person, not per curriculum.
    expect(participanteInserts).toHaveLength(2);
  });

  it('reconciling the same shared session again does not duplicate assignments, fichas, or minutes', async () => {
    const { db: createDb, batches: createBatches } = createDbForSharedRoutes();

    const buildRequest = () =>
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '08:00',
          hora_fim: '10:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [{ funcionario_id: 101 }, { funcionario_id: 102 }],
          segmentos: [
            {
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              inicio: '09:00',
              fim: '10:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2002, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
          ],
        }),
      });

    await sharedSessionRoutes.fetch(
      buildRequest(),
      { DB: createDb, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(createBatches).toHaveLength(1);
    const firstAttempt = createBatches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    ).length;

    // Reconciling (PUT) the already-persisted structure with the same desired
    // state must not add a second copy of any assignment, link, or ficha —
    // the update path upserts against the loaded current state instead of
    // re-inserting blindly.
    const { db: updateDb, batches: updateBatches } = createDbForSharedRoutes();
    const putResponse = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [{ funcionario_id: 101 }, { funcionario_id: 102 }],
          segmentos: [
            {
              id: 801,
              inicio: '07:00',
              fim: '08:00',
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              id: 802,
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              participantes: [
                { funcionario_id: 102, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2002, gera_ficha: true },
                { funcionario_id: 101, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
          ],
        }),
      }),
      { DB: updateDb, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(putResponse.status).toBe(200);
    expect(updateBatches).toHaveLength(1);
    // The reconciled batch reuses the two existing assignments (501/502 from
    // the shared mock's loaded state) rather than inserting two more on top
    // of the first attempt's inserts.
    const secondAttemptNewAssignments = updateBatches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    ).length;
    expect(secondAttemptNewAssignments).toBe(0);
    expect(firstAttempt).toBe(2);
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

  it('demoting a participant from aluno to apoio cancels their ficha and PLANEJADA qualification, leaving the other participant untouched', async () => {
    const { db, batches } = createDbForSharedRoutes();

    const buildDemotionRequest = () =>
      new Request('http://localhost/sessoes/compartilhada/9901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [{ funcionario_id: 101 }, { funcionario_id: 102 }],
          segmentos: [
            {
              id: 801,
              inicio: '07:00',
              fim: '08:00',
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              id: 802,
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
          ],
        }),
      });

    const response = await sharedSessionRoutes.fetch(
      buildDemotionRequest(),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(sendSimulatorSessionEmailNotificationsMock).toHaveBeenCalledTimes(1);
    expect(sendSimulatorSessionEmailNotificationsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      9901,
      { reason: 'updated', empresaId: 6 },
    );
    const statements = batches[0];

    // 102's only assignment (502, modelo 2002) disappears entirely once both
    // segments mark them as apoio — it must be cancelled...
    expect(
      statements.some(
        (item) =>
          item.query.startsWith("UPDATE simulador_atribuicoes_curriculares SET status = 'CANCELADA'") &&
          Number(item.args[0]) === 502,
      ),
    ).toBe(true);
    // ...its ficha deleted...
    expect(
      statements.some(
        (item) =>
          item.query.startsWith('UPDATE fichas_sessao') &&
          item.query.includes('atribuicao_curricular_id = ?') &&
          Number(item.args[0]) === 502,
      ),
    ).toBe(true);
    // ...and — the bug this test guards against — the PLANEJADA qualification
    // derived from this session for funcionario 102 must be cancelled too,
    // not left active in the Histórico.
    const qualificacaoCleanup = statements.filter((item) =>
      item.query.includes('UPDATE qualificacoes_historico'),
    );
    expect(qualificacaoCleanup).toHaveLength(1);
    expect(qualificacaoCleanup[0].args).toEqual([9901, 102, 6]);

    // 101 keeps fulfilling training on the same assignment (501, modelo
    // 2001) in both segments — nothing about their assignment, ficha, or
    // qualification may be touched by 102's demotion.
    expect(
      statements.some(
        (item) =>
          item.query.startsWith("UPDATE simulador_atribuicoes_curriculares SET status = 'CANCELADA'") &&
          Number(item.args[0]) === 501,
      ),
    ).toBe(false);
    expect(qualificacaoCleanup.some((item) => Number(item.args[1]) === 101)).toBe(false);

    // Saving the same demoted configuration again must not duplicate or
    // error — the guard SQL (deleted_at IS NULL) makes the second pass a
    // no-op against a real database, and the route itself must not throw.
    const { db: resaveDb, batches: resaveBatches } = createDbForSharedRoutes();
    const secondResponse = await sharedSessionRoutes.fetch(
      buildDemotionRequest(),
      { DB: resaveDb, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );
    expect(secondResponse.status).toBe(200);
    expect(resaveBatches).toHaveLength(1);
    const resaveQualificacaoCleanup = resaveBatches[0].filter((item) =>
      item.query.includes('UPDATE qualificacoes_historico'),
    );
    expect(resaveQualificacaoCleanup).toHaveLength(1);
  });

  it('does not resend shared-session email when the same demoted state is saved again without relevant changes', async () => {
    const { db, batches } = createDbForSharedRoutes({ demotedParticipantAlreadyReconciled: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [{ funcionario_id: 101 }, { funcionario_id: 102 }],
          segmentos: [
            {
              id: 801,
              inicio: '07:00',
              fim: '08:00',
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              id: 802,
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
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
    expect(sendSimulatorSessionEmailNotificationsMock).not.toHaveBeenCalled();
  });

  it('surfaces canonical ficha-generator failure after a shared-session update instead of returning a false 200', async () => {
    const { db, batches } = createDbForSharedRoutes({ fichaGenerationFails: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-06-20',
          hora_inicio: '07:00',
          hora_fim: '09:00',
          simulador_id: 10,
          instrutor_id: 201,
          participantes: [{ funcionario_id: 101 }, { funcionario_id: 102 }],
          segmentos: [
            {
              id: 801,
              inicio: '07:00',
              fim: '08:00',
              finalidade_codigo: 'SOP_NORMAL',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              id: 802,
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              participantes: [
                { funcionario_id: 101, funcao: 'PF', cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(502);
    expect(batches).toHaveLength(1);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('geração canônica de fichas falhou'),
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
          item.query.startsWith("UPDATE simulador_agendamento_segmentos SET status = 'CANCELADO'") &&
          Number(item.args[0]) === 801,
      ),
    ).toBe(true);
    expect(
      statements.some(
        (item) =>
          item.query.startsWith("UPDATE simulador_atribuicoes_curriculares SET status = 'CANCELADA'") &&
          Number(item.args[0]) === 501,
      ),
    ).toBe(true);
    expect(
      statements.some(
        (item) =>
          item.query.includes('UPDATE simulador_atribuicoes_curriculares') &&
          item.query.includes('carga_horaria_total_minutos') &&
          Number(item.args[item.args.length - 2]) === 502,
      ),
    ).toBe(true);
    // Assignment 501 (funcionario 101, modelo 2001) is cancelled because 101
    // moved to modelo 2003 in this same edit — the stale PLANEJADA
    // qualification derived from that abandoned assignment must be cancelled
    // in the same batch, not left dangling in the Histórico.
    const qualificacaoCleanup = statements.filter((item) =>
      item.query.includes('UPDATE qualificacoes_historico'),
    );
    expect(qualificacaoCleanup).toHaveLength(1);
    expect(qualificacaoCleanup[0].args).toEqual([9901, 101, 6]);

    const assignmentInserts = statements.filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    );
    expect(assignmentInserts).toHaveLength(1);
    expect(Number(assignmentInserts[0]?.args[assignmentInserts[0].args.length - 1])).toBe(60);
    expect(Number(assignmentInserts[0]?.args[assignmentInserts[0].args.length - 2])).toBe(1);
    expect(Number(assignmentInserts[0]?.args[assignmentInserts[0].args.length - 3])).toBe(2003);

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

  it('does not return success:true when post-creation ficha generation fails', async () => {
    const { db } = createDbForSharedRoutes({ fichaGenerationFails: true });

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
            { funcionario_id: 101, cumpre_treinamento: true, modelo_sessao_id: 2001, gera_ficha: true },
            { funcionario_id: 102, cumpre_treinamento: true, modelo_sessao_id: 2002, gera_ficha: true },
          ],
          segmentos: [
            {
              inicio: '07:00',
              fim: '09:00',
              atribuicao_funcionario_id: 101,
              atribuicao_funcionario_ids: [101, 102],
              finalidade_codigo: 'SOP_NORMAL',
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

    // The session structure (phase 1/2) still gets persisted — this only
    // proves the response never lies about ficha generation having
    // succeeded. Session 109/110 in production are exactly this case: rows
    // existed, but success:true was returned despite zero fichas.
    expect(response.status).not.toBe(201);
    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/pendente de reparo/i);
  });
});

describe('POST /sessoes/compartilhada/:id/gerar-fichas — RBAC', () => {
  const executionContext = {
    waitUntil: vi.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    mockConflict = null;
    mockAuthenticated = true;
    mockUserRole = 'admin';
  });

  it('returns 401 when the caller is not authenticated', async () => {
    mockAuthenticated = false;
    const { db, batches } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901/gerar-fichas', { method: 'POST' }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(401);
    expect(batches).toHaveLength(0);
  });

  it('returns 403 when the caller is authenticated but not an admin', async () => {
    mockUserRole = 'instructor';
    const { db, batches } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901/gerar-fichas', { method: 'POST' }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(403);
    expect(batches).toHaveLength(0);
  });

  it('allows an authorized admin to run the repair endpoint', async () => {
    mockUserRole = 'admin';
    const { db } = createDbForSharedRoutes();

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901/gerar-fichas', { method: 'POST' }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('does not return success:true when the session is not found in the caller tenant', async () => {
    mockUserRole = 'admin';
    const { db } = createDbForSharedRoutes({ missingSharedSession: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada/9901/gerar-fichas', { method: 'POST' }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).not.toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });
});

describe('examiner universal training (EXA-V01..V04) — 2 physical reservations x 2 segments = 4 fichas', () => {
  // Reuses the same shared-session transactional mechanism and mock harness
  // proven generically above (lines ~625 and ~696): two segments per
  // reservation, one curricular assignment + one ficha per segment, no
  // duplication on reconciliation. This block only adds the examiner-specific
  // wiring (EXA-V01..V04 modelo codes) rather than re-testing the mechanism
  // from scratch. Cancellation-of-one-segment isolation is already proven
  // generically at the "cancels one curricular assignment..." test above —
  // the mechanism does not depend on which modelo_sessao_id is involved.
  const executionContext = {
    waitUntil: vi.fn(),
  } as unknown as ExecutionContext;
  const mesmoParticipante = 101;
  const instrutor = 201;

  it('reservation 1 (08:00-10:00): EXA-V01 + EXA-V02, one ficha each, 60 min, no duplication', async () => {
    const { db, batches } = createDbForSharedRoutes({ examinerModelos: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-07-20',
          hora_inicio: '08:00',
          hora_fim: '10:00',
          simulador_id: 10,
          instrutor_id: instrutor,
          participantes: [{ funcionario_id: mesmoParticipante }, { funcionario_id: 102 }],
          segmentos: [
            {
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'SOP_NORMAL',
              finalidade_titulo: 'EXA-V01',
              participantes: [
                {
                  funcionario_id: mesmoParticipante,
                  funcao: 'PF',
                  cumpre_treinamento: true,
                  modelo_sessao_id: 2001, // EXA-V01
                  gera_ficha: true,
                },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              inicio: '09:00',
              fim: '10:00',
              finalidade_codigo: 'SOP_ANORMAL_EMERGENCIA',
              finalidade_titulo: 'EXA-V02',
              participantes: [
                {
                  funcionario_id: mesmoParticipante,
                  funcao: 'PF',
                  cumpre_treinamento: true,
                  modelo_sessao_id: 2002, // EXA-V02
                  gera_ficha: true,
                },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(201);

    const atribuicaoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    );
    expect(atribuicaoInserts).toHaveLength(2);
    // No duplicated minutes: exactly 60 per curricular assignment, never 120.
    expect(atribuicaoInserts.every((item) => Number(item.args.at(-1)) === 60)).toBe(true);

    const segmentoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_agendamento_segmentos'),
    );
    expect(segmentoInserts).toHaveLength(2);

    const segmentoAtribuicaoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_segmento_atribuicoes'),
    );
    expect(segmentoAtribuicaoInserts).toHaveLength(2);

    const fichaInserts = batches[0].filter((item) => item.query.startsWith('INSERT INTO fichas_sessao\n'));
    expect(fichaInserts).toHaveLength(2);
    // Ficha tipo_sessao carries the modelo codigo (EXA-V01/EXA-V02), proving
    // each ficha is tied to its own distinct examiner-training curriculum.
    const tipoSessaoValues = fichaInserts.map((item) => item.args[4]);
    expect(tipoSessaoValues.sort()).toEqual(['EXA-V01', 'EXA-V02']);
  });

  it('reservation 2 (08:00-10:00): EXA-V03 + EXA-V04, same participant, independent from reservation 1', async () => {
    const { db, batches } = createDbForSharedRoutes({ examinerModelos: true });

    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/compartilhada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: '2026-07-21',
          hora_inicio: '08:00',
          hora_fim: '10:00',
          simulador_id: 10,
          instrutor_id: instrutor,
          participantes: [{ funcionario_id: mesmoParticipante }, { funcionario_id: 102 }],
          segmentos: [
            {
              inicio: '08:00',
              fim: '09:00',
              finalidade_codigo: 'SOP_ANORMAL_EMERGENCIA',
              finalidade_titulo: 'EXA-V03',
              participantes: [
                {
                  funcionario_id: mesmoParticipante,
                  funcao: 'PF',
                  cumpre_treinamento: true,
                  modelo_sessao_id: 2003, // EXA-V03
                  gera_ficha: true,
                },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
            {
              inicio: '09:00',
              fim: '10:00',
              finalidade_codigo: 'ATUACAO_EXAMINADOR',
              finalidade_titulo: 'EXA-V04',
              participantes: [
                {
                  funcionario_id: mesmoParticipante,
                  funcao: 'PF',
                  cumpre_treinamento: true,
                  modelo_sessao_id: 2004, // EXA-V04
                  gera_ficha: true,
                },
                { funcionario_id: 102, funcao: 'PM', cumpre_treinamento: false },
              ],
            },
          ],
        }),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );

    expect(response.status).toBe(201);

    const atribuicaoInserts = batches[0].filter((item) =>
      item.query.startsWith('INSERT INTO simulador_atribuicoes_curriculares'),
    );
    expect(atribuicaoInserts).toHaveLength(2);
    expect(atribuicaoInserts.every((item) => Number(item.args.at(-1)) === 60)).toBe(true);

    const fichaInserts = batches[0].filter((item) => item.query.startsWith('INSERT INTO fichas_sessao\n'));
    expect(fichaInserts).toHaveLength(2);
    const tipoSessaoValues = fichaInserts.map((item) => item.args[4]);
    expect(tipoSessaoValues.sort()).toEqual(['EXA-V03', 'EXA-V04']);

    // Across both physical reservations: 2 agendamentos, 4 segmentos, 4
    // atribuições curriculares, 4 segmento_atribuicoes, 4 fichas — never a
    // single "240 minutes" conclusion replacing the four independent ones.
    // (Reservation 1's counts are asserted in the preceding test; each
    // reservation uses its own isolated mock DB/batch, exactly like two
    // separate physical bookings would in production.)
  });
});
