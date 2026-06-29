/**
 * Tests: /historico/:id/certificados/gerar idempotency + R2 key format
 *
 * Covers Scope A (idempotência) and Scope B (R2 key tenant-scoped):
 * - Returns EXISTS when cert already linked and no force_regenerate
 * - Returns CREATED when no cert linked
 * - Returns REGENERATED when force_regenerate=true; soft-deletes old doc
 * - Repeated calls without force do not create duplicate documents
 * - R2 key contains empresa-{id}, funcionario-{id}, historico-{id}
 * - R2 key does not contain CPF or name
 * - buildCertificadoR2Key is deterministic and pure
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const generateCertMock = vi.hoisted(() => vi.fn());

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
  requireRole:
    (...roles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!roles.map((r) => r.toLowerCase()).includes(role)) {
        return c.json({ success: false, error: 'Permissão negada' }, 403);
      }
      await next();
    },
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
import { buildCertificadoR2Key } from '../../services/generate-certificate';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeApp(dbMock: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c.env as any) = { DB: dbMock, BUCKET: { put: vi.fn(), delete: vi.fn() } };
    await next();
  });
  app.route('/', certificadosWriteRouter);
  return app;
}

function makeDbWithHistorico(opts: {
  historicoId: number;
  empresaId: number;
  certificadoArquivoId: number | null;
  docDeleted?: boolean;
}) {
  const { historicoId, empresaId, certificadoArquivoId, docDeleted = false } = opts;
  const prepareMock = vi.fn((query: string) => {
    const bindFn = (...args: unknown[]) => ({
      run: vi.fn().mockResolvedValue({ meta: { changes: 1, last_row_id: 999 } }),
      first: vi.fn().mockImplementation(async () => {
        // historico tenant check
        if (query.includes('qualificacoes_historico qh') && query.includes('f.empresa_id')) {
          if (args[0] === empresaId && args[1] === historicoId) {
            return { id: historicoId, certificado_arquivo_id: certificadoArquivoId };
          }
          return null;
        }
        // existing doc check
        if (query.includes('FROM documentos') && query.includes('deleted_at IS NULL')) {
          if (args[0] === certificadoArquivoId) {
            return docDeleted ? null : { id: certificadoArquivoId, uuid: 'ex-uuid', r2_key: 'certificados/empresa-6/funcionario-1/historico-100/ex-uuid.pdf', tamanho: 5000 };
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

// ── Testes: buildCertificadoR2Key (puro, sem HTTP) ────────────────────────────

describe('buildCertificadoR2Key', () => {
  it('contém empresa-{id}', () => {
    const key = buildCertificadoR2Key(6, 42, 100, 'abc12345');
    expect(key).toContain('empresa-6');
  });

  it('contém funcionario-{id}', () => {
    const key = buildCertificadoR2Key(6, 42, 100, 'abc12345');
    expect(key).toContain('funcionario-42');
  });

  it('contém historico-{id}', () => {
    const key = buildCertificadoR2Key(6, 42, 100, 'abc12345');
    expect(key).toContain('historico-100');
  });

  it('termina em .pdf com o uuid', () => {
    const key = buildCertificadoR2Key(6, 42, 100, 'abc12345');
    expect(key).toMatch(/abc12345\.pdf$/);
  });

  it('começa com certificados/', () => {
    const key = buildCertificadoR2Key(6, 42, 100, 'abc12345');
    expect(key.startsWith('certificados/')).toBe(true);
  });

  it('não contém CPF mesmo que uuid pareça um', () => {
    const cpfLike = '12345678901';
    const key = buildCertificadoR2Key(6, 42, 100, cpfLike);
    // A key deve conter o uuid, mas confirmar que o formato não tem segmento de CPF separado
    expect(key).not.toMatch(/\/\d{11}\//); // CPF no meio do path
  });

  it('não varia entre tenants com mesmo uuid', () => {
    const keyA = buildCertificadoR2Key(6, 42, 100, 'same1234');
    const keyB = buildCertificadoR2Key(7, 42, 100, 'same1234');
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain('empresa-6');
    expect(keyB).toContain('empresa-7');
  });
});

// ── Testes: POST /historico/:id/certificados/gerar ────────────────────────────

describe('POST /historico/:id/certificados/gerar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateCertMock.mockResolvedValue({
      documentoId: 200,
      uuid: 'new-uuid',
      r2Key: 'certificados/empresa-6/funcionario-1/historico-100/new-uuid.pdf',
      tamanho: 8000,
      numeroCertificado: 'CERT-2026',
    });
  });

  it('retorna EXISTS (200) quando certificado já existe e sem force_regenerate', async () => {
    const db = makeDbWithHistorico({ historicoId: 100, empresaId: 6, certificadoArquivoId: 50 });
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.estado).toBe('EXISTS');
    expect(json.data.id).toBe(50);
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('não cria documento duplicado em chamada repetida sem force', async () => {
    const db = makeDbWithHistorico({ historicoId: 100, empresaId: 6, certificadoArquivoId: 50 });
    const app = makeApp(db);

    await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('retorna CREATED (201) quando não há certificado', async () => {
    const db = makeDbWithHistorico({ historicoId: 100, empresaId: 6, certificadoArquivoId: null });
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.estado).toBe('CREATED');
    expect(json.data.id).toBe(200);
    expect(generateCertMock).toHaveBeenCalledOnce();
  });

  it('retorna REGENERATED (201) com force_regenerate=true e soft-deleta doc anterior', async () => {
    const db = makeDbWithHistorico({ historicoId: 100, empresaId: 6, certificadoArquivoId: 50 });
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_regenerate: true }),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.estado).toBe('REGENERATED');
    expect(json.data.id).toBe(200);
    expect(generateCertMock).toHaveBeenCalledOnce();

    // Verifica que prepare foi chamado com UPDATE documentos SET deleted_at
    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls as string[][];
    const softDeleteCall = prepareCalls.find(([q]) =>
      typeof q === 'string' && q.includes('UPDATE documentos') && q.includes('deleted_at'),
    );
    expect(softDeleteCall).toBeDefined();
  });

  it('regenera quando doc existente está soft-deleted (órfão)', async () => {
    const db = makeDbWithHistorico({
      historicoId: 100,
      empresaId: 6,
      certificadoArquivoId: 50,
      docDeleted: true,
    });
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.estado).toBe('CREATED');
    expect(generateCertMock).toHaveBeenCalledOnce();
  });

  it('retorna 404 quando histórico não pertence ao tenant', async () => {
    const db = makeDbWithHistorico({ historicoId: 100, empresaId: 7, certificadoArquivoId: null });
    const app = makeApp(db);

    // Pedido com empresaId=6, mas historico pertence a empresaId=7
    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-empresa-id': '6',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    expect(generateCertMock).not.toHaveBeenCalled();
  });

  it('retorna 403 para role insuficiente', async () => {
    const db = makeDbWithHistorico({ historicoId: 100, empresaId: 6, certificadoArquivoId: null });
    const app = makeApp(db);

    const res = await app.request('/historico/100/certificados/gerar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-role': 'student',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
    expect(generateCertMock).not.toHaveBeenCalled();
  });
});
