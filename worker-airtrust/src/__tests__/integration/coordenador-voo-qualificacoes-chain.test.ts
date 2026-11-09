import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import writeRouter from '../../routes/qualificacoes/historico-write';
import { getHistoricoListHandler } from '../../routes/qualificacoes/historico';
import { errorHandler } from '../../middleware/error-handler';
import { resetSchemaCache } from '../../utils/db-schema';
import type { Env, Variables } from '../../types';

type MockRow = Record<string, unknown>;

function createQualificationsChainDb() {
  const qualificacoesTipos: MockRow[] = [
    {
      id: 201,
      empresa_id: 6,
      codigo: 'EAD_COORDENADOR_VOO',
      nome: 'Coordenador de Voo EAD',
      categoria: 'EAD',
      categoria_id: 10,
      validade: 24,
      vencimento_fim_mes: 0,
      carga_horaria: 16,
      carga_horaria_inicial: 16,
      carga_horaria_recorrente: 8,
      deleted_at: null,
    },
    {
      id: 202,
      empresa_id: 7, // Outro tenant
      codigo: 'EAD_COORDENADOR_VOO',
      nome: 'Coordenador de Voo EAD (Tenant 7)',
      categoria: 'EAD',
      categoria_id: 10,
      validade: 24,
      vencimento_fim_mes: 0,
      carga_horaria: 16,
      deleted_at: null,
    },
  ];

  const funcionarios: MockRow[] = [
    {
      id: 501,
      empresa_id: 6,
      nome: 'Carlos Coordenador',
      cpf: '00000000000',
      status: 'ATIVO',
      deleted_at: null,
    },
    {
      id: 502,
      empresa_id: 7,
      nome: 'Fernando Outro Tenant',
      cpf: '00000000000',
      status: 'ATIVO',
      deleted_at: null,
    },
  ];

  const historicos: MockRow[] = [
    {
      id: 1001,
      empresa_id: 6,
      funcionario_id: 501,
      qualificacao_id: 201,
      qualificacao_codigo: 'EAD_COORDENADOR_VOO',
      tipo: 'Coordenador de Voo EAD',
      categoria: 'EAD',
      tipo_treinamento: 'INICIAL',
      data_conclusao: '2024-05-10',
      data_vencimento: '2026-05-10',
      validade_meses: 24,
      carga_horaria: 16,
      status: 'CONCLUIDA',
      observacoes: 'Registro original inicial',
      instrutor: 'Instrutor Alpha',
      renovada: 0,
      renovacao_de: null,
      deleted_at: null,
    },
    {
      id: 1002, // Registro de outro tenant (Tenant 7)
      empresa_id: 7,
      funcionario_id: 502,
      qualificacao_id: 202,
      qualificacao_codigo: 'EAD_COORDENADOR_VOO',
      tipo: 'Coordenador de Voo EAD (Tenant 7)',
      categoria: 'EAD',
      tipo_treinamento: 'INICIAL',
      data_conclusao: '2024-06-01',
      data_vencimento: '2026-06-01',
      validade_meses: 24,
      status: 'CONCLUIDA',
      deleted_at: null,
    },
  ];

  const auditLogs: MockRow[] = [];

  const db = {
    prepare: (sql: string) => {
      const stmt = {
        params: [] as unknown[],
        bind(...args: unknown[]) {
          stmt.params = args;
          return stmt;
        },
        async first<T>() {
          if (sql.includes('operational_domain_rbac_enabled')) {
            return { operational_domain_rbac_enabled: 1 } as T;
          }
          if (sql.includes('SELECT 1 as found FROM sqlite_master')) {
            return { found: 1 } as T;
          }
          if (sql.includes('PRAGMA table_info')) {
            return null as T;
          }
          if (sql.includes('FROM qualificacoes_historico qh') && sql.includes('WHERE qh.id = ? AND qh.empresa_id = ?')) {
            const [id, empresaId] = stmt.params as [number, number];
            const h = historicos.find((row) => row.id === id && row.empresa_id === empresaId && !row.deleted_at);
            if (!h) return null as T;
            const t = qualificacoesTipos.find((tp) => tp.id === h.qualificacao_id && !tp.deleted_at);
            return {
              id: h.id,
              funcionario_id: h.funcionario_id,
              tipo_treinamento: h.tipo_treinamento,
              carga_horaria: h.carga_horaria,
              validade_meses: h.validade_meses,
              data_vencimento: h.data_vencimento,
              qualificacao_codigo: h.qualificacao_codigo,
              tipo_validade: t?.validade ?? null,
              vencimento_fim_mes: t?.vencimento_fim_mes ?? 0,
              carga_horaria_inicial: t?.carga_horaria_inicial ?? 16,
              carga_horaria_recorrente: t?.carga_horaria_recorrente ?? 8,
            } as T;
          }
          if (sql.includes('FROM qualificacoes_historico qh') && sql.includes('INNER JOIN funcionarios f')) {
            const [id, empresaId] = stmt.params as [number, number];
            const h = historicos.find((row) => row.id === id && row.empresa_id === empresaId && !row.deleted_at);
            return h ? ({ id: h.id } as T) : null as T;
          }
          if (sql.includes('FROM qualificacoes_historico') && sql.includes('WHERE id = ?')) {
            const id = Number(stmt.params[0]);
            const h = historicos.find((row) => row.id === id && !row.deleted_at);
            return h ? (h as T) : null as T;
          }
          return null as T;
        },
        async all<T>() {
          if (sql.includes('FROM qualificacoes_historico qh')) {
            const empresaId = Number(stmt.params[0] || 6);
            const list = historicos.filter((h) => h.empresa_id === empresaId && !h.deleted_at);
            return { results: list } as T;
          }
          return { results: [] } as T;
        },
        async run() {
          if (sql.includes('UPDATE qualificacoes_historico')) {
            // SET data_conclusao = ?, data_vencimento = ?, instrutor = ?, observacoes = ?, tipo_treinamento = ?, carga_horaria = ? WHERE id = ? AND empresa_id = ?
            const [data_conclusao, data_vencimento, instrutor, observacoes, tipo_treinamento, carga_horaria, id, empresaId] = stmt.params as [
              string, string, string, string, string, number, number, number
            ];
            const h = historicos.find((row) => row.id === id && row.empresa_id === empresaId && !row.deleted_at);
            if (h) {
              h.data_conclusao = data_conclusao;
              h.data_vencimento = data_vencimento;
              h.instrutor = instrutor;
              h.observacoes = observacoes;
              h.tipo_treinamento = tipo_treinamento;
              h.carga_horaria = carga_horaria;
              h.updated_at = new Date().toISOString();
            }
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO auditoria')) {
            auditLogs.push({ params: stmt.params, at: new Date().toISOString() });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    historicos,
    auditLogs,
  };

  return db;
}

function buildApp(db: ReturnType<typeof createQualificationsChainDb>, userRole = 'ADMIN', empresaId = 6) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId,
      empresaNome: 'Empresa Teste',
      empresaCodigo: 'empresa_teste',
      role: userRole,
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
    c.set('userRole', userRole);
    await next();
  });

  app.route('/qualificacoes/historico', writeRouter);
  app.get('/qualificacoes/historico', getHistoricoListHandler);

  const env = { DB: db as unknown as D1Database, ENVIRONMENT: 'test' } as unknown as Env;

  return {
    request: (path: string, init: RequestInit = {}) =>
      app.request(path, init, env),
  };
}

describe('Pendências 1 & 2 — Cadeia Completa Qualificações, Histórico e Periodicidade (Coordenador de Voo)', () => {
  beforeEach(() => {
    resetSchemaCache();
  });

  it('1. Administrador autorizado altera histórico no próprio tenant sem erro RESOURCE_DOMAIN_UNCLASSIFIED', async () => {
    const db = createQualificationsChainDb();
    const app = buildApp(db, 'ADMIN', 6);

    const res = await app.request('/qualificacoes/historico/1001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2024-05-10',
        tipo_treinamento: 'RECORRENTE', // Mudança de Inicial para Periódico
        observacoes: 'Classificação atualizada para Periódico conforme reciclagem 24m',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { tipo_treinamento: string; data_vencimento: string } };
    expect(body.success).toBe(true);
    expect(body.data.tipo_treinamento).toBe('RECORRENTE');
    expect(body.data.data_vencimento).toBe('2026-05-10');
  });

  it('2. Persistência correta após salvar e reabertura consistente na listagem', async () => {
    const db = createQualificationsChainDb();
    const app = buildApp(db, 'ADMIN', 6);

    // 1º passo: salvar alteração para RECORRENTE
    await app.request('/qualificacoes/historico/1001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2024-05-10',
        tipo_treinamento: 'RECORRENTE',
        observacoes: 'Alteração persistida',
      }),
    });

    // 2º passo: consultar o registro persistido
    const persisted = db.historicos.find((h) => h.id === 1001);
    expect(persisted).toBeDefined();
    expect(persisted?.tipo_treinamento).toBe('RECORRENTE');
    expect(persisted?.data_vencimento).toBe('2026-05-10');
    expect(persisted?.carga_horaria).toBe(8); // Carga horária recorrente do modelo EAD_COORDENADOR_VOO
  });

  it('3. Usuário sem permissão recebe 403 Forbidden ao tentar editar', async () => {
    const db = createQualificationsChainDb();
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('empresaId', 6);
      c.set('tenantContext', {
        empresaId: 6,
        empresaNome: 'Costa do Sol',
        empresaCodigo: 'costa_do_sol',
        role: 'USUARIO',
        plano: 'ENTERPRISE',
        permissions: ['qualificacoes:visualizar'],
      });
      c.set('userId', 99);
      c.set('userEmail', 'viewer@airtrust.test');
      c.set('userRole', 'USUARIO');
      await next();
    });
    app.route('/qualificacoes/historico', writeRouter);

    const env = { DB: db as unknown as D1Database, ENVIRONMENT: 'test' } as unknown as Env;
    const res = await app.request(
      '/qualificacoes/historico/1001',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_conclusao: '2024-05-10',
          tipo_treinamento: 'RECORRENTE',
        }),
      },
      env,
    );

    expect(res.status).toBe(403);
  });

  it('4. Histórico pertencente a outro tenant é estritamente bloqueado (isolamento multi-tenant)', async () => {
    const db = createQualificationsChainDb();
    // Admin logado na Empresa 6 tentando editar registro 1002 da Empresa 7
    const app = buildApp(db, 'ADMIN', 6);

    const res = await app.request('/qualificacoes/historico/1002', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2024-06-01',
        tipo_treinamento: 'RECORRENTE',
      }),
    });

    expect(res.status).toBe(404);
    // O registro 1002 não sofre alteração
    const otherTenantRow = db.historicos.find((h) => h.id === 1002);
    expect(otherTenantRow?.tipo_treinamento).toBe('INICIAL');
  });

  it('5. ID inexistente ou inválido retorna 404/400 de forma controlada', async () => {
    const db = createQualificationsChainDb();
    const app = buildApp(db, 'ADMIN', 6);

    const resInvalido = await app.request('/qualificacoes/historico/abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_conclusao: '2024-05-10' }),
    });
    expect([400, 404]).toContain(resInvalido.status);

    const resInexistente = await app.request('/qualificacoes/historico/999999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_conclusao: '2024-05-10' }),
    });
    expect(resInexistente.status).toBe(404);
  });

  it('6. Proteção contra mutações retroativas indiscriminadas: outros históricos não são afetados', async () => {
    const db = createQualificationsChainDb();
    const app = buildApp(db, 'ADMIN', 6);

    const initialTimestamp1002 = db.historicos.find((h) => h.id === 1002)?.data_conclusao;

    await app.request('/qualificacoes/historico/1001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2024-05-10',
        tipo_treinamento: 'RECORRENTE',
      }),
    });

    // O histórico 1002 preserva exatamente seu estado intacto
    const check1002 = db.historicos.find((h) => h.id === 1002);
    expect(check1002?.data_conclusao).toBe(initialTimestamp1002);
    expect(check1002?.tipo_treinamento).toBe('INICIAL');
  });

  it('7. Integridade das informações: cálculo determinístico de vencimento a partir da periodicidade de 24 meses', async () => {
    const db = createQualificationsChainDb();
    const app = buildApp(db, 'ADMIN', 6);

    const res = await app.request('/qualificacoes/historico/1001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2025-01-15', // Nova data
        tipo_treinamento: 'RECORRENTE',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { data_vencimento: string } };
    // 2025-01-15 + 24 meses = 2027-01-15
    expect(body.data.data_vencimento).toBe('2027-01-15');
  });

  it('8. Auditoria registra autor autenticado da operação de atualização de histórico', async () => {
    const db = createQualificationsChainDb();
    const app = buildApp(db, 'ADMIN', 6);

    await app.request('/qualificacoes/historico/1001', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_conclusao: '2024-05-10',
        tipo_treinamento: 'RECORRENTE',
        observacoes: 'Auditoria test',
      }),
    });

    expect(db.auditLogs.length).toBeGreaterThan(0);
  });
});
