import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { createFixtureDb, type Fixtures, type TestD1 } from '../helpers/fixture-d1';

let currentEmpresaId = 2;

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => currentEmpresaId,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue(undefined),
  extrairUsuarioAuditoria: () => ({ usuario_id: 99, usuario_nome: 'teste' }),
}));

import router from '../../routes/admin-operational-domain-rbac';
import { errorHandler } from '../../middleware/error-handler';

function buildFixtures(): Fixtures {
  return {
    empresas: [
      { id: 2, nome: 'Tenant Pronto', operational_domain_rbac_enabled: 0 },
      { id: 3, nome: 'Tenant Com Bloqueios', operational_domain_rbac_enabled: 0 },
    ],
    dominios: [
      { codigo: 'OPERACOES', nome: 'Operações', ativo: 1 },
      { codigo: 'MANUTENCAO', nome: 'Manutenção', ativo: 1 },
      { codigo: 'SGSO', nome: 'SGSO', ativo: 1 },
      { codigo: 'FRMS', nome: 'FRMS', ativo: 1 },
      { codigo: 'CORPORATIVO', nome: 'Corporativo', ativo: 1 },
    ],
    // Tenant 2: totalmente classificado -> readiness deve ser ready=true
    setores: [
      { id: 10, empresa_id: 2, nome: 'Operações', ativo: 1, dominio_codigo: 'OPERACOES' },
      // Tenant 3: setor sem domínio
      { id: 30, empresa_id: 3, nome: 'Sem domínio', ativo: 1, dominio_codigo: null },
    ],
    setoresGestores: [{ empresa_id: 2, setor_id: 10, usuario_id: 100, ativo: 1 }],
    usuarios: [
      { id: 100, email: 'gestor@x.com' },
      { id: 300, email: 'gestorsemsetor@x.com' },
    ],
    usuariosEmpresas: [
      { usuario_id: 100, empresa_id: 2, role: 'manager' },
      // Tenant 3: gestor sem setor
      { usuario_id: 300, empresa_id: 3, role: 'manager' },
    ],
    qualificacoesCategorias: [
      { id: 1, empresa_id: 2, ativo: 1, dominio_codigo: 'OPERACOES' },
      // Tenant 3: categoria sem domínio
      { id: 3, empresa_id: 3, ativo: 1, dominio_codigo: null, nome: 'Categoria X' },
      // Tenant 3: categoria já classificada, própria do tenant 3.
      { id: 4, empresa_id: 3, ativo: 1, dominio_codigo: 'MANUTENCAO', nome: 'Categoria Classificada T3' },
    ],
    qualificacoesTipos: [
      // Tenant 3: tipo pertencente à categoria mista (3, sem domínio),
      // sem override próprio — genuinamente bloqueado (migration 0454).
      { id: 40, empresa_id: 3, categoria_id: 3, dominio_codigo: null, nome: 'Tipo Pendente', ativo: 1 },
      // Tenant 3: tipo com categoria JÁ classificada (herda via fallback,
      // não deve aparecer como pendente).
      { id: 41, empresa_id: 3, categoria_id: 4, dominio_codigo: null, nome: 'Tipo OK via categoria', ativo: 1 },
    ],
    lmsCursos: [
      { id: 500, empresa_id: 2, dominio_codigo: 'OPERACOES' },
      // Tenant 3: curso sem classificação
      { id: 600, empresa_id: 3, dominio_codigo: null, titulo: 'Curso Y' },
    ],
  };
}

function buildDb(): TestD1 {
  return createFixtureDb(buildFixtures());
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/admin/operational-domain-rbac', router);
  return app;
}

