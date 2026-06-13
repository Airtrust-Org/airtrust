import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      c.set('empresaId', 1);
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: Number(c.get('empresaId') || 0),
    empresaCodigo: 'empresa-teste',
    empresaNome: 'Empresa Teste',
    role: c.get('userRole') || 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((item) => item.toLowerCase()).includes(role)) {
        return c.json(
          { success: false, error: `Permissão negada. Acesso restrito a: ${requiredRoles.join(', ')}` },
          403,
        );
      }
      await next();
    },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: async (c: any) => {
    const role = String(c.get('userRole') || '').toLowerCase();
    if (role === 'admin') return { mode: 'all', setorIds: [], funcionarioId: null };
    if (role === 'manager') return { mode: 'restricted', setorIds: [1], funcionarioId: null };
    return { mode: 'restricted', setorIds: [], funcionarioId: null };
  },
  filterRequestedSetorIdsByAccess: (requested: number[], access: { mode: string; setorIds: number[] }) =>
    access.mode === 'all' ? requested : requested.filter((id) => access.setorIds.includes(id)),
}));

vi.mock('../../services/qualificacoes-tipos-sync', () => ({
  buildHistoricoTipoSnapshot: vi.fn(),
  shouldSyncHistoricoSnapshotsOnTipoUpdate: () => false,
}));

vi.mock('../../services/lms-ead-ssot', () => ({
  isEadCategoria: () => false,
  reconcileImportedEdappHistory: vi.fn(),
  softDeleteLmsCourseForQualificacaoTipo: vi.fn(),
  syncLmsCourseFromQualificacaoTipo: vi.fn(),
}));

import tiposRoutes from '../../routes/qualificacoes/tipos';

let currentRole = 'admin';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/qualificacoes/tipos', tiposRoutes);
  return app;
}

type TipoRecord = {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  setores: Array<{ id: number; nome: string }>;
};

