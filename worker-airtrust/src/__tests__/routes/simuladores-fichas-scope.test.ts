/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { resetFichaInstructorMetaSchemaCache } from '../../utils/ficha-instructor-meta-schema';

const getEmployeeSectorAccessMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 6);
    c.set('userId', Number(c.env?.__mockUserId ?? 101));
    c.set('userRole', String(c.env?.__mockRole || 'manager'));
    c.set('empresaId', empresaId);
    await next();
  },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: (...args: unknown[]) => getEmployeeSectorAccessMock(...args),
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

vi.mock('../../shared/handlers/horasVooFromSimulador.handler', () => ({
  syncHorasVooFromSimulador: vi.fn(async () => undefined),
}));

vi.mock('../../lib/fichaEmails', () => ({
  enviarEmailFichaSessao: vi.fn(async () => undefined),
}));

vi.mock('../../routes/simuladores-fichas-helpers', () => ({
  gerarQualificacaoDaFicha: vi.fn(),
  getQualificacaoGeracaoErrorStatus: vi.fn(),
  marcarNotificacoesFichaComoResolvidas: vi.fn(),
  listarManobrasPendentes: vi.fn(async () => []),
}));

import simuladoresFichasRoutes from '../../routes/simuladores-fichas';
import { errorHandler } from '../../middleware/error-handler';

simuladoresFichasRoutes.onError(errorHandler);

type FichaRow = {
  id: number;
  empresa_id: number;
  agendamento_slot_id: number | null;
  colaborador_id_aluno: number;
  instrutor_id: number;
  tipo_sessao: string;
  status: string;
};

const FUNCIONARIO_SETORES = new Map<number, number>([
  [201, 10],
  [202, 20],
  [301, 10],
  [302, 30],
]);