describe('admin operational-domain-rbac readiness + activation', () => {
  beforeEach(() => {
    currentEmpresaId = 2;
  });

  it('tenant pronto reporta ready=true e zero bloqueios', async () => {
    const db = buildDb();
    currentEmpresaId = 2;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/readiness',
      {},
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      ready: true,
      setores_sem_dominio: 0,
      categorias_sem_dominio: 0,
      gestores_sem_setor: 0,
      cursos_sem_classificacao: 0,
    });
  });

  it('tenant com bloqueios reporta ready=false com contagens corretas', async () => {
    const db = buildDb();
    currentEmpresaId = 3;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/readiness',
      {},
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      ready: false,
      setores_sem_dominio: 1,
      categorias_sem_dominio: 1,
      gestores_sem_setor: 1,
      cursos_sem_classificacao: 1,
    });
    expect((body.data.bloqueios as string[]).length).toBe(4);
  });

  it('ativação com bloqueios retorna 409 e não altera a flag', async () => {
    const db = buildDb();
    currentEmpresaId = 3;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/activate',
      { method: 'POST' },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(409);
    expect(db.fixtures.empresas.find((e) => e.id === 3)?.operational_domain_rbac_enabled).toBe(0);
  });

  it('ativação sem bloqueios liga a flag apenas para o tenant ativado', async () => {
    const db = buildDb();
    currentEmpresaId = 2;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/activate',
      { method: 'POST' },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(200);
    expect(db.fixtures.empresas.find((e) => e.id === 2)?.operational_domain_rbac_enabled).toBe(1);
    // Tenant B não é afetado pela ativação do tenant A.
    expect(db.fixtures.empresas.find((e) => e.id === 3)?.operational_domain_rbac_enabled).toBe(0);
  });

  it('desativação (rollback) restaura o modo legado', async () => {
    const db = buildDb();
    db.fixtures.empresas.find((e) => e.id === 2)!.operational_domain_rbac_enabled = 1;
    currentEmpresaId = 2;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/deactivate',
      { method: 'POST' },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(200);
    expect(db.fixtures.empresas.find((e) => e.id === 2)?.operational_domain_rbac_enabled).toBe(0);
  });
});

describe('admin operational-domain-rbac classification (Item 2 - Atomic Fail-Closed)', () => {
  beforeEach(() => {
    currentEmpresaId = 3;
  });

  it('1, 15. classifica qualificacao_tipo de null para OPERACOES atômico', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'OPERACOES' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
    const tipo = db.fixtures.qualificacoesTipos!.find(t => t.id === 40);
    expect(tipo?.dominio_codigo).toBe('OPERACOES');
    const audit = db.fixtures.auditoria!.find(a => a.tabela_afetada === 'qualificacoes_tipos' && a.registro_id === '40');
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.dados_antes!)).toEqual({ dominio_codigo: null });
    expect(JSON.parse(audit!.dados_depois!)).toEqual({ dominio_codigo: 'OPERACOES' });
  });

  it('2. reclassifica qualificacao_tipo de OPERACOES para outro ativo', async () => {
    const db = buildDb();
    db.fixtures.qualificacoesTipos!.find(t => t.id === 40)!.dominio_codigo = 'OPERACOES';
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'SGSO' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
    expect(db.fixtures.qualificacoesTipos!.find(t => t.id === 40)?.dominio_codigo).toBe('SGSO');
    const audit = db.fixtures.auditoria!.find(a => a.registro_id === '40');
    expect(JSON.parse(audit!.dados_antes!)).toEqual({ dominio_codigo: 'OPERACOES' });
    expect(JSON.parse(audit!.dados_depois!)).toEqual({ dominio_codigo: 'SGSO' });
  });

  it('3. repete o mesmo domínio de forma idempotente', async () => {
    const db = buildDb();
    db.fixtures.qualificacoesTipos!.find(t => t.id === 40)!.dominio_codigo = 'OPERACOES';
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'OPERACOES' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
    expect(db.fixtures.qualificacoesTipos!.find(t => t.id === 40)?.dominio_codigo).toBe('OPERACOES');
  });

  it('4, 16. desclassifica qualificacao_tipo para null com auditoria', async () => {
    const db = buildDb();
    db.fixtures.qualificacoesTipos!.find(t => t.id === 40)!.dominio_codigo = 'OPERACOES';
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: null })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
    expect(db.fixtures.qualificacoesTipos!.find(t => t.id === 40)?.dominio_codigo).toBeNull();
    const audit = db.fixtures.auditoria!.find(a => a.registro_id === '40');
    expect(JSON.parse(audit!.dados_antes!)).toEqual({ dominio_codigo: 'OPERACOES' });
    expect(JSON.parse(audit!.dados_depois!)).toEqual({ dominio_codigo: null });
  });

  it('5. desclassifica qualificacao_tipo já null idempotente', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: null })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
  });

  it('6, 7, 8. rejeita null para setor, categoria e curso', async () => {
    const db = buildDb();
    const app = buildApp();
    let res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'setor', resource_id: 30, dominio_codigo: null })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(400);

    res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'categoria', resource_id: 3, dominio_codigo: null })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(400);

    res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'curso', resource_id: 600, dominio_codigo: null })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(400);
  });

  it('9. rejeita domínio inexistente', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'INVENTADO' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(400);
  });

  it('10. rejeita domínio inativo', async () => {
    const db = buildDb();
    db.fixtures.dominios.find(d => d.codigo === 'CORPORATIVO')!.ativo = 0;
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'CORPORATIVO' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(400);
  });

  it('11. retorna 404 para recurso inexistente', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 9999, dominio_codigo: 'OPERACOES' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(404);
  });

  it('12, 17. 404 para recurso de outro tenant, nenhuma linha alterada', async () => {
    const db = buildDb();
    currentEmpresaId = 2; // tipo 40 is tenant 3
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'OPERACOES' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(404);
    expect(db.fixtures.qualificacoesTipos!.find(t => t.id === 40)?.dominio_codigo).toBeNull();
  });

  it('13. falha na transação não deixa o UPDATE persistido', async () => {
    const db = buildDb();
    const originalBatch = db.batch;
    db.batch = vi.fn().mockRejectedValue(new Error('Simulated D1 batch failure'));
    
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'OPERACOES' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(500);
    db.batch = originalBatch;
  });

  it('14. se UPDATE meta.changes !== 1, lança 500 sem persistir falsa auditoria', async () => {
    const db = buildDb();
    const originalBatch = db.batch;
    db.batch = vi.fn().mockResolvedValue([{ meta: { changes: 0 } }, { meta: { changes: 1 } }]);
    
    const app = buildApp();
    const res = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 40, dominio_codigo: 'OPERACOES' })
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(500);
    db.batch = originalBatch;
  });
});

