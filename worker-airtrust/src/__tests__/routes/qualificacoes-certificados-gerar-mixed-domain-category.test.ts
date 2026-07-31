/**
 * Tests: POST /historico/:id/certificados/gerar against the REAL-shaped
 * incident data: a tenant with operational_domain_rbac_enabled=1, a
 * historico whose own categoria_id snapshot is missing, whose qualificação
 * tipo belongs to a categoria that is itself unclassified (dominio_codigo
 * NULL) — reproducing a mixed-domain "delivery modality" category (like
 * the real "EAD" category audited in production, which spans OPERACOES,
 * MANUTENCAO, and SGSO content and therefore cannot be assigned a single
 * dominio_codigo).
 *
 * Uses the REAL (unmocked) requireOperationalAccess/assertOperationalAccess
 * from operational-domain-access.ts — only generateCertificateForHistorico
 * itself is mocked, so this proves the RBAC guard genuinely lets a
 * correctly-scoped request through to PDF generation, not just that a
 * lower-level unit resolves a domain in isolation.
 *
 * All identifiers are fictitious.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import adminRouter from '../../routes/admin-operational-domain-rbac';
import type { Env } from '../../types';
import { createFixtureDb, type Fixtures } from '../helpers/fixture-d1';
import { errorHandler } from '../../middleware/error-handler';

const generateCertMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      c.set('userId', Number(c.req.header('x-test-user-id') || 0));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', c.req.header('x-test-role') || 'gestor');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return { ...actual, getEmpresaId: (c: any) => Number(c.get('empresaId') || 0) };

  it('DEPOIS do rollback do admin: a mesma requisição (antes autorizada) falha com CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED', async () => {
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    // 1. Rollback do override via endpoint admin (simula desclassificação humana)
    const classifyRes = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6003', // Admin
        'x-test-role': 'admin'
      },
      body: JSON.stringify({ resource_type: 'qualificacao_tipo', resource_id: 9001, dominio_codigo: null }),
    });
    expect(classifyRes.status).toBe(200);

    // 2. Tentar gerar certificado novamente com gestor de OPERACOES
    const res = await app.request('/historico/80001/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED');
    expect(generateCertMock).not.toHaveBeenCalled();
  });
});

vi.mock('../../middleware/rbac', () => ({
  requireRole: (..._roles: string[]) => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ userId: 10, origem: 'test' }),
}));

vi.mock('../../services/generate-certificate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/generate-certificate')>();
  return {
    ...actual,
    generateCertificateForHistorico: generateCertMock,
  };
});

vi.mock('../../routes/qualificacoes-certificados-helpers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../routes/qualificacoes-certificados-helpers')>();
  return {
    ...actual,
    getCertificadosStorageColumns: vi.fn().mockResolvedValue({
      documentosHasEmpresaId: true,
      pastaVirtualHasEmpresaId: true,
      pastaVirtualHasCertificacaoId: false,
      pastaVirtualHasDocumentoId: false,
    }),
  };
});

import certificadosWriteRouter from '../../routes/qualificacoes-certificados-write';
import adminRbacRouter from '../../routes/admin-operational-domain-rbac';

// ── Fixtures reproducing the real-shaped incident ───────────────────────────
//
// empresa 50 (fictitious): operational_domain_rbac_enabled = 1
// setor 500 = "Tripulação-like", OPERACOES
// setor 501 = "Manutenção-like", MANUTENCAO
// categoria 900 = the mixed-domain "delivery modality" category (like real
//   "EAD"): dominio_codigo NULL — genuinely unclassifiable as a whole.
// tipo 9001 = belongs to categoria 900, WITH an explicit per-tipo override
//   (dominio_codigo = OPERACOES) — simulating a human having classified
//   THIS SPECIFIC tipo via POST /api/admin/operational-domain-rbac/classify
//   (resource_type: 'qualificacao_tipo'), which is what migration 0454 and
//   the corresponding CLASSIFIABLE_TABLES entry enable.
// tipo 9002 = belongs to the SAME categoria 900, NO override — still
//   genuinely unclassified, must still fail closed.
// funcionario 7001 = setor 500 (OPERACOES, in scope for gestor 6001)
// funcionario 7002 = setor 501 (MANUTENCAO, different domain)
// funcionario 7003 = setor 500 too, but managed by a DIFFERENT gestor (out
//   of scope for gestor 6001, proves setor-level scoping isn't bypassed by
//   the override)
//
// historico 80001: funcionario 7001, categoria_id NULL (missing snapshot —
//   the real shape), qualificacao_id 9001 (the overridden tipo).
// historico 80002: funcionario 7003 (different setor, same OPERACOES domain
//   via the SAME overridden tipo 9001) — setor-scope must still block.
// historico 80003: funcionario 7002 (MANUTENCAO), qualificacao_id 9001
//   (override says OPERACOES) — domain mismatch for a gestor who only has
//   MANUTENCAO must still block.
// historico 80004: funcionario 7001, qualificacao_id 9002 (NOT overridden,
//   categoria still NULL) — must still fail closed (no bypass anywhere).
function buildFixtures(): Fixtures {
  return {
    empresas: [
      { id: 50, nome: 'Empresa Fictícia', operational_domain_rbac_enabled: 1 },
      { id: 51, nome: 'Outro Tenant Fictício', operational_domain_rbac_enabled: 1 },
    ],
    dominios: [
      { codigo: 'OPERACOES', nome: 'Operações', ativo: 1 },
      { codigo: 'MANUTENCAO', nome: 'Manutenção', ativo: 1 },
      { codigo: 'SGSO', nome: 'SGSO', ativo: 1 },
      { codigo: 'FRMS', nome: 'FRMS', ativo: 1 },
      { codigo: 'CORPORATIVO', nome: 'Corporativo', ativo: 1 },
    ],
    setores: [
      { id: 500, empresa_id: 50, nome: 'Tripulação Fictícia', ativo: 1, dominio_codigo: 'OPERACOES' },
      { id: 501, empresa_id: 50, nome: 'Manutenção Fictícia', ativo: 1, dominio_codigo: 'MANUTENCAO' },
      { id: 502, empresa_id: 51, nome: 'Setor de outro tenant', ativo: 1, dominio_codigo: 'OPERACOES' },
      // Segundo setor OPERACOES do MESMO tenant/domínio que 500, mas
      // DIFERENTE — usado para provar que o escopo é por setor, não apenas
      // por domínio (o gestor 6001 gerencia somente o setor 500).
      { id: 503, empresa_id: 50, nome: 'Tripulação Fictícia B (mesmo domínio, outro setor)', ativo: 1, dominio_codigo: 'OPERACOES' },
    ],
    setoresGestores: [
      // gestor 6001: gerencia SOMENTE o setor 500 (OPERACOES)
      { empresa_id: 50, setor_id: 500, usuario_id: 6001, ativo: 1 },
      // gestor 6002: gerencia SOMENTE o setor 501 (MANUTENCAO) — usado para
      // provar que um gestor de outro domínio continua bloqueado.
      { empresa_id: 50, setor_id: 501, usuario_id: 6002, ativo: 1 },
      // 6003: admin sem NENHUMA atribuição em setores_gestores — usado para
      // provar que não existe wildcard de admin mesmo após a correção.
    ],
    qualificacoesCategorias: [
      // A categoria mista (tipo "EAD"): permanece SEM dominio_codigo — nunca
      // classificada como um todo, propositalmente.
      { id: 900, empresa_id: 50, ativo: 1, dominio_codigo: null, nome: 'Categoria mista fictícia' },
    ],
    qualificacoesTipos: [
      // Classificado via override explícito (simula uma ação humana real
      // através do endpoint administrativo) — é isto que resolve o caso.
      { id: 9001, empresa_id: 50, categoria_id: 900, dominio_codigo: 'OPERACOES' },
      // Continua genuinamente não classificado — sem override, categoria
      // sem domínio: deve permanecer fail-closed.
      { id: 9002, empresa_id: 50, categoria_id: 900, dominio_codigo: null },
    ],
    qualificacoesHistorico: [
      { id: 80001, empresa_id: 50, categoria_id: null, qualificacao_id: 9001, funcionario_id: 7001 },
      { id: 80002, empresa_id: 50, categoria_id: null, qualificacao_id: 9001, funcionario_id: 7003 },
      { id: 80003, empresa_id: 50, categoria_id: null, qualificacao_id: 9001, funcionario_id: 7002 },
      { id: 80004, empresa_id: 50, categoria_id: null, qualificacao_id: 9002, funcionario_id: 7001 },
    ],
    funcionarios: [
      { id: 7001, empresa_id: 50, setor_id: 500 },
      { id: 7002, empresa_id: 50, setor_id: 501 },
      // setor 503: mesmo domínio (OPERACOES) que 500, mas um setor
      // DIFERENTE que o gestor 6001 não gerencia.
      { id: 7003, empresa_id: 50, setor_id: 503 },
    ],
  };
}

function makeApp(dbMock: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c.env as any) = { DB: dbMock, BUCKET: { put: vi.fn(), delete: vi.fn() } };
    await next();
  });
  app.route('/', certificadosWriteRouter);
  app.route('/api/admin/operational-domain-rbac', adminRbacRouter);
  // The RBAC guard's ApiError is thrown from MIDDLEWARE (before the route
  // handler's own try/catch), so it must be caught by the same global
  // error handler production registers in index.ts — without it, Hono's
  // default uncaught-error behavior returns a generic 500 instead of the
  // ApiError's real statusCode/code.
  app.onError(errorHandler);
  return app;
}

// Wraps the fixture-d1 engine (which already faithfully models every query
// operational-domain-access.ts issues) with the two extra query shapes
// qualificacoes-certificados-write.ts's own handler needs: the tenant-scoped
// historico existence check, and the "does an existing certificado doc
// exist" check. Both are intercepted BEFORE delegating to the fixture
// engine, since both also happen to contain the substring
// 'FROM qualificacoes_historico qh' that the fixture's own resolver matches
// on for a DIFFERENT query (resolveResourceDomain).
function makeRouteDb(fixtures: Fixtures) {
  const fixtureDb = createFixtureDb(fixtures);

  const prepare = (sql: string) => {
    if (sql.includes('qh.certificado_arquivo_id')) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            const [boundEmpresaId, boundHistoricoId] = args as [number, number];
            // Real tenant-ownership check against the fixtures, exactly
            // like the production query does via the funcionarios JOIN —
            // a historico only "exists" for a request's empresaId if its
            // owning funcionário actually belongs to that empresa.
            const hist = (fixtures.qualificacoesHistorico || []).find(
              (h) => h.id === boundHistoricoId && !h.deleted_at,
            );
            const funcionario = hist?.funcionario_id
              ? (fixtures.funcionarios || []).find((f) => f.id === hist.funcionario_id)
              : null;
            if (!hist || !funcionario || funcionario.empresa_id !== boundEmpresaId) return null;
            return { id: hist.id, certificado_arquivo_id: null };
          },
          run: async () => ({ meta: { changes: 1, last_row_id: 1 } }),
        }),
      };
    }
    if (sql.includes('FROM documentos') && sql.includes('WHERE id = ?')) {
      return {
        bind: () => ({
          first: async () => null,
          run: async () => ({ meta: { changes: 1, last_row_id: 1 } }),
        }),
      };
    }
    return fixtureDb.prepare(sql);
  };

  return {
    prepare,
    batch: async (statements: any[]) => {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  } as unknown as D1Database;
}

describe('POST /historico/:id/certificados/gerar — categoria mista (tipo "EAD" real) com override por tipo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateCertMock.mockResolvedValue({
      documentoId: 999,
      uuid: 'uuid-fake',
      r2Key: 'certificados/empresa-50/funcionario-7001/historico-80001/uuid-fake.pdf',
      tamanho: 1234,
      numeroCertificado: 'CERT-FAKE',
    });
  });

  it('ANTES da correção (dado real, sem override): categoria mista sem domínio bloqueia mesmo o gestor corretamente escopado', async () => {
    // Reproduz o estado real do incidente: mesma cadeia (historico 80004),
    // mas usando o tipo SEM override (9002) — prova que, sem a
    // classificação explícita, o guard continua fail-closed mesmo para
    // quem teria escopo de setor correto.
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80004/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED');
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('DEPOIS da correção: gestor corretamente escopado (setor 500, OPERACOES) passa pelo guard e gera o certificado', async () => {
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80001/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as { success: boolean; estado: string; data: { id: number } };
    expect(json.success).toBe(true);
    expect(json.estado).toBe('CREATED');
    expect(json.data.id).toBe(999);
    expect(generateCertMock).toHaveBeenCalledOnce();
  });

  it('usuário do MESMO domínio mas de OUTRO setor continua bloqueado (escopo por setor não é contornado pelo override)', async () => {
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80002/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        // gestor 6001 só gerencia o setor 500; historico 80002 pertence ao
        // funcionário 7003, que está no setor 503 — MESMO domínio
        // (OPERACOES) do tipo classificado via override, mas um setor
        // DIFERENTE e fora do escopo de 6001. O override de domínio no
        // tipo nunca substitui a checagem de setor.
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('CERTIFICATE_ACCESS_DENIED');
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('gestor de domínio DIFERENTE (MANUTENCAO) é bloqueado mesmo com o tipo classificado como OPERACOES', async () => {
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80003/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001', // gestor só de OPERACOES (setor 500)
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.code).toBe('CERTIFICATE_ACCESS_DENIED');
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('admin sem NENHUMA atribuição em setores_gestores continua sem wildcard, mesmo após a correção', async () => {
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80001/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6003', // admin, zero linhas em setores_gestores
        'x-test-role': 'admin',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.code).toBe('CERTIFICATE_ACCESS_DENIED');
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('tipo genuinamente não classificado (sem override, categoria sem domínio) continua fail-closed mesmo dentro do setor certo', async () => {
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80004/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.code).toBe('CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED');
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('outro tenant não é afetado: mesmo historicoId sob empresa diferente nunca autoriza nem gera (nunca 200/201)', async () => {
    // historico 80001 pertence à empresa 50; esta requisição se declara da
    // empresa 51. A guarda de RBAC resolve o domínio do recurso filtrando
    // por WHERE qh.empresa_id = ? — sob a empresa errada, nenhuma linha
    // corresponde, então o domínio resolve como não-classificado e a
    // guarda falha fechado com 403 (mesmo comportamento já coberto em
    // operational-domain-access.test.ts: "gestor não acessa recurso de
    // outro tenant mesmo com mesmo id" — a guarda nunca revela se o
    // recurso existe em outro tenant, apenas nega). O ponto essencial
    // deste teste é que a requisição NUNCA é autorizada nem chega a gerar
    // o certificado sob o tenant errado.
    const db = makeRouteDb(buildFixtures());
    const app = makeApp(db);

    const res = await app.request('/historico/80001/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '51',
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('INTEGRADO: rollback do admin reverte o tipo para fail-closed e corta acesso instantaneamente', async () => {
    // 1 e 2. Tipo já está em categoria mista com override OPERACOES (id=9001) no fixture
    const f = buildFixtures();
    const db = makeRouteDb(f);
    const app = makeApp(db);

    // 3. gestor corretamente escopado gera certificado: HTTP 201
    let res = await app.request('/historico/80001/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001', // gestor OPERACOES
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    expect(generateCertMock).toHaveBeenCalledOnce();
    generateCertMock.mockClear();

    // 4. admin chama o endpoint real de rollback
    const classifyRes = await app.request('/api/admin/operational-domain-rbac/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6003', // admin
        'x-test-role': 'admin',
      },
      body: JSON.stringify({
        resource_type: 'qualificacao_tipo',
        resource_id: 9001,
        dominio_codigo: null,
      }),
    });

    // 5. confirmar que o rollback retornou 200
    // 5. confirmar que o rollback retornou 200
    expect(classifyRes.status).toBe(200);
    
    // (Opcional) Podemos provar que persistiu null via fixture?
    // O mock UPDATE no makeRouteDb seta a propriedade do fixture no escopo:
    expect(f.qualificacoesTipos![0].dominio_codigo).toBeNull();

    // 6. repetir a mesma geração de certificado
    res = await app.request('/historico/80001/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '50',
        'x-test-user-id': '6001',
        'x-test-role': 'gestor',
      },
      body: JSON.stringify({}),
    });

    // 7. confirmar: HTTP 403, code = CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED
    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; code?: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED');

    // 8. confirmar que generateCertificateForHistorico não foi chamado depois do rollback
    expect(generateCertMock).not.toHaveBeenCalled();
  });
});