function createFichasDb(options?: { instructorMetaTableMissing?: boolean }) {
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const fichas: FichaRow[] = [
    {
      id: 901,
      empresa_id: 6,
      agendamento_slot_id: 501,
      colaborador_id_aluno: 201,
      instrutor_id: 301,
      tipo_sessao: 'PER',
      status: 'AGUARDANDO_ASSINATURA_ALUNO',
    },
    {
      id: 902,
      empresa_id: 6,
      agendamento_slot_id: 501,
      colaborador_id_aluno: 202,
      instrutor_id: 301,
      tipo_sessao: 'PER',
      status: 'AGUARDANDO_ASSINATURA_ALUNO',
    },
    {
      id: 903,
      empresa_id: 6,
      agendamento_slot_id: 502,
      colaborador_id_aluno: 201,
      instrutor_id: 301,
      tipo_sessao: 'PER',
      status: 'AVALIACAO_PENDENTE',
    },
  ];

  const futureFichas = new Set([903]);

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM empresas WHERE id')) {
            return { operational_domain_rbac_enabled: 0 };
          }
          if (query.includes('FROM fichas_sessao_instrutor_meta')) {
            if (options?.instructorMetaTableMissing) {
              throw new Error('no such table: fichas_sessao_instrutor_meta: SQLITE_ERROR');
            }
            return null;
          }

          if (
            query.includes('COALESCE(sa.data, fs.data_sessao)') &&
            query.includes('WHERE fs.id = ?')
          ) {
            const fichaId = Number(args[0]);
            if (futureFichas.has(fichaId)) {
              return { data_sessao: '2099-12-31', hora_inicio: '08:00' };
            }
            return { data_sessao: '2026-06-21', hora_inicio: '08:00' };
          }

          if (
            query.includes('SELECT f.id FROM usuarios u') &&
            query.includes('JOIN funcionarios f')
          ) {
            return { id: Number(args[0]) + 100 };
          }

          if (
            query.includes('SELECT COUNT(DISTINCT id) AS total') &&
            query.includes('FROM funcionarios')
          ) {
            const ids = args.slice(0, -1).map((value) => Number(value));
            return { total: ids.length };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('WHERE id = ?')) {
            const sessaoId = Number(args[0]);
            const empresaId = Number(args[1]);
            if (sessaoId === 501 && empresaId === 6) return { id: 501 };
            return null;
          }

          if (query.includes('FROM fichas_sessao WHERE id') && query.includes('empresa_id = ?')) {
            const fichaId = Number(args[0]);
            const empresaId = Number(args[1]);
            const ficha = fichas.find(
              (item) => item.id === fichaId && item.empresa_id === empresaId,
            );
            if (!ficha) return null;
            return {
              id: ficha.id,
              colaborador_id_aluno: ficha.colaborador_id_aluno,
              instrutor_id: ficha.instrutor_id,
              status: ficha.status,
              tipo_sessao: ficha.tipo_sessao,
              tipo_aeronave: null,
            };
          }

          if (query.includes('FROM fichas_sessao fs') && query.includes('WHERE fs.id = ?')) {
            const fichaId = Number(args[0]);
            const empresaId = Number(args[1]);
            const ficha = fichas.find(
              (item) => item.id === fichaId && item.empresa_id === empresaId,
            );
            if (!ficha) return null;
            return {
              id: ficha.id,
              uuid: `fs-${ficha.id}`,
              agendamento_slot_id: ficha.agendamento_slot_id,
              status: ficha.status,
              aprovado: 0,
              nota_final: null,
              resultado_final: 'PENDENTE',
              observacoes: '',
              data_sessao: '2026-06-21',
              assinatura_aluno_timestamp: null,
              assinatura_instrutor_timestamp: null,
              assinatura_aluno_ip: null,
              assinatura_instrutor_ip: null,
              assinatura_aluno_imagem: null,
              assinatura_instrutor_imagem: null,
              colaborador_id_aluno: ficha.colaborador_id_aluno,
              atribuicao_curricular_id: null,
              ficha_tipo_sessao: ficha.tipo_sessao,
              tipo_sessao: ficha.tipo_sessao,
              modo_compartilhado: 0,
              sessao_nome: 'Sessão Escopo',
              data: futureFichas.has(ficha.id) ? '2099-12-31' : '2026-06-21',
              horario_inicio: '08:00',
              horario_fim: '10:00',
              duracao_minutos: 120,
              is_check: 0,
              examinador_id: null,
              tripulante_id: ficha.colaborador_id_aluno,
              tripulante_nome: `Aluno ${ficha.colaborador_id_aluno}`,
              tripulante_matricula: `M-${ficha.colaborador_id_aluno}`,
              tripulante_codigo_anac: '',
              tripulante_funcao: 'ALUNO',
              instrutor_id: ficha.instrutor_id,
              instrutor_nome: `Instrutor ${ficha.instrutor_id}`,
              instrutor_matricula: `I-${ficha.instrutor_id}`,
              instrutor_codigo_anac: '',
              simulador_nome: 'Sim A',
              simulador_modelo: 'AW139',
              simulador_tipo: 'FSTD',
              template_codigo: 'PER',
              template_tema: 'Periódico',
              examinador_nome: null,
              ficha_modelo_nome: 'Periódico',
              modelo_sessao_id: 77,
              tripulacao_nomes: 'Aluno 201 / Aluno 202',
              edicoes_pendentes_count: 0,
            };
          }

          return null;
        },
        all: async () => {
          if (query.includes('SELECT id, setor_id') && query.includes('FROM funcionarios')) {
            const ids = args.slice(0, -1).map((value) => Number(value));
            return {
              results: ids.map((id) => ({
                id,
                setor_id: FUNCIONARIO_SETORES.get(id) ?? null,
              })),
            };
          }

          if (
            query.includes('FROM fichas_sessao f') &&
            query.includes('ORDER BY f.created_at DESC')
          ) {
            return {
              results: fichas.map((ficha) => ({
                ...ficha,
                participante_nome: `Aluno ${ficha.colaborador_id_aluno}`,
                instrutor_nome: `Instrutor ${ficha.instrutor_id}`,
              })),
            };
          }

          if (query.includes('FROM fichas_sessao_manobras')) {
            return {
              results: [
                {
                  id: 1,
                  ordem: 1,
                  codigo: 'MAN-01',
                  nome: 'Manobra 1',
                  descricao: 'Descricao',
                  categoria: 'NORMAL',
                  resultado: null,
                  observacoes: '',
                  tripulante: 'AB',
                },
              ],
            };
          }

          return { results: [] };
        },
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 999 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  } as unknown as D1Database;

  return { db, runs };
}

