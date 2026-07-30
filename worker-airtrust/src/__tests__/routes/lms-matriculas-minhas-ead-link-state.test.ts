/**
 * GET /matriculas/minhas-ead — qualification_link_state
 *
 * A validade exibida ao aluno deve vir exclusivamente do Histórico atual
 * vinculado à matrícula (m.qualificacao_historico_id). Quando não há vínculo,
 * a API deve expor qualification_link_state=LINK_PENDING e
 * data_vencimento_qualificacao=null — nunca "Vencido" para um vínculo
 * ausente.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'student');
    c.set('funcionarioId', 77);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  hasRole: () => false,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';

type QueryHandler = { all?: () => Promise<unknown> | unknown };

function makeTestEnv(handlers: Array<[string, QueryHandler]>) {
  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled query: ${query.slice(0, 160)}`);
      const handler = entry[1];
      return {
        bind: (..._args: unknown[]) => ({
          all: async () => (handler.all ? handler.all() : { results: [] }),
        }),
      };
    }),
  } as unknown as D1Database;

  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);
  return { app, db };
}

describe('GET /matriculas/minhas-ead — qualification_link_state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matrícula sem Histórico vinculado: LINK_PENDING e data_vencimento_qualificacao null', async () => {
    const { app, db } = makeTestEnv([
      [
        'FROM lms_matriculas m',
        {
          all: () => ({
            results: [
              {
                id: 1,
                curso_id: 10,
                funcionario_id: 77,
                status: 'CONCLUIDO',
                progresso_pct: 100,
                score_final: 90,
                data_matricula: '2026-01-01',
                data_inicio: '2026-01-01',
                data_conclusao: '2026-01-05',
                data_expiracao: null,
                qualificacao_historico_id: null,
                titulo: 'Curso sem vínculo',
                categoria: 'EAD',
                carga_horaria_minutos: 60,
                thumbnail_r2_key: null,
                tipo_conteudo: 'scorm',
                scorm_versao: '1.2',
                publicado: 1,
                gerar_qualificacao_ao_concluir: 1,
                data_vencimento_qualificacao: null,
                tem_certificado: 0,
                qualification_link_state: 'LINK_PENDING',
              },
            ],
          }),
        },
      ],
    ]);

    const response = await app.fetch(
      new Request('http://localhost/minhas-ead'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: Array<{ qualification_link_state: string; data_vencimento_qualificacao: string | null }>;
    };
    expect(json.data[0].qualification_link_state).toBe('LINK_PENDING');
    expect(json.data[0].data_vencimento_qualificacao).toBeNull();
  });

  it('matrícula com Histórico vinculado: LINKED e data_vencimento_qualificacao presente', async () => {
    const { app, db } = makeTestEnv([
      [
        'FROM lms_matriculas m',
        {
          all: () => ({
            results: [
              {
                id: 2,
                curso_id: 11,
                funcionario_id: 77,
                status: 'CONCLUIDO',
                progresso_pct: 100,
                score_final: 90,
                data_matricula: '2026-01-01',
                data_inicio: '2026-01-01',
                data_conclusao: '2026-01-05',
                data_expiracao: null,
                qualificacao_historico_id: 900,
                titulo: 'Curso com vínculo',
                categoria: 'EAD',
                carga_horaria_minutos: 60,
                thumbnail_r2_key: null,
                tipo_conteudo: 'scorm',
                scorm_versao: '1.2',
                publicado: 1,
                gerar_qualificacao_ao_concluir: 1,
                data_vencimento_qualificacao: '2027-01-05',
                tem_certificado: 1,
                qualification_link_state: 'LINKED',
              },
            ],
          }),
        },
      ],
    ]);

    const response = await app.fetch(
      new Request('http://localhost/minhas-ead'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: Array<{ qualification_link_state: string; data_vencimento_qualificacao: string | null }>;
    };
    expect(json.data[0].qualification_link_state).toBe('LINKED');
    expect(json.data[0].data_vencimento_qualificacao).toBe('2027-01-05');
  });
});
