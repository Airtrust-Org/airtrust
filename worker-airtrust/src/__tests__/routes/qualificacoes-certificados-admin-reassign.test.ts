import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { recordAuditMock } = vi.hoisted(() => ({
  recordAuditMock: vi.fn(async () => {}),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('empresaId', 6);
    c.set('userRole', 'ADMINISTRADOR');
    await next();
  },
}));

vi.mock('../../middleware/platform-support', () => ({
  requireControlledAdminOrSupportAccess: () => async (_c: any, next: () => Promise<void>) => {
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
  recordLegacyAndCanonicalAudit: recordAuditMock,
}));

vi.mock('../../services/ensure-certificate', () => ({
  ensureCertificateForQualification: vi.fn(),
}));

import opsRouter from '../../routes/qualificacoes-certificados-admin-ops';

type State = {
  sourceDocumentId: number | null;
  targetDocumentId: number | null;
  sourceCode: string;
  targetCode: string;
  empresaId: number;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/certificados', opsRouter);
  return app;
}

function createDb(state: State) {
  const runs: Array<{ sql: string; args: unknown[] }> = [];

  function prepare(sql: string) {
    const statement = {
      args: [] as unknown[],
      bind(...args: unknown[]) {
        statement.args = args;
        return statement;
      },
      async first<T>() {
        if (
          sql.includes('FROM documentos d') &&
          sql.includes('INNER JOIN qualificacoes_historico origem')
        ) {
          if (state.empresaId !== 6) return null as T;
          const [empresaId, sourceId, targetId, documentId] = statement.args.map(Number);
          if (empresaId !== 6 || sourceId !== 3399 || targetId !== 4429 || documentId !== 234) {
            return null as T;
          }
          return {
            documento_id: 234,
            funcionario_id: 6,
            r2_key: 'certificados/CERT-00218-E2.pdf',
            origem_documento_id: state.sourceDocumentId,
            destino_documento_id: state.targetDocumentId,
            origem_codigo: state.sourceCode,
            destino_codigo: state.targetCode,
          } as T;
        }
        if (sql.includes('(SELECT certificado_arquivo_id FROM qualificacoes_historico')) {
          return {
            origem_documento_id: state.sourceDocumentId,
            destino_documento_id: state.targetDocumentId,
          } as T;
        }
        return null as T;
      },
      async all<T>() {
        if (sql.includes("PRAGMA table_info('pasta_virtual')")) {
          return {
            results: [
              { name: 'certificacao_id' },
              { name: 'caminho_arquivo' },
              { name: 'empresa_id' },
              { name: 'updated_at' },
            ],
          } as T;
        }
        return { results: [] } as T;
      },
      async run() {
        runs.push({ sql, args: [...statement.args] });
        if (
          sql.includes('UPDATE qualificacoes_historico') &&
          sql.includes('SET certificado_arquivo_id = CASE')
        ) {
          const matches =
            state.sourceDocumentId === 234 &&
            (state.targetDocumentId == null || state.targetDocumentId === 234);
          if (matches) {
            state.sourceDocumentId = null;
            state.targetDocumentId = 234;
          }
          return { success: true, meta: { changes: matches ? 2 : 0 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return statement;
  }

  const db = { prepare } as unknown as D1Database;

  return { db, runs };
}

async function requestReassign(state: State) {
  const { db, runs } = createDb(state);
  const response = await createApp().fetch(
    new Request('http://localhost/api/certificados/realocar-evidencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
      body: JSON.stringify({
        documento_id: 234,
        historico_origem_id: 3399,
        historico_destino_id: 4429,
      }),
    }),
    { DB: db } as unknown as Env,
    {} as ExecutionContext,
  );
  return { response, runs };
}

describe('certificados admin realocar evidencia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('realoca o mesmo objeto sem R2/reupload e confirma pós-condição', async () => {
    const state: State = {
      sourceDocumentId: 234,
      targetDocumentId: null,
      sourceCode: 'E2',
      targetCode: 'E2',
      empresaId: 6,
    };
    const { response, runs } = await requestReassign(state);
    const body = await response.json<any>();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(state.sourceDocumentId).toBeNull();
    expect(state.targetDocumentId).toBe(234);
    expect(runs.some((run) => run.sql.includes('UPDATE pasta_virtual'))).toBe(true);
    expect(recordAuditMock).toHaveBeenCalledOnce();
  });

  it('rejeita realocação entre qualificações diferentes', async () => {
    const state: State = {
      sourceDocumentId: 234,
      targetDocumentId: null,
      sourceCode: 'E2',
      targetCode: 'D2',
      empresaId: 6,
    };
    const { response, runs } = await requestReassign(state);

    expect(response.status).toBe(409);
    expect(runs).toHaveLength(0);
    expect(state.sourceDocumentId).toBe(234);
    expect(state.targetDocumentId).toBeNull();
  });

  it('rejeita destino que já possui outra evidência', async () => {
    const state: State = {
      sourceDocumentId: 234,
      targetDocumentId: 999,
      sourceCode: 'E2',
      targetCode: 'E2',
      empresaId: 6,
    };
    const { response, runs } = await requestReassign(state);

    expect(response.status).toBe(409);
    expect(runs).toHaveLength(0);
    expect(state.sourceDocumentId).toBe(234);
    expect(state.targetDocumentId).toBe(999);
  });

  it('não encontra evidência fora do tenant', async () => {
    const state: State = {
      sourceDocumentId: 234,
      targetDocumentId: null,
      sourceCode: 'E2',
      targetCode: 'E2',
      empresaId: 7,
    };
    const { response, runs } = await requestReassign(state);

    expect(response.status).toBe(404);
    expect(runs).toHaveLength(0);
  });
});
