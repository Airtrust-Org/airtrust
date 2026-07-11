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
import {
  assertSimpleSessionConvertible,
  type SimpleSessionForConversion,
} from '../../routes/simuladores-shared-session-conversion';

type QueryRun = { query: string; args: unknown[] };

/**
 * A simple (non-shared) planned session with a single existing participant
 * (funcionario 101). Tests below drive it through PUT
 * /sessoes/:id/converter-compartilhada with a two-participant payload
 * (101 preserved + 102 newly added), matching the only shape the shared
 * session model accepts (exactly one PF and one PM per segment).
 */
function createDbForConversion(options?: {
  status?: string;
  modoCompartilhado?: 0 | 1;
  fichaEvidence?: 'none' | 'protected' | 'student_signed' | 'resultado_registrado' | 'pending_no_evidence';
  modeloSemManobras?: boolean;
}) {
  const status = options?.status ?? 'AGENDADO';
  const modoCompartilhado = options?.modoCompartilhado ?? 0;
  const fichaEvidence = options?.fichaEvidence ?? 'none';

  const batches: Array<Array<QueryRun>> = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        statement: { query },
        args,
        first: async () => {
          if (query.includes('COALESCE(modo_compartilhado, 0) AS modo_compartilhado')) {
            return {
              id: 9901,
              empresa_id: 6,
              data: '2026-07-20',
              hora_inicio: '07:00',
              hora_fim: '09:00',
              simulador_id: 10,
              instrutor_id: 201,
              status,
              modo_compartilhado: modoCompartilhado,
            };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('COALESCE(modo_compartilhado, 0) = 1')) {
            // Post-conversion (or idempotent-retry) re-fetch via loadSharedDetail.
            return {
              id: 9901,
              uuid: 'converted-uuid',
              simulador_id: 10,
              funcionario_id: 101,
              data: '2026-07-20',
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

          if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
            return { id: Number(args[0]) };
          }

          if (query.includes('FROM simuladores') && query.includes('WHERE id = ?')) {
            return { id: Number(args[0]) };
          }

          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            return { total: args.length > 0 ? Number(args.length - 1) : 0 };
          }

          return null;
        },
        all: async () => {
          if (query === 'PRAGMA table_info(simulador_agendamentos)') {
            return {
              results: [
                { name: 'id' },
                { name: 'simulador_id' },
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
                  ativo: 1,
                  tipo: 'SIMULADOR',
                  modelo_aeronave: null,
                  tipo_sessao_codigo: 'PER',
                  gera_qualificacao: 0,
                  qualificacao_tipo_id: null,
                },
                {
                  id: 2002,
                  codigo: 'PER',
                  nome: 'Modelo B',
                  ativo: 1,
                  tipo: 'SIMULADOR',
                  modelo_aeronave: null,
                  tipo_sessao_codigo: 'PER',
                  gera_qualificacao: 0,
                  qualificacao_tipo_id: null,
                },
              ],
            };
          }

          if (query.includes('FROM fichas_sessao') && query.includes('agendamento_slot_id = ?') && query.includes('assinatura_aluno_timestamp')) {
            if (fichaEvidence === 'none') return { results: [] };
            if (fichaEvidence === 'pending_no_evidence') {
              return {
                results: [
                  {
                    status: 'AVALIACAO_PENDENTE',
                    assinatura_aluno_timestamp: null,
                    assinatura_instrutor_timestamp: null,
                    assinatura_tripulante: 0,
                    assinatura_instrutor: 0,
                    resultado_final: 'PENDENTE',
                  },
                ],
              };
            }
            if (fichaEvidence === 'protected') {
              return {
                results: [
                  {
                    status: 'CONCLUIDA',
                    assinatura_aluno_timestamp: null,
                    assinatura_instrutor_timestamp: null,
                    assinatura_tripulante: 0,
                    assinatura_instrutor: 0,
                    resultado_final: null,
                  },
                ],
              };
            }
            if (fichaEvidence === 'student_signed') {
              return {
                results: [
                  {
                    status: 'AGUARDANDO_ASSINATURA_INSTRUTOR',
                    assinatura_aluno_timestamp: '2026-07-19T10:00:00Z',
                    assinatura_instrutor_timestamp: null,
                    assinatura_tripulante: 1,
                    assinatura_instrutor: 0,
                    resultado_final: null,
                  },
                ],
              };
            }
            if (fichaEvidence === 'resultado_registrado') {
              return {
                results: [
                  {
                    status: 'AVALIACAO_PENDENTE',
                    assinatura_aluno_timestamp: null,
                    assinatura_instrutor_timestamp: null,
                    assinatura_tripulante: 0,
                    assinatura_instrutor: 0,
                    resultado_final: 'APROVADO',
                  },
                ],
              };
            }
          }

          if (query.includes('SELECT funcionario_id') && query.includes('FROM sessoes_participantes') && query.includes('ORDER BY id ASC')) {
            return { results: [{ funcionario_id: 101 }] };
          }

          if (query.includes('FROM sessoes_participantes sp') && query.includes('INNER JOIN funcionarios f')) {
            // loadSharedDetail's participantes query — only reachable on the
            // idempotent-retry path (session already shared).
            return {
              results: [
                { id: 701, funcionario_id: 101, funcao: 'PIC', funcionario_nome: 'Piloto 101' },
                { id: 702, funcionario_id: 102, funcao: 'SIC', funcionario_nome: 'Piloto 102' },
              ],
            };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('instrutor_id = ?')) {
            return { results: [] };
          }

          if (query.includes('FROM simulador_agendamentos sa') && query.includes('INNER JOIN sessoes_participantes sp')) {
            return { results: [] };
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

          // loadSharedDetail child collections (participantes/atribuicoes/segmentos/etc.)
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1, last_row_id: 9901 } }),
      }),
      first: async () => null,
      all: async () => {
        if (query === 'PRAGMA table_info(simulador_agendamentos)') {
          return {
            results: [
              { name: 'id' },
              { name: 'simulador_id' },
              { name: 'empresa_id' },
              { name: 'modo_compartilhado' },
            ],
          };
        }
        return { results: [] };
      },
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

