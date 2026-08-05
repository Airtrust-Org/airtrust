import type { Context } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import {
  applyLmsCursosDomainReadFilter,
  assertLmsCursoDetailDomainAccess,
  requireOperacoesCurso,
  resolveAndValidateCursoDominioCodigo,
} from '../../routes/lms-cursos-rbac';
import { assertOperationalAccess } from '../../services/operational-domain-access';
import type { Env } from '../../types';
import { createFixtureDb, type Fixtures, type TestD1 } from '../helpers/fixture-d1';

function buildFixtures(): Fixtures {
  return {
    empresas: [{ id: 2, nome: 'Rollout', operational_domain_rbac_enabled: 1 }],
    dominios: [
      { codigo: 'OPERACOES', nome: 'Operações', ativo: 1 },
      { codigo: 'MANUTENCAO', nome: 'Manutenção', ativo: 1 },
    ],
    setores: [{ id: 10, empresa_id: 2, nome: 'Operações', ativo: 1, dominio_codigo: 'OPERACOES' }],
    setoresGestores: [{ empresa_id: 2, setor_id: 10, usuario_id: 100, ativo: 1 }],
    qualificacoesCategorias: [{ id: 3, empresa_id: 2, ativo: 1, dominio_codigo: null }],
    qualificacoesTipos: [{ id: 3, empresa_id: 2, categoria_id: 3 }],
    qualificacoesHistorico: [{ id: 1002, empresa_id: 2, categoria_id: null, funcionario_id: 1 }],
    funcionarios: [{ id: 1, empresa_id: 2, setor_id: 10 }],
    lmsCursos: [
      { id: 500, empresa_id: 2, dominio_codigo: 'OPERACOES' },
      { id: 501, empresa_id: 2, dominio_codigo: 'MANUTENCAO' },
      { id: 502, empresa_id: 2, dominio_codigo: null },
    ],
  };
}

function makeDb(): TestD1 {
  return createFixtureDb(buildFixtures());
}

function makeContext(db: TestD1, userId = 100, userRole = 'gestor'): Context<{ Bindings: Env }> {
  const values: Record<string, unknown> = { empresaId: 2, userId, userRole };
  return {
    env: { DB: db as unknown as D1Database },
    get: (key: string) => values[key],
  } as unknown as Context<{ Bindings: Env }>;
}

describe('LMS cursos domínio-agnósticos', () => {
  it('inclui cursos sem domínio na listagem do gestor sem ampliar os domínios classificados', async () => {
    const db = makeDb();
    const result = await applyLmsCursosDomainReadFilter({
      db: db as unknown as D1Database,
      empresaId: 2,
      c: makeContext(db),
      hasLmsCursosDominioCodigo: true,
    });

    expect(result).toEqual({
      clause: ' AND (c.dominio_codigo IS NULL OR c.dominio_codigo IN (?))',
      bindings: ['OPERACOES'],
    });
  });

  it('permite detalhe e escrita de curso comprovadamente sem domínio', async () => {
    const db = makeDb();

    await expect(
      assertLmsCursoDetailDomainAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        c: makeContext(db),
        cursoId: 502,
      }),
    ).resolves.toBeUndefined();

    const app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('empresaId' as never, 2 as never);
      c.set('userId' as never, 100 as never);
      c.set('userRole' as never, 'gestor' as never);
      await next();
    });
    app.put('/cursos/:id', requireOperacoesCurso('update'), (c) => c.json({ ok: true }));

    const response = await app.request('http://localhost/cursos/502', { method: 'PUT' }, {
      DB: db as unknown as D1Database,
    } as unknown as Env);
    expect(response.status).toBe(200);
  });

  it('continua negando curso classificado fora do domínio do gestor', async () => {
    const db = makeDb();

    await expect(
      assertLmsCursoDetailDomainAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        c: makeContext(db),
        cursoId: 501,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'OPERATIONAL_DOMAIN_ACCESS_DENIED',
    });
  });

  it('aceita criação de curso sem domínio quando nenhum domínio explícito ou herdado existe', async () => {
    const db = makeDb();

    await expect(
      resolveAndValidateCursoDominioCodigo({
        db: db as unknown as D1Database,
        empresaId: 2,
        c: makeContext(db),
        explicitDominioCodigo: null,
        resolvedQualificacaoTipoId: null,
      }),
    ).resolves.toBeNull();
  });

  it('preserva fail-closed para históricos e certificados sem classificação', async () => {
    const db = makeDb();

    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        action: 'issue',
        resourceType: 'qualificacao_certificado',
        resourceId: 1002,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'RESOURCE_DOMAIN_UNCLASSIFIED',
    });
  });
});
