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

describe('admin operational-domain-rbac classification (Item 2)', () => {
  beforeEach(() => {
    currentEmpresaId = 3;
  });

  it('GET /unclassified lista setor, categoria e curso pendentes do tenant', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/unclassified',
      {},
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { setores: unknown[]; categorias: unknown[]; cursos: unknown[]; dominios_validos: string[] };
    };
    expect(body.data.setores).toEqual([{ id: 30, nome: 'Sem domínio' }]);
    expect(body.data.categorias).toEqual([{ id: 3, nome: 'Categoria X' }]);
    expect(body.data.cursos).toEqual([{ id: 600, titulo: 'Curso Y' }]);
    expect(body.data.dominios_validos).toContain('MANUTENCAO');
  });

  it('POST /classify classifica um setor e o remove da listagem de pendentes', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/classify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'setor', resource_id: 30, dominio_codigo: 'MANUTENCAO' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(200);
    expect(db.fixtures.setores.find((s) => s.id === 30)?.dominio_codigo).toBe('MANUTENCAO');

    const readiness = await app.request(
      '/api/admin/operational-domain-rbac/readiness',
      {},
      { DB: db } as unknown as Env,
    );
    const readinessBody = (await readiness.json()) as { data: { setores_sem_dominio: number } };
    expect(readinessBody.data.setores_sem_dominio).toBe(0);
  });

  it('POST /classify classifica categoria e curso', async () => {
    const db = buildDb();
    const app = buildApp();

    const resCategoria = await app.request(
      '/api/admin/operational-domain-rbac/classify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'categoria', resource_id: 3, dominio_codigo: 'SGSO' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(resCategoria.status).toBe(200);
    expect(db.fixtures.qualificacoesCategorias!.find((c) => c.id === 3)?.dominio_codigo).toBe('SGSO');

    const resCurso = await app.request(
      '/api/admin/operational-domain-rbac/classify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'curso', resource_id: 600, dominio_codigo: 'FRMS' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(resCurso.status).toBe(200);
    expect(db.fixtures.lmsCursos!.find((c) => c.id === 600)?.dominio_codigo).toBe('FRMS');
  });

  it('rejeita domínio desconhecido (nunca aceita texto livre)', async () => {
    const db = buildDb();
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/classify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'setor', resource_id: 30, dominio_codigo: 'INVENTADO' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(400);
    expect(db.fixtures.setores.find((s) => s.id === 30)?.dominio_codigo).toBeNull();
  });

  it('404 quando o recurso não pertence ao tenant (isolamento)', async () => {
    const db = buildDb();
    const app = buildApp();
    // setor 10 pertence à empresa 2, mas o request está na empresa 3.
    const res = await app.request(
      '/api/admin/operational-domain-rbac/classify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'setor', resource_id: 10, dominio_codigo: 'MANUTENCAO' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(404);
    expect(db.fixtures.setores.find((s) => s.id === 10)?.dominio_codigo).toBe('OPERACOES');
  });

  it('Fix 1: rejeita classificar com um domínio existente porém inativo em dominios_operacionais', async () => {
    const db = buildDb();
    db.fixtures.dominios.find((d) => d.codigo === 'CORPORATIVO')!.ativo = 0;
    const app = buildApp();
    const res = await app.request(
      '/api/admin/operational-domain-rbac/classify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: 'setor', resource_id: 30, dominio_codigo: 'CORPORATIVO' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/desconhecido ou inativo/i);
    expect(db.fixtures.setores.find((s) => s.id === 30)?.dominio_codigo).toBeNull();
  });
});

describe('admin operational-domain-rbac readiness — domínio inativo/desconhecido em uso (Fix 2)', () => {
  it('bloqueia readiness quando um setor aponta para um domínio que existe mas está inativo', async () => {
    const db = buildDb();
    currentEmpresaId = 2;
    // Tenant 2 normalmente é totalmente pronto (ready=true); desativamos o
    // domínio que o setor 10 já usa para simular um domínio desativado
    // DEPOIS que setores/categorias/cursos já apontavam para ele.
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
    // Simula drift de dado: dominio_codigo aponta para um código que nunca
    // existiu em dominios_operacionais (nem ativo, nem inativo).
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