function conversionPayload() {
  return {
    data: '2026-07-20',
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
        atribuicao_funcionario_id: 101,
        atribuicao_funcionario_ids: [101],
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
        atribuicao_funcionario_ids: [102],
        finalidade_codigo: 'SOP_NORMAL',
        funcoes: [
          { funcionario_id: 102, funcao: 'PF' },
          { funcionario_id: 101, funcao: 'PM' },
        ],
      },
    ],
  };
}

describe('assertSimpleSessionConvertible', () => {
  const baseSession: SimpleSessionForConversion = {
    id: 9901,
    empresa_id: 6,
    data: '2026-07-20',
    hora_inicio: '07:00',
    hora_fim: '09:00',
    simulador_id: 10,
    instrutor_id: 201,
    status: 'AGENDADO',
    modo_compartilhado: 0,
  };

  function dbWithFichas(fichas: Array<Record<string, unknown>>) {
    return {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: fichas }) }),
      }),
    } as unknown as D1Database;
  }

  it('allows a planned session with no fichas at all', async () => {
    await expect(assertSimpleSessionConvertible(dbWithFichas([]), 6, baseSession)).resolves.toBeUndefined();
  });

  it('allows legacy lowercase status values (e.g. "agendado")', async () => {
    await expect(
      assertSimpleSessionConvertible(dbWithFichas([]), 6, { ...baseSession, status: 'agendado' }),
    ).resolves.toBeUndefined();
  });

  it('blocks a session already in progress (EM_ANDAMENTO)', async () => {
    await expect(
      assertSimpleSessionConvertible(dbWithFichas([]), 6, { ...baseSession, status: 'EM_ANDAMENTO' }),
    ).rejects.toThrow(/ativa e planejada/i);
  });

  it('blocks a cancelled session (CANCELADO)', async () => {
    await expect(
      assertSimpleSessionConvertible(dbWithFichas([]), 6, { ...baseSession, status: 'CANCELADO' }),
    ).rejects.toThrow(/ativa e planejada/i);
  });

  it('allows a session whose only ficha is untouched AVALIACAO_PENDENTE', async () => {
    const db = dbWithFichas([
      {
        status: 'AVALIACAO_PENDENTE',
        assinatura_aluno_timestamp: null,
        assinatura_instrutor_timestamp: null,
        resultado_final: 'PENDENTE',
      },
    ]);
    await expect(assertSimpleSessionConvertible(db, 6, baseSession)).resolves.toBeUndefined();
  });

  it('blocks when the session status is not ATIVA (e.g. CONCLUIDA)', async () => {
    await expect(
      assertSimpleSessionConvertible(dbWithFichas([]), 6, { ...baseSession, status: 'CONCLUIDA' }),
    ).rejects.toThrow(/ativa e planejada/i);
  });

  it('blocks when a ficha already has a protected (final) status', async () => {
    const db = dbWithFichas([{ status: 'CONCLUIDA' }]);
    await expect(assertSimpleSessionConvertible(db, 6, baseSession)).rejects.toThrow(/evidência de execução/i);
  });

  it('blocks on student-only signature even though status is not yet a final status', async () => {
    const db = dbWithFichas([
      {
        status: 'AGUARDANDO_ASSINATURA_INSTRUTOR',
        assinatura_aluno_timestamp: '2026-07-19T10:00:00Z',
        assinatura_tripulante: 1,
      },
    ]);
    await expect(assertSimpleSessionConvertible(db, 6, baseSession)).rejects.toThrow(/evidência de execução/i);
  });

  it('blocks when a result was already registered', async () => {
    const db = dbWithFichas([{ status: 'AVALIACAO_PENDENTE', resultado_final: 'APROVADO' }]);
    await expect(assertSimpleSessionConvertible(db, 6, baseSession)).rejects.toThrow(/evidência de execução/i);
  });
});