describe('simuladores fichas scope guards', () => {
  beforeEach(resetFichaInstructorMetaSchemaCache);

  it('GET /fichas filtra fichas fora do escopo setorial do gestor', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [10],
      funcionarioId: null,
    });
    const { db } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.success).toBe(true);
    expect(body.data.map((row) => row.id)).toEqual([901, 903]);
  });

  it('GET /fichas retorna vazio em fail-closed quando gestor não possui setores', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });
    const { db } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('GET /fichas/:id oculta ficha fora do escopo setorial do gestor', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [10],
      funcionarioId: null,
    });
    const { db } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/902'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Ficha não encontrada',
    });
  });

  it('GET /fichas/:id nao expõe ficha de outro tenant', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
    const { db } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901'),
      { DB: db, __mockEmpresaId: 7, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Ficha não encontrada',
    });
  });

  it('POST /fichas bloqueia escrita para perfil autoescopado', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'self',
      setorIds: [10],
      funcionarioId: 201,
    });
    const { db, runs } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 201,
          instrutor_id: 301,
          tipo_sessao: 'PER',
          agendamento_slot_id: 501,
        }),
      }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'aluno', __mockUserId: 101 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao'))).toBe(false);
  });

  it('POST /fichas bloqueia aluno ou instrutor fora do escopo setorial', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [10],
      funcionarioId: null,
    });
    const { db, runs } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 201,
          instrutor_id: 302,
          tipo_sessao: 'PER',
          agendamento_slot_id: 501,
        }),
      }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FUNCIONARIO_OUT_OF_SCOPE',
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao'))).toBe(false);
  });

  it('POST /fichas bloqueia vínculo com sessão fora do tenant', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
    const { db, runs } = createFichasDb();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 201,
          instrutor_id: 301,
          tipo_sessao: 'PER',
          agendamento_slot_id: 999,
        }),
      }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Sessão não encontrada',
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao'))).toBe(false);
  });

  it('POST /fichas/:id/pdf respeita escopo setorial (BUG-007)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'restricted',
      setorIds: [10],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const okResp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(okResp.status).not.toBe(404);

    const blockedResp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/902/pdf', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(blockedResp.status).toBe(404);
    await expect(blockedResp.json()).resolves.toMatchObject({
      success: false,
      error: 'Ficha não encontrada',
    });
  });

  it('POST /fichas/:id/pdf bloqueia aluno sem vinculo (BUG-007)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'usuario',
        __mockUserId: 888,
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(403);
    await expect(resp.json()).resolves.toMatchObject({
      success: false,
      error: 'Acesso negado',
    });
  });

  it('POST /fichas/:id/pdf permite acesso do proprio aluno (BUG-007)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'instrutor',
        __mockUserId: 201,
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(resp.status).not.toBe(403);
  });

  it('GET /fichas/:id bloqueia ficha futura (availability gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/903'),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(409);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.code).toBe('FICHA_NOT_AVAILABLE_YET');
  });

  it('POST /fichas/:id/pdf bloqueia ficha futura (availability gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/903/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(409);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.code).toBe('FICHA_NOT_AVAILABLE_YET');
  });

  it('GET /fichas/:id permite ficha disponivel (availability gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901'),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).not.toBe(409);
  });

  it('GET /fichas/:id retorna 200 sem a tabela opcional de metadata', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
    const { db } = createFichasDb({ instructorMetaTableMissing: true });

    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901'),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(200);
    await expect(resp.json()).resolves.toMatchObject({ success: true, data: { id: 901 } });
  });

  it('POST /fichas/:id/pdf permite ficha disponivel (availability gate) e retorna um PDF valido', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/pdf');
    const buf = await resp.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('POST /fichas/:id/pdf nao retorna 500 quando fichas_sessao_instrutor_meta nao existe (migration 0429 nao aplicada neste ambiente)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb({ instructorMetaTableMissing: true });
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/pdf');
    const buf = await resp.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('POST /fichas/:id/pdf retorna 404 controlado (nao 500) para ficha inexistente', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/999999/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(404);
    await expect(resp.json()).resolves.toMatchObject({ success: false });
  });

  it('POST /fichas/:id/pdf isola por tenant (empresa diferente nao encontra a ficha)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      {
        DB: db,
        __mockEmpresaId: 999,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(404);
  });

  it('PUT /fichas/:id bloqueia aluno sem vinculo (write gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado_final: 'APROVADO' }),
      }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'usuario',
        __mockUserId: 888,
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(403);
    await expect(resp.json()).resolves.toMatchObject({
      success: false,
      error: 'Acesso negado',
    });
  });

  it('PUT /fichas/:id permite instrutor vinculado (write gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado_final: 'APROVADO' }),
      }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'instrutor',
        __mockUserId: 201,
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).not.toBe(403);
  });

  it('POST /fichas-simulador/:id/popular-manobras bloqueia cross-tenant (write gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas-simulador/901/popular-manobras', {
        method: 'POST',
      }),
      {
        DB: db,
        __mockEmpresaId: 999,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /fichas-simulador/:id/gerar-qualificacao bloqueia usuario sem role (write gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas-simulador/901/gerar-qualificacao', {
        method: 'POST',
      }),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'usuario',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(resp.status).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
  });
});
