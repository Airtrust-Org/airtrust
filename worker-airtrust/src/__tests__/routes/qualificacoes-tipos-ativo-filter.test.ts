/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionContext } from '@cloudflare/workers-types';
import app from '../../index';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'admin');
    c.set('empresaId', 1); // MOCK_EMPRESA_ID
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (c: any, next: () => Promise<void>) => {
    await next();
  },
  requirePermission: () => async (c: any, next: () => Promise<void>) => {
    await next();
  },
}));

describe('GET /qualificacoes/tipos com filtro ativo', () => {
  const MOCK_EMPRESA_ID = 1;
  let mockRun: any;
  let mockAll: any;
  let executedSql: string[] = [];
  let executedBindings: unknown[][] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    executedSql = [];
    executedBindings = [];
    mockRun = vi.fn().mockResolvedValue({ success: true });
    mockAll = vi.fn().mockResolvedValue({
      results: [{ id: 1, codigo: 'Q1', ativo: 1 }],
    });
  });

  const makeReq = async (query = '', auth = true) => {
    const req = new Request(`http://localhost/api/qualificacoes/tipos${query}`);
    if (auth) req.headers.set('Authorization', 'Bearer admin-token');
    return app.fetch(
      req,
      {
        ENVIRONMENT: 'test',
        DB: {
          prepare: (sql: string) => {
            executedSql.push(sql);
            const stmt = {
              bind: (...bindings: unknown[]) => {
                executedBindings.push(bindings);
                return stmt;
              },
              all: mockAll,
              run: mockRun,
              first: () => ({ id: 1, status: 'ATIVA' }),
            };
            return stmt;
          },
        },
      } as any,
      {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      } as unknown as ExecutionContext,
    );
  };

  const getQueryConditions = () => {
    const sql = executedSql.find((s) => s.includes('FROM qualificacoes_tipos qt'));
    return sql || '';
  };

  it('ausência do parâmetro não adiciona filtro de ativo', async () => {
    const res = await makeReq();
    expect(res.status).toBe(200);
    const sql = getQueryConditions();
    expect(sql).toContain('qt.deleted_at IS NULL');
    expect(sql).toContain('qt.empresa_id = ?');
    expect(sql).not.toContain('qt.ativo =');
    expect(executedBindings.some((bindings) => bindings.includes(MOCK_EMPRESA_ID))).toBe(true);
  });

  it('ativo=1 adiciona qt.ativo = 1', async () => {
    const res = await makeReq('?ativo=1');
    expect(res.status).toBe(200);
    const sql = getQueryConditions();
    expect(sql).toContain('qt.ativo = 1');
  });

  it('ativo=true adiciona qt.ativo = 1', async () => {
    const res = await makeReq('?ativo=true');
    expect(res.status).toBe(200);
    const sql = getQueryConditions();
    expect(sql).toContain('qt.ativo = 1');
  });

  it('ativo=0 adiciona qt.ativo = 0', async () => {
    const res = await makeReq('?ativo=0');
    expect(res.status).toBe(200);
    const sql = getQueryConditions();
    expect(sql).toContain('qt.ativo = 0');
  });

  it('ativo=false adiciona qt.ativo = 0', async () => {
    const res = await makeReq('?ativo=false');
    expect(res.status).toBe(200);
    const sql = getQueryConditions();
    expect(sql).toContain('qt.ativo = 0');
  });

  it('valor inválido retorna 400 antes de consultar o banco (ex: ativo=2)', async () => {
    const res = await makeReq('?ativo=2');
    expect(res.status).toBe(400);
    const data = await res.json<{ success: boolean; error: string }>();
    expect(data.success).toBe(false);
    expect(data.error).toContain('inválido');
    expect(executedSql.some((sql) => sql.includes('SELECT qt.id'))).toBe(false); // consulta principal não executada
  });

  it('valor inválido retorna 400 antes de consultar o banco (ex: ativo=sim)', async () => {
    const res = await makeReq('?ativo=sim');
    expect(res.status).toBe(400);
    const data = await res.json<{ success: boolean; error: string }>();
    expect(data.success).toBe(false);
    expect(executedSql.some((sql) => sql.includes('SELECT qt.id'))).toBe(false);
  });

  it('empresa_id correto está nos bindings (tenant isolation)', async () => {
    await makeReq('?ativo=1');
    expect(executedBindings.some((bindings) => bindings.includes(MOCK_EMPRESA_ID))).toBe(true);
  });
  it('executa a consulta gerada para 500 modelos em SQLite real (sem vírgula antes de FROM)', async () => {
    const response = await makeReq('?limit=500');
    expect(response.status).toBe(200);
    const sql = getQueryConditions();
    expect(sql).toContain('FROM qualificacoes_tipos qt');
    const tempDir = mkdtempSync(join(tmpdir(), 'tipos-list-sql-'));
    const database = join(tempDir, 'tipos.sqlite');
    try {
      execFileSync('sqlite3', [database, `
        CREATE TABLE qualificacoes_tipos (
          id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT,
          tipo TEXT, codigo TEXT, nome TEXT, descricao TEXT, categoria TEXT,
          carga_horaria INTEGER, validade INTEGER, vencimento_fim_mes INTEGER,
          observacoes TEXT, ativo INTEGER, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE qualificacoes_categorias (
          id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, cor TEXT,
          ativo INTEGER, deleted_at TEXT
        );
        INSERT INTO qualificacoes_categorias (id, empresa_id, nome, ativo)
          VALUES (10, 1, 'CRM', 1);
        INSERT INTO qualificacoes_tipos (id, empresa_id, tipo, codigo, nome, categoria, ativo)
          VALUES (1, 1, 'PERIODICO', 'Q1', 'CRM Gestores', 'CRM', 1);
      `], { encoding: 'utf8' });
      let index = 0;
      const bindings = [MOCK_EMPRESA_ID, 500];
      const boundSql = sql.replace(/\?/g, () => String(bindings[index++]));
      expect(index).toBe(bindings.length);
      const stdout = execFileSync('sqlite3', ['-json', database, boundSql], { encoding: 'utf8' });
      const rows = JSON.parse(stdout) as Array<{ id: number; codigo: string }>;
      expect(rows).toEqual([expect.objectContaining({ id: 1, codigo: 'Q1' })]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

});