describe('PUT /sessoes/:id/converter-compartilhada', () => {
  const executionContext = { waitUntil: vi.fn() } as unknown as ExecutionContext;

  beforeEach(() => {
    mockConflict = null;
  });

  async function callConvert(db: D1Database, body: unknown) {
    return sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/9901/converter-compartilhada', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'true' } as unknown as Env,
      executionContext,
    );
  }

  it('returns 404 when the feature flag is disabled', async () => {
    const { db } = createDbForConversion();
    const response = await sharedSessionRoutes.fetch(
      new Request('http://localhost/sessoes/9901/converter-compartilhada', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversionPayload()),
      }),
      { DB: db, SIMULATOR_SHARED_SESSIONS_ENABLED: 'false' } as unknown as Env,
      executionContext,
    );
    expect(response.status).toBe(404);
  });

  it('converts a planned, evidence-free simple session atomically: modo_compartilhado flips and segments/fichas are created in one batch', async () => {
    const { db, batches } = createDbForConversion({ status: 'AGENDADO', modoCompartilhado: 0, fichaEvidence: 'none' });

    const response = await callConvert(db, conversionPayload());
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    // Exactly one db.batch call for the structural conversion — atomicity by
    // construction (D1 batch runs statements as a single transaction).
    expect(batches.length).toBe(1);
    const statements = batches[0];

    const agendamentoUpdate = statements.find((s) => s.query.includes('SET modo_compartilhado = 1'));
    expect(agendamentoUpdate).toBeDefined();

    const reusedParticipantUpdate = statements.find(
      (s) => s.query.includes('UPDATE sessoes_participantes') && s.query.includes("SET funcao = ?"),
    );
    expect(reusedParticipantUpdate).toBeDefined();
    expect(reusedParticipantUpdate!.args).toContain(101);

    const newParticipantInsert = statements.find(
      (s) => s.query.includes('INSERT INTO sessoes_participantes'),
    );
    expect(newParticipantInsert).toBeDefined();
    expect(newParticipantInsert!.args).toContain(102);

    const segmentInserts = statements.filter((s) => s.query.includes('INSERT INTO simulador_agendamento_segmentos'));
    expect(segmentInserts.length).toBe(2);

    const fichaInserts = statements.filter((s) => /INSERT INTO fichas_sessao\s/.test(s.query));
    // One ficha per curricular assignment (101 in segment 1, 102 in segment 2) — never duplicated.
    expect(fichaInserts.length).toBe(2);

    const legacyFichaSupersede = statements.find(
      (s) => s.query.includes('UPDATE fichas_sessao') && s.query.includes('segmento_atribuicao_id IS NULL'),
    );
    expect(legacyFichaSupersede).toBeDefined();
  });

  it('blocks conversion with 409 when the session already has a protected ficha (concluded evidence)', async () => {
    const { db, batches } = createDbForConversion({ fichaEvidence: 'protected' });
    const response = await callConvert(db, conversionPayload());
    const json = (await response.json()) as any;

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(String(json.error)).toMatch(/evidência de execução/i);
    expect(batches.length).toBe(0);
  });

  it('blocks conversion with 409 when the session is not ATIVA (e.g. already CONCLUIDA)', async () => {
    const { db, batches } = createDbForConversion({ status: 'CONCLUIDA' });
    const response = await callConvert(db, conversionPayload());
    expect(response.status).toBe(409);
    expect(batches.length).toBe(0);
  });

  it('returns 404 when the session does not exist for this tenant', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      }),
      batch: vi.fn(async () => []),
    } as unknown as D1Database;

    const response = await callConvert(db, conversionPayload());
    expect(response.status).toBe(404);
  });

  it('is idempotent: a resend after the session is already shared reconciles instead of duplicating structure', async () => {
    const { db, batches } = createDbForConversion({ modoCompartilhado: 1, status: 'AGENDADO' });
    const response = await callConvert(db, conversionPayload());
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    // updateSharedSessionStructureTransactional path also issues exactly one
    // batch — the point is there is still only one, not a second creation.
    expect(batches.length).toBe(1);
    const duplicateAgendamentoFlip = batches[0].filter((s) => s.query.includes('SET modo_compartilhado = 1'));
    expect(duplicateAgendamentoFlip.length).toBe(0);
  });
});
