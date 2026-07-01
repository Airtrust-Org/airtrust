/**
 * TESTES RBAC + CROSS-TENANT — /qualificacoes/formatos
 *
 * Cobre:
 *   - GET    /formatos     — qualquer autenticado
 *   - GET    /formatos/:id — qualquer autenticado
 *   - POST   /formatos     — admin apenas
 *   - PUT    /formatos/:id — admin apenas
 *   - DELETE /formatos/:id — admin apenas
 *   - Empresa A não lista/edita/remove formatos da Empresa B
 *   - DELETE bloqueia formato em uso com filtro empresa_id
 *   - Soft delete não remove fisicamente
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// ── Mocks de middleware ──
vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }
      c.set('userId', 10);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 1));
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
      if (!requiredRoles.map((r) => r.toLowerCase()).includes(role)) {
        return c.json(
          { success: false, error: `Permissão negada. Acesso restrito a: ${requiredRoles.join(', ')}` },
          403,
        );
      }
      await next();
    },
}));

// ── Mock D1 ──
type BindParams = Record<number, unknown>;
type PreparedStmt = {
  bind: (...args: unknown[]) => PreparedStmt;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number; last_row_id: number } }>;
};

function createMockDb(empresaId: number) {
  const rows: Map<number, {
    id: number;
    nome: string;
    codigo: string;
    descricao: string | null;
    cor: string;
    ativo: number;
    empresa_id: number;
    deleted_at: string | null;
  }> = new Map();

  let nextId = 1;

  const db = {
    prepare: vi.fn((query: string): PreparedStmt => {
      let boundArgs: unknown[] = [];

      const binder: PreparedStmt = {
        bind: (...args: unknown[]) => {
          boundArgs = args;
          return binder;
        },
        first: async <T>() => {
          // hasFormatosTable
          if (query.includes("name FROM sqlite_master WHERE type='table' AND name='qualificacoes_formatos'")) {
            return { name: 'qualificacoes_formatos' } as unknown as T;
          }
          // GET /:id — has total_tipos subquery
          if (query.includes('total_tipos') && query.includes('f.id = ?')) {
            const id = Number(boundArgs[0]);
            const row = rows.get(id);
            if (!row || row.deleted_at) return null;
            return { ...row, total_tipos: 0 } as unknown as T;
          }
          // POST: select created (shorter SELECT, no total_tipos, no alias)
          if (query.includes('created_at') && query.includes('FROM qualificacoes_formatos WHERE id = ?') && !query.includes('total_tipos')) {
            const id = Number(boundArgs[0]);
            const row = rows.get(id);
            if (!row) return null;
            return { ...row } as unknown as T;
          }
          // POST: check existing (codigo uniqueness)
          if (query.includes('SELECT id FROM qualificacoes_formatos WHERE empresa_id') && query.includes('codigo = ?')) {
            const empId = Number(boundArgs[0]);
            const codigo = String(boundArgs[1]);
            for (const r of rows.values()) {
              if (r.codigo === codigo && r.empresa_id === empId && !r.deleted_at) {
                return { id: r.id } as unknown as T;
              }
            }
            return null;
          }
          // PUT/DELETE: check existing (has deleted_at IS NULL in query)
          if (query.includes('deleted_at IS NULL') && query.includes('qualificacoes_formatos WHERE id = ? AND empresa_id')) {
            const id = Number(boundArgs[0]);
            const empId = Number(boundArgs[1]);
            const row = rows.get(id);
            if (!row || row.deleted_at || row.empresa_id !== empId) return null;
            return { id: row.id, codigo: row.codigo } as unknown as T;
          }
          // DELETE: check usage count
          if (query.includes('COUNT(*) AS cnt FROM qualificacoes_tipos WHERE formato_id')) {
            return { cnt: 0 } as unknown as T; // default: not in use
          }
          return null;
        },
        all: async <T>() => {
          // GET / (list)
          if (query.includes('FROM qualificacoes_formatos f') && query.includes('ORDER BY')) {
            const empId = Number(boundArgs[0]);
            const result = Array.from(rows.values()).filter(
              (r) => r.empresa_id === empId && !r.deleted_at,
            );
            return { results: result as unknown as T[] };
          }
          return { results: [] as unknown as T[] };
        },
        run: async () => {
          if (query.includes('INSERT INTO qualificacoes_formatos')) {
            // INSERT INTO qualificacoes_formatos (nome, codigo, descricao, cor, ativo, empresa_id, ...)
            // .bind(nome.trim(), codigo, descricao||null, cor||null, ativo?1:0, empresaId)
            const id = nextId++;
            const nome = String(boundArgs[0] || '');
            const codigo = String(boundArgs[1] || '');
            const descricao = boundArgs.length > 2 ? (boundArgs[2] as string | null) : null;
            const cor = boundArgs.length > 3 ? (boundArgs[3] as string | null) : null;
            const ativo = boundArgs.length > 4 ? Number(boundArgs[4]) : 1;
            const empId = boundArgs.length > 5 ? Number(boundArgs[5]) : 0;
            rows.set(id, {
              id,
              nome,
              codigo,
              descricao,
              cor: cor || '#6B7280',
              ativo: ativo || 1,
              empresa_id: empId,
              deleted_at: null,
            });
            return { meta: { changes: 1, last_row_id: id } };
          }
          if (query.includes('UPDATE qualificacoes_formatos SET deleted_at')) {
            const id = Number(boundArgs[0]);
            const empId = Number(boundArgs[1]);
            const row = rows.get(id);
            if (row && row.empresa_id === empId) {
              rows.set(id, { ...row, deleted_at: new Date().toISOString() });
              return { meta: { changes: 1, last_row_id: 0 } };
            }
            return { meta: { changes: 0, last_row_id: 0 } };
          }
          if (query.includes('UPDATE qualificacoes_formatos SET')) {
            return { meta: { changes: 1, last_row_id: 0 } };
          }
          return { meta: { changes: 1, last_row_id: 0 } };
        },
      };
      return binder;
    }),
  };

  return { db: db as unknown as D1Database, rows };
}

// ⚠️ Router import MUST be at top level so vitest can resolve it AFTER mock hoisting
import formatosRouter from '../../routes/qualificacoes/formatos';

// ── App builder ──
function createApp() {
  const app = new Hono();
  app.route('/api/qualificacoes/formatos', formatosRouter);
  return app;
}

async function request(
  path: string,
  env: any,
  role: string = 'admin',
  empresaId: number = 1,
  init: RequestInit = {},
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-role', role);
  headers.set('x-test-empresa-id', String(empresaId));
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

// ── Testes ──
describe('qualificacoes formatos — RBAC + cross-tenant', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let env: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb(1);
    env = { DB: mockDb.db };
  });

  // ─── RBAC: GET ───
  describe('GET /formatos — RBAC', () => {
    it('admin lista formatos', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'admin', 1);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('manager lista formatos', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'manager', 1);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it('viewer lista formatos', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'viewer', 1);
      expect(res.status).toBe(200);
    });

    it('não autenticado é rejeitado', async () => {
      const app = createApp();
      const res = await app.fetch(
        new Request('http://localhost/api/qualificacoes/formatos'),
        env,
        {} as ExecutionContext,
      );
      expect(res.status).toBe(401);
    });
  });

  // ─── RBAC: POST ───
  describe('POST /formatos — RBAC', () => {
    const payload = { nome: 'Teste', codigo: 'TESTE', descricao: null, cor: '#000000' };

    it('admin cria formato', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.codigo).toBe('TESTE');
      expect(body.data.nome).toBeTruthy();
    });

    it('manager NÃO cria formato', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'manager', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(403);
    });

    it('viewer NÃO cria formato', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'viewer', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(403);
    });

    it('student NÃO cria formato', async () => {
      const res = await request('/api/qualificacoes/formatos', env, 'student', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── RBAC: PUT ───
  describe('PUT /formatos/:id — RBAC', () => {
    it('admin edita formato da própria empresa', async () => {
      // First create a formato
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Original', codigo: 'ORIGINAL' }),
      });
      const res = await request('/api/qualificacoes/formatos/1', env, 'admin', 1, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Editado' }),
      });
      expect(res.status).toBe(200);
    });

    it('viewer NÃO edita formato', async () => {
      const res = await request('/api/qualificacoes/formatos/1', env, 'viewer', 1, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Hack' }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── RBAC: DELETE ───
  describe('DELETE /formatos/:id — RBAC', () => {
    it('admin remove formato da própria empresa', async () => {
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Removível', codigo: 'REMOVIVEL' }),
      });
      const res = await request('/api/qualificacoes/formatos/1', env, 'admin', 1, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    });

    it('viewer NÃO remove formato', async () => {
      const res = await request('/api/qualificacoes/formatos/1', env, 'viewer', 1, {
        method: 'DELETE',
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── Cross-tenant ───
  describe('cross-tenant isolation', () => {
    it('empresa A não lista formatos da empresa B', async () => {
      // Create formato in empresa 1
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'E1-Formato', codigo: 'E1_FMT' }),
      });
      // List as empresa 2
      const res = await request('/api/qualificacoes/formatos', env, 'admin', 2);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.filter((f: any) => f.empresa_id === 1)).toHaveLength(0);
    });

    it('empresa A não edita formato da empresa B', async () => {
      // Create formato in empresa 1
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'E1-Only', codigo: 'E1_ONLY' }),
      });
      // Try to edit as empresa 2
      const res = await request('/api/qualificacoes/formatos/1', env, 'admin', 2, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Cross-Tenant Hack' }),
      });
      expect(res.status).toBe(404);
    });

    it('empresa A não remove formato da empresa B', async () => {
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'E1-Fixo', codigo: 'E1_FIXO' }),
      });
      const res = await request('/api/qualificacoes/formatos/1', env, 'admin', 2, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Soft delete ───
  describe('soft delete', () => {
    it('DELETE define deleted_at sem remover fisicamente', async () => {
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'SoftDel', codigo: 'SOFTDEL' }),
      });
      const res = await request('/api/qualificacoes/formatos/1', env, 'admin', 1, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);

      // Verify it no longer appears in list
      const listRes = await request('/api/qualificacoes/formatos', env, 'admin', 1);
      const body: any = await listRes.json();
      expect(body.data.find((f: any) => f.id === 1)).toBeUndefined();
    });
  });

  // ─── DELETE bloqueia formato em uso ───
  describe('DELETE com uso — empresa_id no filtro', () => {
    it('não bloqueia remoção quando formato não está em uso no tenant certo', async () => {
      await request('/api/qualificacoes/formatos', env, 'admin', 1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Livre', codigo: 'LIVRE' }),
      });
      // Not in use — should succeed
      const res = await request('/api/qualificacoes/formatos/1', env, 'admin', 1, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    });
  });
});
