import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi, beforeEach } from 'vitest';
import app from '../../index';

function sqlString(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolateBindings(sql: string, args: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => sqlString(args[index++]));
}

function runSql(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

let mockUserId = 7771;
let mockUserRole = 'GESTOR';
let mockFuncionarioId = 8881;

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', mockUserId);
    c.set('userRole', mockUserRole);
    c.set('empresaId', 999);
    c.set('funcionarioId', mockFuncionarioId);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (c: any, next: () => Promise<void>) => {
    await next();
  },
}));

const { histCacheMock } = vi.hoisted(() => ({
  histCacheMock: {
    cache: null as null | { key: string; ts: number; data: Record<string, number> },
    inflight: new Map<string, Promise<Record<string, number>>>(),
  },
}));

vi.mock('../../routes/qualificacoes/historico-helpers', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../routes/qualificacoes/historico-helpers')>();
  return {
    ...original,
    histCache: histCacheMock,
  };
});

describe('GET /qualificacoes/historico RBAC (SQLite Real)', () => {
  let tempDir: string;
  let databasePath: string;
  let mockEnv: any;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-rbac-'));
    databasePath = join(tempDir, 'hist.sqlite');

    runSql(
      databasePath,
      `
      CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, plano TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT, operational_domain_rbac_enabled INTEGER);
      CREATE TABLE setores (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, dominio_codigo TEXT, deleted_at TEXT, ativo INTEGER DEFAULT 1);
      CREATE TABLE dominios_operacionais (codigo TEXT PRIMARY KEY, nome TEXT, ativo INTEGER DEFAULT 1);
      CREATE TABLE setores_gestores (id INTEGER PRIMARY KEY, empresa_id INTEGER, setor_id INTEGER, funcionario_id INTEGER, usuario_id INTEGER, gestor_id INTEGER, deleted_at TEXT, ativo INTEGER DEFAULT 1);
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, plano TEXT, ativo INTEGER DEFAULT 1, email TEXT, perfil TEXT, tenant_id INTEGER, funcionario_id INTEGER, deleted_at TEXT);
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, setor_id INTEGER, status TEXT, deleted_at TEXT, matricula TEXT, funcao TEXT, cpf TEXT, codigo_anac TEXT, nascimento TEXT, modelo_aeronave_id TEXT);
      CREATE TABLE qualificacoes_categorias (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, dominio_codigo TEXT, deleted_at TEXT, cor TEXT, ativo INTEGER DEFAULT 1);
      CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, categoria_id INTEGER, categoria TEXT, validade INTEGER, deleted_at TEXT, codigo TEXT, vencimento_fim_mes INTEGER);
      CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, funcionario_id INTEGER, qualificacao_id INTEGER, categoria_id INTEGER, status TEXT, deleted_at TEXT, matricula TEXT, funcao TEXT, cpf TEXT, codigo_anac TEXT, nascimento TEXT, data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER, categoria TEXT, renovacao_de INTEGER, renovada INTEGER, arquivo_url TEXT, certificado_arquivo_id INTEGER, tipo TEXT, qualificacao_codigo TEXT, updated_at TEXT, created_at TEXT, instrutor TEXT, numero_certificado TEXT, observacoes TEXT, tipo_treinamento TEXT, carga_horaria TEXT);
      CREATE TABLE aeronaves (id INTEGER PRIMARY KEY, deleted_at TEXT, modelo TEXT, codigo TEXT, nome TEXT); CREATE TABLE funcionarios_aeronaves (id INTEGER PRIMARY KEY, funcionario_id INTEGER, aeronave_id INTEGER, deleted_at TEXT); CREATE TABLE modelos_aeronave (id INTEGER PRIMARY KEY, modelo TEXT, deleted_at TEXT, codigo TEXT, nome TEXT);
      CREATE TABLE documentos (id INTEGER PRIMARY KEY, deleted_at TEXT, r2_key TEXT, funcionario_id INTEGER, created_at TEXT, nome TEXT, tamanho INTEGER, mime_type TEXT); 
      CREATE TABLE qualificacoes_historico_stats_daily (day TEXT, scope_hash TEXT, total INTEGER, validas INTEGER, vencendo INTEGER, vencidas INTEGER, renovadas INTEGER, PRIMARY KEY (day, scope_hash));
      CREATE TABLE pasta_virtual (id INTEGER PRIMARY KEY, caminho_arquivo TEXT, certificacao_id INTEGER, funcionario_id INTEGER, empresa_id INTEGER, deleted_at TEXT, created_at TEXT, instrutor TEXT, numero_certificado TEXT, observacoes TEXT, tipo_treinamento TEXT, carga_horaria TEXT);
      CREATE TABLE config_tenant (empresa_id INTEGER, chave TEXT, valor TEXT, deleted_at TEXT);

      INSERT INTO dominios_operacionais (codigo, nome, ativo) VALUES ('OPERACOES', 'Operações', 1);
      INSERT INTO empresas (id, operational_domain_rbac_enabled) VALUES (999, 1);
      
      INSERT INTO setores (id, empresa_id, nome, dominio_codigo) VALUES (9991, 999, 'Setor Operacoes', 'OPERACOES');
      INSERT INTO setores (id, empresa_id, nome, dominio_codigo) VALUES (9992, 999, 'Setor Manutencao', 'MANUTENCAO');
      
      INSERT INTO funcionarios (id, empresa_id, nome, setor_id, status) VALUES 
        (8881, 999, 'Func OP 1', 9991, 'ATIVO'),
        (8882, 999, 'Func MAN 1', 9992, 'ATIVO'),
        (8883, 999, 'Func OP 2', 9991, 'ATIVO');

      INSERT INTO setores_gestores (empresa_id, setor_id, funcionario_id, usuario_id, ativo) VALUES (999, 9991, 8881, 7771, 1);
      INSERT INTO setores_gestores (empresa_id, setor_id, funcionario_id, usuario_id, ativo) VALUES (999, 9992, 8882, 7772, 1);

      INSERT INTO usuarios (id, nome, email, perfil, tenant_id, funcionario_id) VALUES 
        (7771, 'Gestor OP', 'gestor.op@test.com', 'GESTOR', 999, 8881),
        (7772, 'Gestor MAN', 'gestor.man@test.com', 'GESTOR', 999, 8882),
        (7773, 'Admin', 'admin@test.com', 'ADMIN', 999, NULL);

      INSERT INTO qualificacoes_categorias (id, empresa_id, nome, dominio_codigo) VALUES 
        (6661, 999, 'Cat Operacoes', 'OPERACOES'),
        (6662, 999, 'Cat Manutencao', 'MANUTENCAO');

      INSERT INTO qualificacoes_tipos (id, empresa_id, nome, categoria_id) VALUES 
        (5551, 999, 'Tipo OP', 6661),
        (5552, 999, 'Tipo MAN', 6662);

      INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, categoria_id, status) VALUES 
        (4441, 8883, 5551, 6661, 'VALIDA'),
        (4442, 8882, 5552, 6662, 'VALIDA');
    `,
    );

    mockEnv = {
      DB: {
        prepare: (query: string) => ({
          all: async () => {
            const interpolated = interpolateBindings(query, []);
            try {
              console.log('SQL_ALL:', interpolated);
              return { results: queryJson(databasePath, interpolated) };
            } catch (e: any) {
              if (e.message.includes('sqlite_master')) return { results: [] };
              throw e;
            }
          },
          first: async () => {
            const interpolated = interpolateBindings(query, []);
            try {
              console.log('SQL_FIRST:', interpolated);
              const res = queryJson<any>(databasePath, interpolated);
              return res[0] || null;
            } catch (e: any) {
              if (e.message.includes('sqlite_master')) return null;
              throw e;
            }
          },
          run: async () => {
            const interpolated = interpolateBindings(query, []);
            console.log('SQL:', interpolated);
            runSql(databasePath, interpolated);
            return { success: true };
          },
          bind: (...args: unknown[]) => ({
            all: async () => {
              const interpolated = interpolateBindings(query, args);
              try {
                console.log('SQL_ALL:', interpolated);
                return { results: queryJson(databasePath, interpolated) };
              } catch (e: any) {
                if (e.message.includes('sqlite_master')) return { results: [] };
                throw e;
              }
            },
            first: async () => {
              const interpolated = interpolateBindings(query, args);
              try {
                const res = queryJson<any>(databasePath, interpolated);
                return res[0] || null;
              } catch (e: any) {
                if (e.message.includes('sqlite_master')) return null;
                throw e;
              }
            },
            run: async () => {
              const interpolated = interpolateBindings(query, args);
              console.log('SQL:', interpolated);
              runSql(databasePath, interpolated);
              return { success: true };
            },
          }),
        }),
      },
    };
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    histCacheMock.cache = null;
    histCacheMock.inflight.clear();
  });

  test('Gestor Operacoes historico paginado com stats', async () => {
    mockUserId = 7771;
    mockUserRole = 'GESTOR';
    mockFuncionarioId = 8881;
    const req = new Request('http://localhost/api/qualificacoes/historico?stats=true');
    const res = await app.fetch(req, mockEnv, {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].funcionario_id).toBe(8883);
    expect(body.stats).toBeDefined();
    expect(body.stats.total).toBe(1);
  });

  test('Gestor Operacoes historico sem stats (totalOnly)', async () => {
    mockUserId = 7771;
    mockUserRole = 'GESTOR';
    mockFuncionarioId = 8881;
    const req = new Request('http://localhost/api/qualificacoes/historico?stats=false');
    const res = await app.fetch(req, mockEnv, {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
  });

  test('Gestor Operacoes /stats', async () => {
    mockUserId = 7771;
    mockUserRole = 'GESTOR';
    mockFuncionarioId = 8881;
    const req = new Request('http://localhost/api/qualificacoes/historico/stats');
    const res = await app.fetch(req, mockEnv, {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
  });

  test('Gestor Operacoes /stats-extended', async () => {
    mockUserId = 7771;
    mockUserRole = 'GESTOR';
    mockFuncionarioId = 8881;
    const req = new Request(
      'http://localhost/api/qualificacoes/historico/stats-extended?extended=true',
    );
    const res = await app.fetch(req, mockEnv, {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
  });

  test('Admin /historico com busca Nery sem erros', async () => {
    mockUserId = 7773;
    mockUserRole = 'ADMIN';
    mockFuncionarioId = 0;
    const req = new Request('http://localhost/api/qualificacoes/historico?search=nery&stats=true');
    const res = await app.fetch(req, mockEnv, {} as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
  });
});