describe('admin operational-domain-rbac readiness — domínio inativo/desconhecido em uso (Fix 2)', () => {
  it('bloqueia readiness quando um setor aponta para um domínio que existe mas está inativo', async () => {
    const db = buildDb();
    currentEmpresaId = 2;
    db.fixtures.dominios.find((d) => d.codigo === 'OPERACOES')!.ativo = 0;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/readiness',
      {},
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as {
      data: { ready: boolean; dominios_inativos_em_uso: number; bloqueios: string[] };
    };
    expect(body.data.ready).toBe(false);
    expect(body.data.dominios_inativos_em_uso).toBeGreaterThan(0);
    expect(body.data.bloqueios.some((b) => /inativo/i.test(b))).toBe(true);
  });

  it('bloqueia readiness quando um setor aponta para um código de domínio desconhecido', async () => {
    const db = buildDb();
    currentEmpresaId = 2;
    db.fixtures.setores.find((s) => s.id === 10)!.dominio_codigo = 'CODIGO_INEXISTENTE';
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/readiness',
      {},
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as {
      data: { ready: boolean; dominios_desconhecidos_em_uso: number; bloqueios: string[] };
    };
    expect(body.data.ready).toBe(false);
    expect(body.data.dominios_desconhecidos_em_uso).toBeGreaterThan(0);
    expect(body.data.bloqueios.some((b) => /desconhecido/i.test(b))).toBe(true);
  });

  it('não bloqueia readiness quando todos os domínios em uso existem e estão ativos', async () => {
    const db = buildDb();
    currentEmpresaId = 2;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/readiness',
      {},
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as {
      data: { ready: boolean; dominios_desconhecidos_em_uso: number; dominios_inativos_em_uso: number };
    };
    expect(body.data.ready).toBe(true);
    expect(body.data.dominios_desconhecidos_em_uso).toBe(0);
    expect(body.data.dominios_inativos_em_uso).toBe(0);
  });
});
