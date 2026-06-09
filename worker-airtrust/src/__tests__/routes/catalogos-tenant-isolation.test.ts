import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', 10);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getTenantContext: (c: any) => ({
      empresaId: Number(c.get('empresaId') || 0),
      empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
      empresaNome: 'Empresa Teste',
      role: c.get('userRole') || 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    }),
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((item) => item.toLowerCase()).includes(role)) {
        return c.json({ success: false, error: 'Permissão negada' }, 403);
      }
      await next();
    },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: vi.fn(() => ({
    usuario_id: 10,
    empresa_id: 1,
    usuario_nome: 'Teste',
    usuario_email: 'teste@airtrust.online',
  })),
}));

import simuladoresCatalogoRoutes from '../../routes/simuladores-catalogo';
import categoriasRoutes from '../../routes/categorias';
import habilitacoesRoutes from '../../routes/habilitacoes';
import modelosAeronaveRoutes from '../../routes/modelos-aeronave';

type ManobraRow = {
  id: number;
  empresa_id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  tipo_sessao: string | null;
  tipo_aeronave: string | null;
  ordem: number;
  nivel_dificuldade: string | null;
  tempo_estimado: number | null;
  pontuacao_minima: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ManobraCategoriaRow = {
  id: number;
  empresa_id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type QualificacaoCategoriaRow = {
  id: number;
  empresa_id: number;
  nome: string;
  codigo: string;
  descricao: string | null;
  cor: string | null;
  ativo: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type HabilitacaoRow = {
  id: number;
  empresa_id: number;
  nome: string;
  descricao: string | null;
  ativo: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  habilitacao_anterior_id: number | null;
  eh_renovada: number;
  renovada_em: string | null;
};

type ModeloAeronaveRow = {
  id: number;
  empresa_id: number;
  codigo: string;
  nome: string;
  modelo: string;
  fabricante: string | null;
  tipo: string | null;
  categoria: string | null;
  descricao: string | null;
  ativo: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type MockState = {
  manobras: ManobraRow[];
  manobrasCategorias: ManobraCategoriaRow[];
  qualificacoesCategorias: QualificacaoCategoriaRow[];
  habilitacoes: HabilitacaoRow[];
  modelosAeronave: ModeloAeronaveRow[];
  calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }>;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/simuladores', simuladoresCatalogoRoutes);
  app.route('/api/categorias', categoriasRoutes);
  app.route('/api/habilitacoes', habilitacoesRoutes);
  app.route('/api/modelos-aeronave', modelosAeronaveRoutes);
  return app;
}

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createMockEnv() {
  const state: MockState = {
    manobras: [
      {
        id: 1,
        empresa_id: 1,
        codigo: 'M-COMMON',
        nome: 'Manobra Tenant A',
        descricao: 'Descricao A',
        categoria: 'CAT-A',
        tipo_sessao: 'TREINAMENTO',
        tipo_aeronave: 'AW139',
        ordem: 1,
        nivel_dificuldade: null,
        tempo_estimado: 15,
        pontuacao_minima: null,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
      {
        id: 2,
        empresa_id: 2,
        codigo: 'M-B-ONLY',
        nome: 'Manobra Tenant B',
        descricao: 'Descricao B',
        categoria: 'CAT-B',
        tipo_sessao: 'TREINAMENTO',
        tipo_aeronave: 'SK76',
        ordem: 1,
        nivel_dificuldade: null,
        tempo_estimado: 20,
        pontuacao_minima: null,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
    ],
    manobrasCategorias: [
      {
        id: 1,
        empresa_id: 1,
        codigo: 'MCAT-A',
        nome: 'Categoria Manobra A',
        descricao: null,
        cor: '#111111',
        ordem: 1,
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
      {
        id: 2,
        empresa_id: 2,
        codigo: 'MCAT-B',
        nome: 'Categoria Manobra B',
        descricao: null,
        cor: '#222222',
        ordem: 1,
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
    ],
    qualificacoesCategorias: [
      {
        id: 1,
        empresa_id: 1,
        nome: 'Categoria Qual A',
        codigo: 'QUAL-A',
        descricao: null,
        cor: '#6B7280',
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
      {
        id: 2,
        empresa_id: 2,
        nome: 'Categoria Qual B',
        codigo: 'QUAL-B',
        descricao: null,
        cor: '#6B7280',
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
    ],
    habilitacoes: [
      {
        id: 1,
        empresa_id: 1,
        nome: 'Habilitacao A',
        descricao: 'Desc A',
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
        habilitacao_anterior_id: null,
        eh_renovada: 0,
        renovada_em: null,
      },
      {
        id: 2,
        empresa_id: 2,
        nome: 'Habilitacao B',
        descricao: 'Desc B',
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
        habilitacao_anterior_id: null,
        eh_renovada: 1,
        renovada_em: '2026-01-01',
      },
    ],
    modelosAeronave: [
      {
        id: 1,
        empresa_id: 1,
        codigo: 'AW139',
        nome: 'AW139',
        modelo: 'AW139',
        fabricante: 'Leonardo',
        tipo: 'Helicoptero',
        categoria: 'Executivo',
        descricao: null,
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
      {
        id: 2,
        empresa_id: 2,
        codigo: 'SK76',
        nome: 'SK76',
        modelo: 'SK76',
        fabricante: 'Sikorsky',
        tipo: 'Helicoptero',
        categoria: 'Comercial',
        descricao: null,
        ativo: 1,
        created_at: '2026-06-08 10:00:00',
        updated_at: '2026-06-08 10:00:00',
        deleted_at: null,
      },
    ],
    calls: [],
  };

  let nextManobraId = 3;
  let nextModeloId = 3;

  const db = {
    prepare: vi.fn((rawQuery: string) => {
      const query = normalizeSql(rawQuery);
      let args: unknown[] = [];

      const statement = {
        bind: (...bound: unknown[]) => {
          args = bound;
          return statement;
        },
        first: async <T>() => {
          state.calls.push({ query, args, method: 'first' });

          if (
            query.includes(
              'SELECT id FROM manobras WHERE empresa_id = ? AND deleted_at IS NULL AND UPPER(TRIM(codigo)) = UPPER(TRIM(?)) LIMIT 1',
            )
          ) {
            const empresaId = Number(args[0]);
            const codigo = String(args[1] || '').trim().toUpperCase();
            return (
              state.manobras.find(
                (item) =>
                  item.empresa_id === empresaId &&
                  item.deleted_at === null &&
                  item.codigo.trim().toUpperCase() === codigo,
              ) || null
            ) as T | null;
          }

          if (
            query.includes(
              'SELECT * FROM manobras WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            const id = Number(args[0]);
            const empresaId = Number(args[1]);
            return (
              state.manobras.find(
                (item) =>
                  item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
              ) || null
            ) as T | null;
          }

          if (
            query.includes(
              'SELECT id FROM modelos_aeronave WHERE empresa_id = ? AND deleted_at IS NULL AND UPPER(TRIM(COALESCE(modelo, codigo, nome))) = UPPER(TRIM(?)) LIMIT 1',
            )
          ) {
            const empresaId = Number(args[0]);
            const modelo = String(args[1] || '').trim().toUpperCase();
            return (
              state.modelosAeronave.find(
                (item) =>
                  item.empresa_id === empresaId &&
                  item.deleted_at === null &&
                  String(item.modelo || item.codigo || item.nome).trim().toUpperCase() === modelo,
              ) || null
            ) as T | null;
          }

          if (
            query.includes(
              'SELECT * FROM modelos_aeronave WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            const id = Number(args[0]);
            const empresaId = Number(args[1]);
            return (
              state.modelosAeronave.find(
                (item) =>
                  item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
              ) || null
            ) as T | null;
          }

          if (query.includes('SELECT COUNT(*) as total FROM habilitacoes WHERE')) {
            const empresaId = Number(args[0]);
            const total = state.habilitacoes.filter(
              (item) => item.empresa_id === empresaId && item.deleted_at === null,
            ).length;
            return { total } as T;
          }

          return null;
        },
        all: async <T>() => {
          state.calls.push({ query, args, method: 'all' });

          if (
            query.includes('FROM manobras WHERE empresa_id = ? AND deleted_at IS NULL ORDER BY ordem,codigo')
          ) {
            const empresaId = Number(args[0]);
            return {
              results: state.manobras
                .filter((item) => item.empresa_id === empresaId && item.deleted_at === null)
                .sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo)),
            } as T;
          }

          if (
            query.includes(
              'FROM manobras_categorias WHERE empresa_id = ? AND deleted_at IS NULL ORDER BY ordem, nome',
            )
          ) {
            const empresaId = Number(args[0]);
            return {
              results: state.manobrasCategorias
                .filter((item) => item.empresa_id === empresaId && item.deleted_at === null)
                .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)),
            } as T;
          }

          if (
            query.includes('FROM qualificacoes_categorias')
            && query.includes('WHERE empresa_id = ? AND deleted_at IS NULL')
            && query.includes('ORDER BY id ASC')
          ) {
            const empresaId = Number(args[0]);
            return {
              results: state.qualificacoesCategorias
                .filter((item) => item.empresa_id === empresaId && item.deleted_at === null)
                .sort((a, b) => a.id - b.id),
            } as T;
          }

          if (
            query.includes('FROM habilitacoes WHERE deleted_at IS NULL AND empresa_id = ?')
            && query.includes('ORDER BY nome ASC, created_at DESC')
          ) {
            const empresaId = Number(args[0]);
            return {
              results: state.habilitacoes
                .filter((item) => item.empresa_id === empresaId && item.deleted_at === null)
                .sort((a, b) => a.nome.localeCompare(b.nome)),
            } as T;
          }

          if (
            query.includes('FROM modelos_aeronave WHERE empresa_id = ? AND deleted_at IS NULL')
            && query.includes('ORDER BY COALESCE(modelo, codigo, nome) ASC')
          ) {
            const empresaId = Number(args[0]);
            return {
              results: state.modelosAeronave
                .filter((item) => item.empresa_id === empresaId && item.deleted_at === null)
                .sort((a, b) => a.modelo.localeCompare(b.modelo)),
            } as T;
          }

          return { results: [] } as T;
        },
        run: async () => {
          state.calls.push({ query, args, method: 'run' });

          if (
            query.includes(
              'INSERT INTO manobras(empresa_id,codigo,nome,descricao,categoria,tipo_sessao,tipo_aeronave,ordem)VALUES(?,?,?,?,?,?,?,?)',
            )
          ) {
            const row: ManobraRow = {
              id: nextManobraId++,
              empresa_id: Number(args[0]),
              codigo: String(args[1]),
              nome: String(args[2]),
              descricao: (args[3] as string | null) ?? null,
              categoria: (args[4] as string | null) ?? null,
              tipo_sessao: (args[5] as string | null) ?? null,
              tipo_aeronave: (args[6] as string | null) ?? null,
              ordem: Number(args[7]),
              nivel_dificuldade: null,
              tempo_estimado: null,
              pontuacao_minima: null,
              created_at: '2026-06-08 10:00:00',
              updated_at: '2026-06-08 10:00:00',
              deleted_at: null,
            };
            state.manobras.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          }

          if (
            query.includes(
              'UPDATE manobras SET codigo=?,nome=?,descricao=?,categoria=?,tipo_sessao=?,tipo_aeronave=?,ordem=?,nivel_dificuldade=?,tempo_estimado=?,pontuacao_minima=?,updated_at=datetime("now") WHERE id=? AND empresa_id = ?',
            )
          ) {
            const id = Number(args[10]);
            const empresaId = Number(args[11]);
            const row = state.manobras.find(
              (item) => item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
            );
            if (!row) return { meta: { changes: 0, last_row_id: 0 } };
            row.codigo = String(args[0]);
            row.nome = String(args[1]);
            row.descricao = (args[2] as string | null) ?? null;
            row.categoria = (args[3] as string | null) ?? null;
            row.tipo_sessao = (args[4] as string | null) ?? null;
            row.tipo_aeronave = (args[5] as string | null) ?? null;
            row.ordem = Number(args[6]);
            row.nivel_dificuldade = (args[7] as string | null) ?? null;
            row.tempo_estimado = args[8] == null ? null : Number(args[8]);
            row.pontuacao_minima = args[9] == null ? null : Number(args[9]);
            row.updated_at = '2026-06-08 11:00:00';
            return { meta: { changes: 1, last_row_id: row.id } };
          }

          if (
            query.includes(
              'UPDATE manobras SET deleted_at=datetime("now"), updated_at=datetime("now") WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            const id = Number(args[0]);
            const empresaId = Number(args[1]);
            const row = state.manobras.find(
              (item) => item.id === id && item.empresa_id === empresaId && item.deleted_at === null,
            );
            if (!row) return { meta: { changes: 0, last_row_id: 0 } };
            row.deleted_at = '2026-06-08 11:00:00';
            row.updated_at = '2026-06-08 11:00:00';
            return { meta: { changes: 1, last_row_id: row.id } };
          }

          if (
            query.includes(
              'INSERT INTO modelos_aeronave (empresa_id, codigo, nome, modelo, fabricante, tipo, categoria, descricao, ativo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime(\'now\'), datetime(\'now\'))',
            )
          ) {
            const row: ModeloAeronaveRow = {
              id: nextModeloId++,
              empresa_id: Number(args[0]),
              codigo: String(args[1]),
              nome: String(args[2]),
              modelo: String(args[3]),
              fabricante: (args[4] as string | null) ?? null,
              tipo: (args[5] as string | null) ?? null,
              categoria: (args[6] as string | null) ?? null,
              descricao: (args[7] as string | null) ?? null,
              ativo: 1,
              created_at: '2026-06-08 10:00:00',
              updated_at: '2026-06-08 10:00:00',
              deleted_at: null,
            };
            state.modelosAeronave.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          }

          return { meta: { last_row_id: 0, changes: 0 } };
        },
      };

      return statement;
    }),
  };

  return {
    DB: db as any,
    __state: state,
  };
}

describe('catalogos tenant isolation', () => {
  it('empresa A lista apenas suas manobras', async () => {
    const app = createApp();
    const env = createMockEnv();

    const res = await app.request(
      '/api/simuladores/manobras',
      {
        headers: {
          Authorization: 'Bearer test',
          'x-test-empresa-id': '1',
        },
      },
      env as any,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ empresa_id: number; codigo: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].empresa_id).toBe(1);
    expect(body.data[0].codigo).toBe('M-COMMON');
  });

  it('empresa A não consegue editar nem deletar manobra da empresa B', async () => {
    const app = createApp();
    const env = createMockEnv();

    const updateRes = await app.request(
      '/api/simuladores/manobras/2',
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
          'x-test-empresa-id': '1',
        },
        body: JSON.stringify({ nome: 'Nao pode' }),
      },
      env as any,
    );

    expect(updateRes.status).toBe(404);

    const deleteRes = await app.request(
      '/api/simuladores/manobras/2',
      {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test',
          'x-test-empresa-id': '1',
        },
      },
      env as any,
    );

    expect(deleteRes.status).toBe(404);
    expect(env.__state.manobras.find((item) => item.id === 2)?.deleted_at).toBeNull();
  });

  it('empresa A lista apenas categorias, habilitacoes e modelos da propria empresa', async () => {
    const app = createApp();
    const env = createMockEnv();

    const [catManobraRes, qualCatRes, habilRes, modelosRes] = await Promise.all([
      app.request(
        '/api/simuladores/categorias',
        {
          headers: { Authorization: 'Bearer test', 'x-test-empresa-id': '1' },
        },
        env as any,
      ),
      app.request(
        '/api/categorias',
        {
          headers: { Authorization: 'Bearer test', 'x-test-empresa-id': '1' },
        },
        env as any,
      ),
      app.request(
        '/api/habilitacoes',
        {
          headers: { Authorization: 'Bearer test', 'x-test-empresa-id': '1' },
        },
        env as any,
      ),
      app.request(
        '/api/modelos-aeronave',
        {
          headers: { Authorization: 'Bearer test', 'x-test-empresa-id': '1' },
        },
        env as any,
      ),
    ]);

    expect(((await catManobraRes.json()) as { data: Array<{ empresa_id: number }> }).data.map((item) => item.empresa_id)).toEqual([1]);
    expect(((await qualCatRes.json()) as { data: Array<{ id: number }> }).data.map((item) => item.id)).toEqual([1]);
    expect(((await habilRes.json()) as { data: Array<{ empresa_id: number }> }).data.map((item) => item.empresa_id)).toEqual([1]);
    expect(((await modelosRes.json()) as { data: Array<{ empresa_id: number }> }).data.map((item) => item.empresa_id)).toEqual([1]);
  });

  it('mesmo codigo pode existir em empresas diferentes, mas duplicidade na mesma empresa eh bloqueada', async () => {
    const app = createApp();
    const env = createMockEnv();

    const crossTenantCreate = await app.request(
      '/api/simuladores/manobras',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
          'x-test-empresa-id': '2',
        },
        body: JSON.stringify({
          empresa_id: 999,
          codigo: 'M-COMMON',
          nome: 'Manobra Copia Tenant B',
          categoria: 'CAT-B',
          tipo_sessao: 'TREINAMENTO',
          tipo_aeronave: 'SK76',
        }),
      },
      env as any,
    );

    expect(crossTenantCreate.status).toBe(201);
    expect(env.__state.manobras.find((item) => item.id === 3)?.empresa_id).toBe(2);

    const sameTenantDuplicate = await app.request(
      '/api/simuladores/manobras',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
          'x-test-empresa-id': '1',
        },
        body: JSON.stringify({
          codigo: 'M-COMMON',
          nome: 'Duplicada Tenant A',
          categoria: 'CAT-A',
          tipo_sessao: 'TREINAMENTO',
          tipo_aeronave: 'AW139',
        }),
      },
      env as any,
    );

    expect(sameTenantDuplicate.status).toBe(409);
  });

  it('post ignora empresa_id do body e usa a empresa da sessao', async () => {
    const app = createApp();
    const env = createMockEnv();

    const res = await app.request(
      '/api/modelos-aeronave',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
          'x-test-empresa-id': '2',
        },
        body: JSON.stringify({
          empresa_id: 1,
          modelo: 'AW139',
          fabricante: 'Leonardo',
          tipo: 'Helicoptero',
          categoria: 'Executivo',
        }),
      },
      env as any,
    );

    expect(res.status).toBe(201);
    expect(env.__state.modelosAeronave.find((item) => item.id === 3)?.empresa_id).toBe(2);
    expect(env.__state.modelosAeronave.find((item) => item.id === 3)?.modelo).toBe('AW139');
  });
});
