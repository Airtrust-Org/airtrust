import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

type BackfillBody = {
  success: boolean;
  code?: string;
  data: {
    limit?: number;
    processed?: number;
    created?: number;
    skipped?: number;
    errors?: number;
    remaining?: number;
    next_cursor?: number;
    results?: Array<{ historico_id: number; state: string; error?: string }>;
  };
};

const { ensureCertificateForQualificationMock, recordLegacyAndCanonicalAuditMock } = vi.hoisted(
  () => ({
    ensureCertificateForQualificationMock: vi.fn(),
    recordLegacyAndCanonicalAuditMock: vi.fn(async () => {}),
  }),
);

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      c.set('userId', 1);
      c.set('empresaId', 6);
      c.set('userRole', 'ADMINISTRADOR');
      await next();
    },
}));

vi.mock('../../middleware/platform-support', () => ({
  requireControlledAdminOrSupportAccess:
    () =>
    async (_c: any, next: () => Promise<void>) => {
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: vi.fn(() => 6),
}));

vi.mock('../../lib/audit/context', () => ({
  buildAuditMetadata: vi.fn((_c: unknown, metadata: Record<string, unknown>) => metadata),
  buildLegacyAuditoriaActor: vi.fn(() => ({})),
  buildLegacyAuditPayload: vi.fn((_c: unknown, payload: Record<string, unknown>) => payload),
}));

vi.mock('../../lib/audit/record-legacy-and-canonical-audit', () => ({
  recordLegacyAndCanonicalAudit: recordLegacyAndCanonicalAuditMock,
}));

vi.mock('../../services/ensure-certificate', () => ({
  ensureCertificateForQualification: ensureCertificateForQualificationMock,
}));

import opsRouter from '../../routes/qualificacoes-certificados-admin-ops';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/certificados', opsRouter);
  return app;
}

function createDb(candidateIds: number[]) {
  const db = {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async all<T>() {
          if (sql.includes('SELECT qh.id AS historico_id')) {
            const empresaId = Number(statement.params[0]);
            const cursor = Number(statement.params[1]);
            const limit = Number(statement.params.at(-1));
            expect(empresaId).toBe(6);

            return {
              results: candidateIds
                .filter((id) => id > cursor && id !== 4449)
                .slice(0, limit)
                .map((historico_id) => ({ historico_id })),
            } as T;
          }

          return { results: [] } as T;
        },
        async first<T>() {
          if (sql.includes('SELECT COUNT(*) AS total')) {
            const cursor = Number(statement.params[1]);
            return {
              total: candidateIds.filter((id) => id > cursor && id !== 4449).length,
            } as T;
          }

          return null as T;
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return db;
}

async function hit(path: string, options?: { headers?: Record<string, string> }) {
  const app = createApp();
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: options?.headers,
    }),
    { DB: createDb([4400, 4449, 4500, 4600]) } as unknown as Env,
    {} as ExecutionContext,
  );
}

describe('qualificacoes certificados admin backfill apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 403 sem header de autorização explícita', async () => {
    const response = await hit('/api/certificados/admin/backfill-apply');
    const json = await response.json() as BackfillBody;

    expect(response.status).toBe(403);
    expect(json.code).toBe('EXPLICIT_AUTHORIZATION_REQUIRED');
    expect(ensureCertificateForQualificationMock).not.toHaveBeenCalled();
  });

  it('retorna 403 com header de autorização incorreto', async () => {
    const response = await hit('/api/certificados/admin/backfill-apply', {
      headers: { 'X-Backfill-Authorization': 'CONFIRM_BACKFILL_999' },
    });
    const json = await response.json() as BackfillBody;

    expect(response.status).toBe(403);
    expect(json.code).toBe('EXPLICIT_AUTHORIZATION_REQUIRED');
    expect(ensureCertificateForQualificationMock).not.toHaveBeenCalled();
  });

  it('processa lote sequencial com limit seguro, cursor e exclusão do historico 4449', async () => {
    ensureCertificateForQualificationMock
      .mockResolvedValueOnce({ state: 'CREATED' })
      .mockResolvedValueOnce({ state: 'EXISTS' });

    const response = await hit(
      '/api/certificados/admin/backfill-apply?limit=20&cursor=4400',
      {
        headers: { 'X-Backfill-Authorization': 'CONFIRM_BACKFILL_6' },
      },
    );
    const json = await response.json() as BackfillBody;

    expect(response.status).toBe(200);
    expect(json.data.limit).toBe(10);
    expect(json.data.processed).toBe(2);
    expect(json.data.created).toBe(1);
    expect(json.data.skipped).toBe(1);
    expect(json.data.errors).toBe(0);
    expect(json.data.remaining).toBe(0);
    expect(json.data.next_cursor).toBe(4600);
    expect(json.data.results).toEqual([
      { historico_id: 4500, state: 'CREATED', error: undefined },
      { historico_id: 4600, state: 'EXISTS', error: undefined },
    ]);

    expect(ensureCertificateForQualificationMock.mock.calls).toEqual([
      [expect.anything(), 4500, 6],
      [expect.anything(), 4600, 6],
    ]);
    expect(recordLegacyAndCanonicalAuditMock).toHaveBeenCalledOnce();
  });

  it('aceita historicoIds explícitos, mantém idempotência e ignora 4449', async () => {
    ensureCertificateForQualificationMock.mockResolvedValue({ state: 'SKIPPED' });

    const response = await hit(
      '/api/certificados/admin/backfill-apply?historicoIds=4449,4901,4902',
      {
        headers: { 'X-Backfill-Authorization': 'CONFIRM_BACKFILL_6' },
      },
    );
    const json = await response.json() as BackfillBody;

    expect(response.status).toBe(200);
    expect(json.data.processed).toBe(2);
    expect(json.data.skipped).toBe(2);
    expect(json.data.remaining).toBe(0);
    expect(ensureCertificateForQualificationMock.mock.calls).toEqual([
      [expect.anything(), 4901, 6],
      [expect.anything(), 4902, 6],
    ]);
  });
});
