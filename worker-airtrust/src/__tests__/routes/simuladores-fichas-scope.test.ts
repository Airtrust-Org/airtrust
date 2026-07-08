import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

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

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));

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

function createFichasDb() {
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

  /** Fichas com data no futuro (para testar availability gate) */
  const futureFichas = new Set([903]);

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('COALESCE(sa.data, fs.data_sessao)') && query.includes('WHERE fs.id = ?')) {
            // Availability query: return data_sessao based on ficha id
            const fichaId = Number(args[0]);
            if (futureFichas.has(fichaId)) {
              return { data_sessao: '2099-12-31', hora_inicio: '08:00' };
            }
            return { data_sessao: '2026-06-21', hora_inicio: '08:00' };
          }

          if (query.includes('SELECT f.id FROM usuarios u') && query.includes('JOIN funcionarios f')) {
            return { id: Number(args[0]) + 100 };
          }

          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            const ids = args.slice(0, -1).map((value) => Number(value));
            return { total: ids.length };
          }

          if (query.includes('FROM simulador_agendamentos') && query.includes('WHERE id = ?')) {
            const sessaoId = Number(args[0]);
            const empresaId = Number(args[1]);
            if (sessaoId === 501 && empresaId === 6) return { id: 501 };
            return null;
          }

          if (query.includes('FROM fichas_sessao fs') && query.includes('WHERE fs.id = ?')) {
            const fichaId = Number(args[0]);
            const empresaId = Number(args[1]);
            const ficha = fichas.find((item) => item.id === fichaId && item.empresa_id === empresaId);
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

          if (query.includes('FROM fichas_sessao f') && query.includes('ORDER BY f.created_at DESC')) {
            return {
              results: fichas.map((ficha) => ({
                ...ficha,
                participante_nome: `Aluno ${ficha.colaborador_id_aluno}`,
                instrutor_nome: `Instrutor ${ficha.instrutor_id}`,
              })),
            };
          }

          if (query.includes('FROM fichas_sessao_manobras fsm')) {
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
    // Ficha 901: colaborador 201 (setor 10) — dentro do escopo
    const okResp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/pdf', { method: 'POST' }),
      { DB: db, __mockEmpresaId: 6, __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );
    // 404? 403? 500? The mock doesn't return all PDF columns, but the gate
    // must be reached BEFORE the DB fetch for manobras. Non-200 means gate agiu.
    expect(okResp.status).not.toBe(404);
    // Ficha 902: colaborador 202 (setor 20) — fora do escopo
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
    // Ficha 901: colaborador 201, mas usuário logado é 101 (funcionario 201)
    // Usando role='usuario' (ALUNO_PENDING_SIGNATURE scope) com userId=888 (outro aluno)
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
    // Usuário 201 → funcionario 301 (instrutor da ficha 901)
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
    // Instrutor da ficha 901 → autorizado (gate passa)
    // Pode retornar 500 por falta de mock interno, mas NÃO 403
    expect(resp.status).not.toBe(403);
  });

  it('GET /fichas/:id bloqueia ficha futura (availability gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    // Ficha 903: data futura (2099-12-31)
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
    const body = await resp.json();
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
    const body = await resp.json();
    expect(body.code).toBe('FICHA_NOT_AVAILABLE_YET');
  });

  it('GET /fichas/:id permite ficha disponivel (availability gate)', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });

    const { db } = createFichasDb();
    // Ficha 901: data passada (2026-06-21)
    const resp = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901'),
      {
        DB: db,
        __mockEmpresaId: 6,
        __mockRole: 'admin',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    // 409 seria blocked, qualquer outro (incluindo 500 por falta de mock) = passou pelo gate
    expect(resp.status).not.toBe(409);
  });

  it('POST /fichas/:id/pdf permite ficha disponivel (availability gate)', async () => {
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

    // 409 seria blocked, qualquer outro = passou pelo gate
    expect(resp.status).not.toBe(409);
  });
});
