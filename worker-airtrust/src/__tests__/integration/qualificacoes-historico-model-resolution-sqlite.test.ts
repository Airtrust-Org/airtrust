/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { getHistoricoListHandler } from '../../routes/qualificacoes/historico';
import writeRouter from '../../routes/qualificacoes/historico-write';
import type { Env, Variables } from '../../types';

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

describe('Subagente A & B — Resolução Determinística de Modelos e Datas em SQLite Real', () => {
  let tempDir: string;
  let databasePath: string;

  function createMockEnv(dbPath: string): Env {
    return {
      ENVIRONMENT: 'test',
      DB: {
        prepare: (query: string) => {
          return {
            all: async () => {
              const interpolated = interpolateBindings(query, []);
              try {
                return { results: queryJson(dbPath, interpolated) };
              } catch (e: any) {
                if (e.message.includes('sqlite_master')) return { results: [] };
                throw e;
              }
            },
            first: async () => {
              const interpolated = interpolateBindings(query, []);
              try {
                const res = queryJson<any>(dbPath, interpolated);
                return res[0] || null;
              } catch (e: any) {
                if (e.message.includes('sqlite_master')) return null;
                throw e;
              }
            },
            run: async () => {
              const interpolated = interpolateBindings(query, []);
              runSql(dbPath, interpolated);
              return { success: true };
            },
            bind: (...args: unknown[]) => ({
              all: async () => {
                const interpolated = interpolateBindings(query, args);
                try {
                  return { results: queryJson(dbPath, interpolated) };
                } catch (e: any) {
                  if (e.message.includes('sqlite_master')) return { results: [] };
                  throw e;
                }
              },
              first: async () => {
                const interpolated = interpolateBindings(query, args);
                try {
                  const res = queryJson<any>(dbPath, interpolated);
                  return res[0] || null;
                } catch (e: any) {
                  if (e.message.includes('sqlite_master')) return null;
                  throw e;
                }
              },
              run: async () => {
                const interpolated = interpolateBindings(query, args);
                runSql(dbPath, interpolated);
                return { success: true };
              },
            }),
          };
        },
      } as unknown as D1Database,
    } as unknown as Env;
  }

  function buildTestApp(dbPath: string, empresaId = 6) {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', async (c, next) => {
      c.set('empresaId', empresaId);
      c.set('tenantContext', {
        empresaId,
        empresaNome: 'Empresa Teste',
        empresaCodigo: 'empresa_teste',
        role: 'ADMIN',
        plano: 'ENTERPRISE',
        permissions: [
          'qualificacoes:visualizar',
          'qualificacoes:criar',
          'qualificacoes:editar',
          'qualificacoes:deletar',
        ],
      });
      c.set('userId', 10);
      c.set('userEmail', 'admin@airtrust.test');
      c.set('userRole', 'ADMIN');
      await next();
    });

    app.get('/qualificacoes/historico', getHistoricoListHandler);
    app.route('/qualificacoes/historico', writeRouter);

    const env = createMockEnv(dbPath);

    return {
      request: (path: string, init: RequestInit = {}) => app.request(path, init, env),
    };
  }

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hist-sqlite-model-'));
    databasePath = join(tempDir, 'model-resolution.sqlite');

    runSql(
      databasePath,
      `
      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        codigo TEXT,
        plano TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT,
        operational_domain_rbac_enabled INTEGER DEFAULT 0
      );

      CREATE TABLE setores (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        nome TEXT,
        dominio_codigo TEXT,
        deleted_at TEXT,
        ativo INTEGER DEFAULT 1
      );

      CREATE TABLE dominios_operacionais (
        codigo TEXT PRIMARY KEY,
        nome TEXT,
        ativo INTEGER DEFAULT 1
      );

      CREATE TABLE setores_gestores (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        setor_id INTEGER,
        funcionario_id INTEGER,
        usuario_id INTEGER,
        gestor_id INTEGER,
        deleted_at TEXT,
        ativo INTEGER DEFAULT 1
      );

      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        email TEXT,
        perfil TEXT,
        tenant_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        matricula TEXT,
        cargo TEXT,
        funcao TEXT,
        setor_id INTEGER,
        setor TEXT,
        status TEXT DEFAULT 'ATIVO',
        cpf TEXT,
        codigo_anac TEXT,
        nascimento TEXT,
        modelo_aeronave_id TEXT,
        deleted_at TEXT
      );

      CREATE TABLE qualificacoes_categorias (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        nome TEXT,
        dominio_codigo TEXT,
        deleted_at TEXT,
        cor TEXT,
        ativo INTEGER DEFAULT 1
      );

      CREATE TABLE qualificacoes_tipos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        codigo TEXT,
        nome TEXT NOT NULL,
        categoria_id INTEGER,
        categoria TEXT,
        validade INTEGER,
        vencimento_fim_mes INTEGER DEFAULT 0,
        carga_horaria INTEGER,
        carga_horaria_inicial INTEGER,
        carga_horaria_recorrente INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER,
        qualificacao_codigo TEXT,
        categoria_id INTEGER,
        categoria TEXT,
        tipo TEXT,
        tipo_treinamento TEXT,
        status TEXT DEFAULT 'VALIDA',
        data_conclusao TEXT,
        data_vencimento TEXT,
        validade_meses INTEGER,
        carga_horaria INTEGER,
        instrutor TEXT,
        numero_certificado TEXT,
        observacoes TEXT,
        renovacao_de INTEGER,
        renovada INTEGER DEFAULT 0,
        certificado_arquivo_id INTEGER,
        arquivo_url TEXT,
        deleted_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE qualificacoes_auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        historico_id INTEGER,
        empresa_id INTEGER,
        usuario_id INTEGER,
        acao TEXT,
        detalhes TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        usuario_id INTEGER,
        acao TEXT,
        detalhes TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auditoria_avancada_v2 (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        usuario_id INTEGER,
        modulo TEXT,
        acao TEXT,
        detalhes TEXT,
        created_at TEXT
      );

      CREATE TABLE documentos (
        id INTEGER PRIMARY KEY,
        r2_key TEXT,
        funcionario_id INTEGER,
        created_at TEXT,
        nome TEXT,
        tamanho INTEGER,
        mime_type TEXT,
        deleted_at TEXT
      );

      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY,
        deleted_at TEXT,
        modelo TEXT,
        codigo TEXT,
        nome TEXT
      );

      CREATE TABLE funcionarios_aeronaves (
        id INTEGER PRIMARY KEY,
        funcionario_id INTEGER,
        aeronave_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE pasta_virtual (
        id INTEGER PRIMARY KEY,
        caminho_arquivo TEXT,
        certificacao_id INTEGER,
        funcionario_id INTEGER,
        empresa_id INTEGER,
        deleted_at TEXT,
        created_at TEXT
      );

      CREATE TABLE modelos_aeronave (
        id INTEGER PRIMARY KEY,
        modelo TEXT,
        codigo TEXT,
        nome TEXT,
        deleted_at TEXT
      );

      CREATE TABLE config_tenant (
        empresa_id INTEGER,
        chave TEXT,
        valor TEXT,
        deleted_at TEXT
      );

      CREATE TABLE usuario_permissoes (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER,
        empresa_id INTEGER,
        permissao TEXT,
        tipo TEXT,
        concedido INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS qualificacoes_historico_stats_daily (
        day TEXT,
        scope_hash TEXT,
        total INTEGER,
        validas INTEGER,
        vencendo INTEGER,
        vencidas INTEGER,
        renovadas INTEGER,
        PRIMARY KEY (day, scope_hash)
      );

      CREATE TABLE perfis_permissoes (
        id INTEGER PRIMARY KEY,
        perfil TEXT,
        permissao TEXT
      );

      CREATE TABLE usuarios_empresas (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER,
        empresa_id INTEGER,
        role TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      INSERT INTO empresas (id, nome, codigo) VALUES
        (1, 'Catálogo Global', 'global'),
        (6, 'Empresa Alpha (Tenant 6)', 'alpha'),
        (7, 'Empresa Beta (Tenant 7)', 'beta');

      INSERT INTO funcionarios (id, empresa_id, nome, matricula, status) VALUES
        (501, 6, 'Carlos Alpha (Tenant 6)', 'MAT-001', 'ATIVO'),
        (502, 7, 'Beatriz Beta (Tenant 7)', 'MAT-002', 'ATIVO');

      -- Fixtures de Modelos (qualificacoes_tipos):
      -- 1) Código 'EAD_COORDENADOR_VOO' presente no catálogo global E customizado no Tenant 6
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, vencimento_fim_mes, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente) VALUES
        (10, 1, 'EAD_COORDENADOR_VOO', 'Coordenador Global (12m)', 12, 0, 16, 16, 8),
        (20, 6, 'EAD_COORDENADOR_VOO', 'Coordenador Tenant Alpha (24m)', 24, 1, 20, 20, 10);

      -- 2) Código 'CRM_ANUAL' presente em ambos os tenants, mas com regras diferentes
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, vencimento_fim_mes, carga_horaria) VALUES
        (30, 6, 'CRM_ANUAL', 'CRM Anual Tenant 6', 12, 0, 8),
        (31, 7, 'CRM_ANUAL', 'CRM Anual Tenant 7', 24, 0, 16);

      -- 3) Código 'LGPD_BASICO' existente APENAS no catálogo global (empresa_id = 1)
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, vencimento_fim_mes, carga_horaria) VALUES
        (40, 1, 'LGPD_BASICO', 'LGPD Global', 36, 0, 4);

      -- 4) Modelo explicitamente vinculado por ID
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, vencimento_fim_mes, carga_horaria) VALUES
        (50, 6, 'SAFETY_LEADERSHIP', 'Safety Leadership Tenant 6', 18, 0, 12);

      -- 5) Modelo excluído logicamente (deleted_at IS NOT NULL)
      INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, deleted_at) VALUES
        (60, 6, 'CURSO_DEPRECADO', 'Curso Descontinuado', 6, '2025-01-01 00:00:00');

      -- Fixtures de Históricos:
      -- Histórico 1001: Legado de Coordenador de Voo (qualificacao_id nulo, qualificacao_codigo = 'EAD_COORDENADOR_VOO')
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao, data_vencimento, tipo_treinamento) VALUES
        (1001, 6, 501, NULL, 'EAD_COORDENADOR_VOO', 'Coordenador', 'VALIDA', '2026-01-15', '2028-01-31', 'Inicial');

      -- Histórico 1002: Histórico com vínculo explícito a LGPD global
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao) VALUES
        (1002, 6, 501, NULL, 'LGPD_BASICO', 'LGPD', 'VALIDA', '2026-03-10');

      -- Histórico 1003: Histórico com vínculo explícito a modelo próprio (ID 50)
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao) VALUES
        (1003, 6, 501, 50, 'SAFETY_LEADERSHIP', 'Safety', 'VALIDA', '2026-04-01');

      -- Histórico 1004: Histórico tentando apontar cross-tenant para o modelo 31 (do Tenant 7)
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao) VALUES
        (1004, 6, 501, 31, 'CRM_ANUAL', 'CRM', 'VALIDA', '2026-05-01');

      -- Histórico 1005: Histórico apontando para modelo excluído (ID 60)
      INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao) VALUES
        (1005, 6, 501, 60, 'CURSO_DEPRECADO', 'Deprecado', 'VALIDA', '2026-06-01');
    `,
    );
  });

  afterAll(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignora erro de limpeza
    }
  });

  it('1. Precedência Determinística e Unicidade: mesmo código no tenant e no global NÃO duplica linhas e escolhe o do tenant', async () => {
    const testApp = buildTestApp(databasePath, 6);
    const res = await testApp.request('/qualificacoes/historico?id=1001');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1); // Cardinalidade 1:1 estrita garantida!

    const item = body.data[0];
    expect(item.id).toBe(1001);
    expect(item.tipo_codigo).toBe('EAD_COORDENADOR_VOO');
    // Deve ter selecionado o modelo do Tenant 6 (ID 20, 24 meses), e NÃO o global (ID 10, 12 meses)
    expect(item.tipo_id).toBe(20);
    expect(item.tipo_nome).toBe('Coordenador Tenant Alpha (24m)');
    expect(item.tipo_validade_atual).toBe(24);
  });

  it('2. Isolamento Cross-Tenant pelo Código: Tenant 6 não resolve modelo pertencente ao Tenant 7 com mesmo código', async () => {
    const testApp = buildTestApp(databasePath, 6);
    // Insere histórico temporário com CRM_ANUAL sem ID
    runSql(
      databasePath,
      `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao)
       VALUES (1006, 6, 501, NULL, 'CRM_ANUAL', 'CRM', 'VALIDA', '2026-07-01');`,
    );

    const res = await testApp.request('/qualificacoes/historico?id=1006');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    // Deve resolver o modelo do Tenant 6 (ID 30, validade 12), JAMAIS o ID 31 (validade 24) do Tenant 7
    expect(item.tipo_id).toBe(30);
    expect(item.tipo_nome).toBe('CRM Anual Tenant 6');
    expect(item.tipo_validade_atual).toBe(12);
  });

  it('3. Fallback Seguro para Modelo Global quando inexistente no tenant', async () => {
    const testApp = buildTestApp(databasePath, 6);
    const res = await testApp.request('/qualificacoes/historico?id=1002');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    // Resolve o global (ID 40, 36 meses) com segurança
    expect(item.tipo_id).toBe(40);
    expect(item.tipo_nome).toBe('LGPD Global');
    expect(item.tipo_validade_atual).toBe(36);
  });

  it('4. Modelo explicitamente vinculado por ID pertencente ao próprio tenant', async () => {
    const testApp = buildTestApp(databasePath, 6);
    const res = await testApp.request('/qualificacoes/historico?id=1003');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    expect(item.tipo_id).toBe(50);
    expect(item.tipo_nome).toBe('Safety Leadership Tenant 6');
  });

  it('5. Proteção Cross-Tenant por ID: histórico com ID de outro tenant NÃO associa o modelo alheio', async () => {
    const testApp = buildTestApp(databasePath, 6);
    // Histórico 1004 do Tenant 6 tem qualificacao_id = 31 (pertencente ao Tenant 7)
    const res = await testApp.request('/qualificacoes/historico?id=1004');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    // O tipo 31 pertence à empresa 7, portanto a cláusula de resolução impede a associação
    expect(item.tipo_id_resolvido).toBeNull();
    expect(item.tipo_nome).toBeNull();
  });

  it('6. Modelo logicamente excluído (deleted_at IS NOT NULL) é estritamente ignorado', async () => {
    const testApp = buildTestApp(databasePath, 6);
    const res = await testApp.request('/qualificacoes/historico?id=1005');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    // Modelo 60 está deletado, então tipo_id_resolvido e tipo_nome devem vir nulos
    expect(item.tipo_id_resolvido).toBeNull();
    expect(item.tipo_nome).toBeNull();
  });

  it('7. PUT/PATCH: alteração de Inicial para Recorrente e cálculo exato de 24 meses com fim de mês', async () => {
    const testApp = buildTestApp(databasePath, 6);

    // Conclusão em 2026-01-15 com modelo de 24 meses e vencimento_fim_mes = 1 -> 2028-01-31
    const updateRes = await testApp.request('/qualificacoes/historico/1001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2026-01-15',
        tipo_treinamento: 'Recorrente',
        observacoes: 'Atualizado para periódico com carga horária recorrente',
      }),
    });

    expect(updateRes.status).toBe(200);
    const updateBody = (await updateRes.json()) as any;
    expect(updateBody.success).toBe(true);

    // Nova leitura real via endpoint GET para provar persistência física
    const readRes = await testApp.request('/qualificacoes/historico?id=1001');
    expect(readRes.status).toBe(200);
    const readBody = (await readRes.json()) as any;
    const updatedItem = readBody.data[0];

    expect(updatedItem.tipo_treinamento).toBe('RECORRENTE');
    // Carga horária recorrente do modelo 20 é 10h (a inicial é 20h)
    expect(updatedItem.carga_horaria).toBe(10);
    // Vencimento de 24 meses com fim do mês para 2026-01-15 é 2028-01-31
    expect(updatedItem.data_vencimento).toBe('2028-01-31');
  });

  it('8. Teste de Datas: ano bissexto (fevereiro 2024 -> 2026) e respeito à política de fim de mês', async () => {
    const testApp = buildTestApp(databasePath, 6);

    // Insere tipo sem vencimento_fim_mes (vencimento_fim_mes = 0, 24 meses)
    runSql(
      databasePath,
      `INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, validade, vencimento_fim_mes, carga_horaria)
       VALUES (70, 6, 'PILOT_SIM_24M', 'Simulador 24m Sem Fim Mes', 24, 0, 12);
       INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_id, qualificacao_codigo, tipo, status, data_conclusao)
       VALUES (1007, 6, 501, 70, 'PILOT_SIM_24M', 'Simulador', 'VALIDA', '2024-02-29');`,
    );

    // Conclusão em 29/02/2024 (ano bissexto), validade 24 meses sem fim de mês
    const res = await testApp.request('/qualificacoes/historico/1007', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2024-02-29',
        tipo_treinamento: 'Recorrente',
      }),
    });

    expect(res.status).toBe(200);

    const readRes = await testApp.request('/qualificacoes/historico?id=1007');
    const item = ((await readRes.json()) as any).data[0];

    // Data calculada determinística pela função de calendário
    expect(item.data_vencimento).toBe('2026-03-01');
  });
});
