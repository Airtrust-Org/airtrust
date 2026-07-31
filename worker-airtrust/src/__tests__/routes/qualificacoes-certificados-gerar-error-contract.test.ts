/**
 * Tests: POST /historico/:id/certificados/gerar — error response contract.
 *
 * Proves the EXACT shape the route returns for every sanitized error path —
 * this is what the frontend (ModalCertificado.tsx, via apiFetch directly,
 * not the shared httpClient) actually parses. All fields (success, error,
 * code, requestId) live at the TOP LEVEL of the JSON body, with no nested
 * wrapper — see qualificacoes-certificados-write.ts's catch block and
 * middleware/error-handler.ts's global handler, both of which return this
 * same flat shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { requestIdMiddleware } from '../../middleware/requestId';

const generateCertMock = vi.hoisted(() => vi.fn());
// requireOperationalAccess(...) is called ONCE per route registration, at
// module-eval time (when qualificacoes-certificados-write.ts is imported
// below) — the mock's implementation must therefore be wired up inside
// vi.hoisted (which runs before any import is evaluated), not as a regular
// statement after the imports, or the route would capture an unconfigured
// mock returning undefined ("inner is not a function"). The returned
// middleware reads `rbacBehaviorBox.current` LAZILY at request time, so
// each test can still swap behavior freely via `setRbacBehavior(...)`.
const { requireOperationalAccessMock, rbacBehaviorBox } = vi.hoisted(() => {
  const box: { current: (() => Promise<void>) | null } = { current: null };
  const mockFn = vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    if (box.current) {
      await box.current();
    }
    await next();
  });
  return { requireOperationalAccessMock: mockFn, rbacBehaviorBox: box };
});

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      c.set('userId', Number(c.req.header('x-test-user-id') || 10));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 6));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return { ...actual, getEmpresaId: (c: any) => Number(c.get('empresaId') || 0) };
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

// Isolates the RBAC 403 -> CERTIFICATE_* code-mapping wrapper in
// qualificacoes-certificados-write.ts from operational-domain-access.ts's
// own DB-driven resolution (covered independently in
// operational-domain-access.test.ts) — here we control exactly which
// ApiError the guard throws and assert the route maps + shapes it.
vi.mock('../../services/operational-domain-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/operational-domain-access')>();
  return {
    ...actual,
    requireOperationalAccess: requireOperationalAccessMock,
  };
});

import certificadosWriteRouter from '../../routes/qualificacoes-certificados-write';
import { CertificateGenerationError } from '../../services/generate-certificate';
import { ApiError } from '../../middleware/error-handler';

function makeApp(dbMock: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', requestIdMiddleware());
  app.use('*', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c.env as any) = { DB: dbMock, BUCKET: { put: vi.fn(), delete: vi.fn() } };
    await next();
  });
  app.route('/', certificadosWriteRouter);
  app.onError(errorHandler);
  return app;
}

function makeDbWithHistorico(historicoId: number, empresaId: number) {
  const prepareMock = vi.fn((query: string) => {
    const bindFn = (...args: unknown[]) => ({
      run: vi.fn().mockResolvedValue({ meta: { changes: 1, last_row_id: 999 } }),
      first: vi.fn().mockImplementation(async () => {
        if (query.includes('qualificacoes_historico qh') && query.includes('f.empresa_id')) {
          if (args[0] === empresaId && args[1] === historicoId) {
            return { id: historicoId, certificado_arquivo_id: null };
          }
          return null;
        }
        return null;
      }),
    });
    return { bind: bindFn, first: vi.fn(), run: vi.fn() };
  });
  return { prepare: prepareMock } as unknown as D1Database;
}

describe('POST /historico/:id/certificados/gerar — contrato de erro', () => {
  beforeEach(() => {
    generateCertMock.mockReset();
    rbacBehaviorBox.current = null; // no-op by default (legacy tenant equivalent) — individual tests override.
  });

  it('CertificateGenerationError chega no topo do corpo: success, error, code, requestId', async () => {
    generateCertMock.mockRejectedValue(
      new CertificateGenerationError(
        'CERTIFICATE_TEMPLATE_NOT_CONFIGURED',
        'Nenhum template de certificado ativo está configurado para esta empresa.',
      ),
    );
    const db = makeDbWithHistorico(100, 6);
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req-fixo-teste' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(422);
    const json = (await res.json()) as {
      success: boolean;
      error: string;
      code: string;
      requestId: string;
    };
    expect(json).toEqual({
      success: false,
      error: 'Nenhum template de certificado ativo está configurado para esta empresa.',
      code: 'CERTIFICATE_TEMPLATE_NOT_CONFIGURED',
      requestId: 'req-fixo-teste',
    });
    // O mesmo requestId também vai no header, para correlação de logs.
    expect(res.headers.get('X-Request-ID')).toBe('req-fixo-teste');
  });

  it('RBAC nega por domínio não classificado -> CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED no topo do corpo', async () => {
    rbacBehaviorBox.current = async () => {
      throw new ApiError(
        'Recurso sem domínio classificado — acesso negado (fail-closed)',
        403,
        'RESOURCE_DOMAIN_UNCLASSIFIED',
      );
    };
    const db = makeDbWithHistorico(100, 6);
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; error: string; code: string; requestId?: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED');
    expect(json.error).toMatch(/domínio operacional classificado/i);
    expect(typeof json.requestId).toBe('string');
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('RBAC nega por escopo/domínio -> CERTIFICATE_ACCESS_DENIED no topo do corpo', async () => {
    rbacBehaviorBox.current = async () => {
      throw new ApiError('Acesso operacional negado ao domínio OPERACOES', 403, 'OPERATIONAL_DOMAIN_ACCESS_DENIED');
    };
    const db = makeDbWithHistorico(100, 6);
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { success: boolean; error: string; code: string };
    expect(json.code).toBe('CERTIFICATE_ACCESS_DENIED');
  });

  it('erro inesperado nunca vaza detalhe interno — apenas success/error/code/requestId genéricos', async () => {
    generateCertMock.mockRejectedValue(new Error('detalhe interno sensível: stack trace XYZ'));
    const db = makeDbWithHistorico(100, 6);
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(500);
    const json = (await res.json()) as { success: boolean; error: string; code: string; requestId?: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('INTERNAL_ERROR');
    expect(json.error).not.toContain('detalhe interno sensível');
    expect(typeof json.requestId).toBe('string');
  });
});
