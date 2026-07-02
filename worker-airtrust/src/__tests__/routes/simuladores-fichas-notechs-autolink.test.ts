import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { NOTECHS_CATEGORIA, NOTECHS_ITENS_CATALOGO } from '../../constants/notechs';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'admin');
    c.set('empresaId', 6);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: () => 'FULL_ACCESS',
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
import { Hono } from 'hono';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/simuladores', simuladoresFichasRoutes);
  return app;
}

function buildManobrasTecnicas(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: 100 + i,
    ordem: i + 1,
    codigo: `MAN-${i + 1}`,
    nome: `Manobra ${i + 1}`,
    descricao: `Manobra ${i + 1}`,
    categoria: 'GERAL',
    resultado: 8,
    observacoes: '',
    tripulante: 'AB',
  }));
}

function createDbMock(options: { status: string; manobrasExistentes: any[] }) {
  const batchCalls: unknown[][] = [];
  const runCalls: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        __query: query,
        __args: args,
        first: async () => {
          if (query.includes('WHERE fs.id = ? AND fs.deleted_at IS NULL AND fs.empresa_id = ?')) {
            return {
              id: 901,
              uuid: 'fs-901',
              status: options.status,
              empresa_id: 6,
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              tipo_aeronave: 'AW139',
              ficha_tipo_sessao: 'PER',
              atribuicao_curricular_id: null,
              is_check: 0,
              duracao_minutos: 120,
              tripulante_nome: 'Tripulante Teste',
              instrutor_nome: 'Instrutor Teste',
              simulador_nome: 'SIM-1',
              simulador_modelo: 'AW139',
              modelo_sessao_id: null,
            };
          }
          // fichaCtx (Passo A) e demais lookups não mapeados: sem modelo resolvido.
          return null;
        },
        all: async () => {
          if (query.includes('FROM fichas_sessao_manobras fsm')) {
            return { results: options.manobrasExistentes };
          }
          return { results: [] };
        },
        run: async () => {
          runCalls.push({ query, args });
          return { meta: { changes: 1, last_row_id: 1 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
    batch: vi.fn(async (stmts: unknown[]) => {
      batchCalls.push(stmts);
      return stmts.map(() => ({ success: true, meta: {} }));
    }),
  } as unknown as D1Database;

  return { db, batchCalls, runCalls };
}

describe('diagnóstico NOTECHS em GET /fichas/:id', () => {
  it('não injeta NOTECHS e retorna status missing quando a ficha editável ainda não tem NOTECHS', async () => {
    const { db, batchCalls, runCalls } = createDbMock({
      status: 'AVALIACAO_PENDENTE',
      manobrasExistentes: buildManobrasTecnicas(22),
    });

    const app = createApp();
    const response = await app.request('/simuladores/fichas/901', {}, { DB: db } as unknown as Env);

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.success).toBe(true);

    expect(batchCalls).toHaveLength(0);
    expect(runCalls).toHaveLength(0);
    expect(body.data.notechs_status).toBe('missing');
    expect(body.data.missing_notechs_count).toBe(15);
    expect(body.data.manobras).toHaveLength(22);
  });

  it('mantém status complete quando a ficha já tem os 15 NOTECHS', async () => {
    const manobrasComNotechs = [
      ...buildManobrasTecnicas(22),
      ...NOTECHS_ITENS_CATALOGO.map((item, i) => ({
        id: 900 + i,
        ordem: item.ordem,
        codigo: item.codigo,
        nome: item.nome,
        descricao: item.descricao,
        categoria: NOTECHS_CATEGORIA,
        resultado: 7,
        observacoes: '',
        tripulante: 'AB',
      })),
    ];
    const { db, batchCalls, runCalls } = createDbMock({
      status: 'AVALIACAO_PENDENTE',
      manobrasExistentes: manobrasComNotechs,
    });

    const app = createApp();
    const response = await app.request('/simuladores/fichas/901', {}, { DB: db } as unknown as Env);

    expect(response.status).toBe(200);
    expect(batchCalls).toHaveLength(0);
    expect(runCalls).toHaveLength(0);

    const body: any = await response.json();
    expect(body.data.notechs_status).toBe('complete');
    expect(body.data.missing_notechs_count).toBe(0);
  });

  it('retorna status partial quando a ficha tem apenas um subconjunto NOTECHS', async () => {
    const manobrasParciais = [
      ...buildManobrasTecnicas(22),
      {
        id: 900,
        ordem: NOTECHS_ITENS_CATALOGO[0].ordem,
        codigo: NOTECHS_ITENS_CATALOGO[0].codigo,
        nome: NOTECHS_ITENS_CATALOGO[0].nome,
        descricao: NOTECHS_ITENS_CATALOGO[0].descricao,
        categoria: NOTECHS_CATEGORIA,
        resultado: null,
        observacoes: '',
        tripulante: 'AB',
      },
    ];
    const { db, batchCalls, runCalls } = createDbMock({
      status: 'AVALIACAO_PENDENTE',
      manobrasExistentes: manobrasParciais,
    });

    const app = createApp();
    const response = await app.request('/simuladores/fichas/901', {}, { DB: db } as unknown as Env);

    expect(response.status).toBe(200);
    expect(batchCalls).toHaveLength(0);
    expect(runCalls).toHaveLength(0);

    const body: any = await response.json();
    expect(body.data.notechs_status).toBe('partial');
    expect(body.data.missing_notechs_count).toBe(14);
  });

  it.each(['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'])(
    'não escreve numa ficha finalizada (status=%s) e preserva o diagnóstico',
    async (status) => {
      const { db, batchCalls, runCalls } = createDbMock({
        status,
        manobrasExistentes: buildManobrasTecnicas(22),
      });

      const app = createApp();
      const response = await app.request('/simuladores/fichas/901', {}, { DB: db } as unknown as Env);

      expect(response.status).toBe(200);
      expect(batchCalls).toHaveLength(0);
      expect(runCalls).toHaveLength(0);

      const body: any = await response.json();
      expect(body.data.notechs_status).toBe('missing');
      expect(body.data.missing_notechs_count).toBe(15);
    },
  );
});
