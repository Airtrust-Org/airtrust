/**
 * Tests for the PATCH /:id/status qualification-generation gate.
 *
 * Regression suite introduced after audit finding: the endpoint previously
 * wrote CONCLUIDO + generated an aviation qualification with no SCORM evidence
 * check, bypassing the gate that exists on POST /:id/finalizar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  hasRoleMock,
  syncMatriculaCycleFromMatriculaMock,
  completeLmsMatriculaMock,
  logAuditMock,
} = vi.hoisted(() => ({
  hasRoleMock: vi.fn().mockReturnValue(true),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  completeLmsMatriculaMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', 42);
      c.set('userRole', 'admin');
      await next();
    },
}));

vi.mock('../../middleware/rbac', () => ({
  hasRole: hasRoleMock,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-completion', async () => {
  const actual = await vi.importActual<typeof import('../../services/lms-completion')>(
    '../../services/lms-completion',
  );
  return {
    ...actual,
    completeLmsMatricula: completeLmsMatriculaMock,
  };
});

vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: vi.fn(),
  hasActiveMatriculaCycle: (r: { status?: string | null; deleted_at?: string | null } | null) =>
    Boolean(r && !r.deleted_at && ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(r.status))),
  syncMatriculaCycleFromMatricula: syncMatriculaCycleFromMatriculaMock,
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

vi.mock('../../lib/email', () => ({ sendEmail: vi.fn() }));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';
import { errorHandler } from '../../middleware/error-handler';

// ── helpers ──────────────────────────────────────────────────────────────────

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const writes: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled query: ${query.slice(0, 120)}`);

      const handler = entry[1];
      return {
        bind: (...args: unknown[]) => ({
          first: async () => (handler.first ? handler.first(args) : null),
          run: async () => {
            writes.push(query.slice(0, 60));
            return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
          },
        }),
        first: async () => (handler.first ? handler.first([]) : null),
        run: async () => {
          writes.push(query.slice(0, 60));
          return { meta: { changes: 1, last_row_id: 0 } };
        },
        all: async () => ({ results: [] }),
      };
    }),
  } as unknown as D1Database;

  return { db, writes };
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);
  app.onError(errorHandler);
  return app;
}

function patchStatus(app: Hono<{ Bindings: Env }>, db: D1Database, matriculaId: number, body: object) {
  return app.fetch(
    new Request(`http://localhost/${matriculaId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

// Fixed matrícula fixture for SCORM AW139 with qualification
const scormMatriculaWithQual = {
  id: 200,
  status: 'EM_ANDAMENTO',
  progresso_pct: 50,
  funcionario_id: 10,
  qualificacao_historico_id: null,
  curso_id: 5,
  curso_titulo: 'AW139 - Manutenção',
  qualificacao_tipo_id: 7,
  tipo_conteudo: 'scorm',
  scorm_mastery_score: 70,
  gerar_qualificacao_ao_concluir: 1,
  qualificacao_nome: 'AW139',
  qualificacao_codigo: 'MNT_AW139',
  qualificacao_categoria: 'manutencao',
  qualificacao_validade: 12,
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /:id/status — qualification gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created',
      qualificacaoHistoricoId: 999,
      matriculaId: 200,
    });
    logAuditMock.mockResolvedValue(undefined);
    hasRoleMock.mockReturnValue(true); // default: admin
  });

  // ── 1. Manager blocked from generating qualification ───────────────────────

  it('rejeita 403 quando manager tenta CONCLUIDO em matricula com qualificacao vinculada', async () => {
    hasRoleMock.mockReturnValue(false); // simula manager (não admin)

    const { db, writes } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO', observacoes: 'relato verbal' });

    expect(res.status).toBe(403);
    const body = await res.json() as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/administradores/i);

    // nenhuma escrita no banco
    expect(writes).toHaveLength(0);
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  // ── 2. Admin CONCLUIDO + SCORM + sem evidência → 409 ──────────────────────

  it('rejeita 409 quando admin tenta CONCLUIDO em matricula SCORM sem evidencia', async () => {
    hasRoleMock.mockReturnValue(true);

    const { db, writes } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
      ['FROM lms_progresso_scorm', { first: () => null }], // sem registro SCORM
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO', observacoes: 'conclusao manual' });

    expect(res.status).toBe(409);
    const body = await res.json() as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('SCORM_COMPLETION_REJECTED');

    // nenhuma escrita: matrícula não foi alterada, qualificação não gerada
    expect(writes).toHaveLength(0);
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();

    // audit registrado como SCORM_COMPLETION_REJECTED
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'SCORM_COMPLETION_REJECTED',
        entityId: 200,
      }),
    );
  });

  // ── 3. Admin CONCLUIDO + SCORM + score alto mas lesson_status incompleto → 409

  it('rejeita 409 quando score alto mas lesson_status=incomplete (sem conclusao explicita)', async () => {
    hasRoleMock.mockReturnValue(true);

    const scormSemConclusao = {
      lesson_status: 'incomplete',
      completion_status: null,
      success_status: null,
      score_raw: 95,
      score_max: 100,
      score_scaled: 0.95,
      session_time: '00:45:00',
      total_time: '01:20:00',
      suspend_data: JSON.stringify({ pos: 379, total: 380 }),
      cmi_json: null,
    };

    const { db, writes } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
      ['FROM lms_progresso_scorm', { first: () => scormSemConclusao }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO' });

    expect(res.status).toBe(409);
    expect(writes).toHaveLength(0);
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('rejeita 409 quando ha candidate auditavel sem passed/completed explicito', async () => {
    hasRoleMock.mockReturnValue(true);

    const scormCandidate = {
      lesson_status: 'incomplete',
      completion_status: null,
      success_status: null,
      score_raw: 100,
      score_max: 100,
      score_scaled: 1,
      session_time: '01:00:00',
      total_time: '02:00:00',
      suspend_data: 'checkpoint-final',
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '380/380',
        'cmi.core.score.raw': '100',
      }),
    };

    const { db, writes } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
      ['FROM lms_progresso_scorm', { first: () => scormCandidate }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO', observacoes: 'checkpoint final' });

    expect(res.status).toBe(409);
    const body = await res.json() as {
      success: boolean;
      code?: string;
      data?: { completion_diagnostic?: { status?: string; explicit_completion?: boolean } };
    };
    expect(body.success).toBe(false);
    expect(body.code).toBe('SCORM_COMPLETION_REJECTED');
    expect(body.data?.completion_diagnostic).toMatchObject({
      status: 'candidate',
      explicit_completion: false,
    });
    expect(writes).toHaveLength(0);
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  // ── 4. Admin CONCLUIDO + SCORM + evidência robusta → 200 + qualificação ───

  it('aceita CONCLUIDO e gera qualificacao quando ha evidencia SCORM robusta', async () => {
    hasRoleMock.mockReturnValue(true);

    const scormConcluido = {
      lesson_status: 'passed',
      completion_status: null,
      success_status: null,
      score_raw: 85,
      score_max: 100,
      score_scaled: 0.85,
      session_time: '01:00:00',
      total_time: '02:00:00',
      suspend_data: JSON.stringify({ pos: 380, total: 380 }),
      cmi_json: JSON.stringify({ 'cmi.core.lesson_status': 'passed', 'cmi.core.lesson_location': '380/380' }),
    };

    const updatedMatricula = { ...scormMatriculaWithQual, status: 'CONCLUIDO', progresso_pct: 100 };

    const { db, writes } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
      ['FROM lms_progresso_scorm', { first: () => scormConcluido }],
      ['SET observacoes = ?', {}], // UPDATE de observações após conclusão via serviço canônico (mocado)
      ['SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?', { first: () => updatedMatricula }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO', observacoes: 'evidencia SCORM confirmada' });

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);

    // escrita aconteceu
    expect(writes.some((q) => q.includes('UPDATE'))).toBe(true);

    // qualificação gerada
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
    expect(completeLmsMatriculaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matriculaId: 200,
        qualificacaoTipoId: 7,
      }),
    );
  });

  // ── 5. Admin CONCLUIDO + conteúdo não-SCORM qualificante → evidência exigida ─

  it('rejeita CONCLUIDO para PDF qualificante sem evidência server-side', async () => {
    hasRoleMock.mockReturnValue(true);

    const pdfMatricula = {
      ...scormMatriculaWithQual,
      tipo_conteudo: 'pdf',
      scorm_mastery_score: null,
    };
    const { db } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => pdfMatricula }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO' });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: 'CONTENT_EVIDENCE_REQUIRED',
      data: { matricula_id: 200, qualificacao_gerada: null },
    });
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  // ── 6. Manager pode alterar status não-CONCLUIDO sem gate ─────────────────

  it('manager pode alterar status para EM_ANDAMENTO sem gate de evidencia', async () => {
    hasRoleMock.mockReturnValue(false); // manager

    const updatedMatricula = { ...scormMatriculaWithQual, status: 'EM_ANDAMENTO' };

    const { db } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
      ['data_conclusao = COALESCE', {}],
      ['SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?', { first: () => updatedMatricula }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'EM_ANDAMENTO' });

    expect(res.status).toBe(200);
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  // ── 7. Manager CONCLUIDO sem qualificação vinculada → gate admin não dispara

  it('manager pode CONCLUIDO quando curso nao tem qualificacao vinculada (gate admin nao dispara)', async () => {
    hasRoleMock.mockReturnValue(false); // manager
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_not_required',
      qualificacaoHistoricoId: null,
      matriculaId: 200,
    });

    const semQual = {
      ...scormMatriculaWithQual,
      qualificacao_tipo_id: null,
      gerar_qualificacao_ao_concluir: 0,
    };
    const updatedSemQual = { ...semQual, status: 'CONCLUIDO' };

    const { db } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => semQual }],
      // gate SCORM ainda dispara para cursos SCORM
      ['FROM lms_progresso_scorm', {
        first: () => ({
          lesson_status: 'passed', completion_status: null, success_status: null,
          score_raw: 90, score_max: 100, score_scaled: 0.9,
          session_time: '01:00:00', total_time: '01:30:00',
          suspend_data: null, cmi_json: null,
        }),
      }],
      ['SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?', { first: () => updatedSemQual }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CONCLUIDO' });

    expect(res.status).toBe(200);
    // sem qualificacao_tipo_id → serviço canônico é chamado, mas com
    // gerarQualificacaoAoConcluir:false, então não minta qualificação.
    expect(completeLmsMatriculaMock).toHaveBeenCalledWith(
      expect.objectContaining({ gerarQualificacaoAoConcluir: false }),
    );
  });

  // ── 8. Status CANCELADO não dispara nenhum gate ────────────────────────────

  it('CANCELADO nao dispara gate de evidencia nem gera qualificacao', async () => {
    hasRoleMock.mockReturnValue(false); // manager

    const cancelado = { ...scormMatriculaWithQual, status: 'CANCELADO' };

    const { db } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => scormMatriculaWithQual }],
      ['data_conclusao = COALESCE', {}],
      ['SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?', { first: () => cancelado }],
    ]);

    const res = await patchStatus(makeApp(), db, 200, { status: 'CANCELADO' });

    expect(res.status).toBe(200);
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });
});