function createMockEnv() {
  const tipos: TipoRecord[] = [
    { id: 1, codigo: 'CONDUTA', nome: 'Código de Conduta', categoria: 'Treinamento', setores: [] },
    { id: 2, codigo: 'MNT-01', nome: 'Treinamento de Manutenção', categoria: 'Treinamento', setores: [{ id: 1, nome: 'Manutenção' }] },
    { id: 3, codigo: 'TRIP-01', nome: 'Treinamento de Tripulação', categoria: 'Operacional', setores: [{ id: 2, nome: 'Tripulação' }] },
  ];
  const availableSetores = new Map<number, string>([
    [1, 'Manutenção'],
    [2, 'Tripulação'],
    [3, 'Engenharia'],
  ]);
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        __sql: query,
        __args: args,
        first: async () => {
          if (query.includes("sqlite_master WHERE type = 'table' AND name = 'qualificacoes_tipos_setores'")) {
            return { name: 'qualificacoes_tipos_setores' };
          }

          if (
            query.includes('SELECT qt.id') &&
            query.includes('FROM qualificacoes_tipos qt') &&
            query.includes('qt.id = ?') &&
            query.includes('LIMIT 1')
          ) {
            const tipoId = Number(args[0]);
            const isScopedManager = args.length > 2;
            if (isScopedManager && tipoId === 3) return null;
            return tipos.find((tipo) => tipo.id === tipoId) ? { id: tipoId } : null;
          }

          if (
            query.includes('FROM qualificacoes_tipos qt') &&
            query.includes('WHERE qt.id = ? AND qt.deleted_at IS NULL AND qt.empresa_id = ?')
          ) {
            const tipoId = Number(args[0]);
            const isScopedManager = args.length > 2;
            if (isScopedManager && tipoId === 3) return null;
            const tipo = tipos.find((item) => item.id === tipoId);
            if (!tipo) return null;
            return {
              ...tipo,
              descricao: null,
              observacoes: null,
              carga_horaria: null,
              carga_horaria_inicial: null,
              carga_horaria_recorrente: null,
              conteudo_programatico: null,
              validade: 12,
              vencimento_fim_mes: 0,
              ativo: 1,
              is_check: 0,
              created_at: null,
              updated_at: null,
              setores_json: JSON.stringify(tipo.setores),
              setores_count: tipo.setores.length,
            };
          }

          if (
            query.includes('SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ?')
          ) {
            const tipoId = Number(args[0]);
            return tipos.find((item) => item.id === tipoId) ? { id: tipoId } : null;
          }

          return null;
        },
        all: async () => {
          if (query.includes("sqlite_master WHERE type = 'table' AND name = 'qualificacoes_tipos_setores'")) {
            return { results: [{ name: 'qualificacoes_tipos_setores' }] };
          }

          if (
            query.includes('SELECT qts.id, qts.setor_id, qts.deleted_at') &&
            query.includes('FROM qualificacoes_tipos_setores')
          ) {
            const tipoId = Number(args[0]);
            const tipo = tipos.find((item) => item.id === tipoId);
            return {
              results:
                tipo?.setores.map((setor, index) => ({
                  id: index + 100,
                  setor_id: setor.id,
                  deleted_at: null,
                })) || [],
            };
          }

          if (
            query.includes('SELECT id') &&
            query.includes('FROM setores') &&
            query.includes('id IN')
          ) {
            return {
              results: args
                .slice(1)
                .map((value) => Number(value))
                .filter((value) => availableSetores.has(value))
                .map((id) => ({ id })),
            };
          }

          if (
            query.includes('SELECT s.id, s.nome') &&
            query.includes('FROM qualificacoes_tipos_setores qts')
          ) {
            const tipoId = Number(args[0]);
            const tipo = tipos.find((item) => item.id === tipoId);
            return { results: tipo?.setores || [] };
          }

          if (
            query.includes('FROM qualificacoes_tipos qt') &&
            query.includes('LIMIT ?')
          ) {
            const result = currentRole === 'manager' ? tipos.filter((item) => item.id !== 3) : tipos;
            return {
              results: result.map((tipo) => ({
                ...tipo,
                descricao: null,
                observacoes: null,
                carga_horaria: null,
                carga_horaria_inicial: null,
                carga_horaria_recorrente: null,
                conteudo_programatico: null,
                validade: 12,
                vencimento_fim_mes: 0,
                ativo: 1,
                is_check: 0,
                created_at: null,
                updated_at: null,
                total_no_historico: 0,
                setores_json: JSON.stringify(tipo.setores),
                setores_count: tipo.setores.length,
              })),
            };
          }

          return { results: [] };
        },
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 999 } };
        },
      }),
      first: async () => {
        if (query.includes("sqlite_master WHERE type = 'table' AND name = 'qualificacoes_tipos_setores'")) {
          return { name: 'qualificacoes_tipos_setores' };
        }
        return null;
      },
      all: async () => {
        if (query.includes("sqlite_master WHERE type = 'table' AND name = 'qualificacoes_tipos_setores'")) {
          return { results: [{ name: 'qualificacoes_tipos_setores' }] };
        }
        return { results: [] };
      },
      run: async () => ({ meta: { changes: 1, last_row_id: 999 } }),
    })),
    batch: vi.fn(async (statements: Array<{ __sql: string; __args: unknown[] }>) => {
      for (const statement of statements) {
        runs.push({ query: statement.__sql, args: statement.__args });
        if (statement.__sql.includes('INSERT INTO qualificacoes_tipos_setores')) {
          const tipoId = Number(statement.__args[0]);
          const setorId = Number(statement.__args[1]);
          const nome = availableSetores.get(setorId);
          const tipo = tipos.find((item) => item.id === tipoId);
          if (tipo && nome && !tipo.setores.some((setor) => setor.id === setorId)) {
            tipo.setores.push({ id: setorId, nome });
          }
        }
      }
      return [];
    }),
  } as unknown as D1Database;

  return { env: { DB: db } as unknown as Env, runs };
}

async function req(path: string, env: Env, role: string, init: RequestInit = {}) {
  currentRole = role;
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-role', role);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

describe('qualificacoes tipos setor scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin lista todos os modelos, incluindo transversal e exclusivos', async () => {
    const { env } = createMockEnv();
    const res = await req('/api/qualificacoes/tipos?limit=200', env, 'admin');
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.data).toHaveLength(3);
    expect(payload.data.map((item: any) => item.codigo)).toEqual(['CONDUTA', 'MNT-01', 'TRIP-01']);
    expect(payload.data[0].is_transversal).toBe(true);
  });

  it('gestor vê apenas transversais e modelos do próprio setor', async () => {
    const { env } = createMockEnv();
    const res = await req('/api/qualificacoes/tipos?limit=200', env, 'manager');
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.data.map((item: any) => item.codigo)).toEqual(['CONDUTA', 'MNT-01']);
    expect(payload.data.some((item: any) => item.codigo === 'TRIP-01')).toBe(false);
  });

  it('gestor não consegue filtrar por setor fora do escopo', async () => {
    const { env } = createMockEnv();
    const res = await req('/api/qualificacoes/tipos?setor_id=2', env, 'manager');
    expect(res.status).toBe(403);
  });

  it('admin atualiza os setores de um modelo via endpoint dedicado', async () => {
    const { env, runs } = createMockEnv();
    const res = await req('/api/qualificacoes/tipos/2/setores', env, 'admin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setor_ids: [1, 3] }),
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.data.setores.map((item: any) => item.nome).sort()).toEqual([
      'Engenharia',
      'Manutenção',
    ]);
    expect(runs.some((run) => run.query.includes('INSERT INTO qualificacoes_tipos_setores'))).toBe(
      true,
    );
  });
});
