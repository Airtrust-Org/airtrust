/**
 * #1311 / RELATORIO_EAD 3.2-3.4 — server side of the reopen downgrade.
 * Persisted lms_progresso_scorm (columns AND cmi_json served on the next
 * launch) must stay passed/100 when a reopened package, a late unload beacon
 * or a terminal-but-weaker commit (completed/0) arrives in the same cycle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { completeLmsMatriculaMock } = vi.hoisted(() => ({ completeLmsMatriculaMock: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42); c.set('userRole', 'admin'); await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  hasRole: () => true,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../utils/tenant-resolution', () => ({ getEmpresaIdSafe: () => 1 }));
vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: vi.fn(), hasActiveMatriculaCycle: () => false,
  syncMatriculaCycleFromMatricula: vi.fn(),
}));
vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));
vi.mock('../../utils/db', () => ({ logAudit: vi.fn() }));
vi.mock('../../lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('../../services/lms-completion', async () => ({
  ...(await vi.importActual<typeof import('../../services/lms-completion')>('../../services/lms-completion')),
  completeLmsMatricula: completeLmsMatriculaMock,
}));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';

const TERMINAL_CMI = {
  'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '100', 'cmi.core.score.max': '100',
  'cmi.core.lesson_location': '53/53', 'cmi.location': '53/53',
  'cmi.suspend_data': 'doutrinamento-final',
  'airtrust.total_slides': 53,
  'airtrust.viewed_slides': Array.from({ length: 53 }, (_, i) => i + 1),
};
const TERMINAL_ROW = {
  lesson_status: 'passed', completion_status: null, success_status: null,
  score_raw: 100, score_max: 100, score_min: 0, score_scaled: null,
  session_time: '0000:40:00.00', total_time: '0000:40:00.00',
  suspend_data: 'doutrinamento-final', launch_data: null, cmi_json: JSON.stringify(TERMINAL_CMI),
};

function setup(status: 'EM_ANDAMENTO' | 'CONCLUIDO') {
  let row: Record<string, unknown> = { ...TERMINAL_ROW };
  const upserts: unknown[][] = [];
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM lms_matriculas m')) {
            return {
              id: 15, empresa_id: 1, funcionario_id: 99, status, progresso_pct: status === 'CONCLUIDO' ? 100 : 99,
              tentativas: 1, qualificacao_historico_id: null, curso_id: 15,
              scorm_mastery_score: 70, scorm_assessment_policy: 'SCORED',
              gerar_qualificacao_ao_concluir: 0, qualificacao_tipo_id: null,
              curso_titulo: 'Doutrinamento Básico', qualificacao_codigo: null, qualificacao_nome: null,
              qualificacao_categoria: null, qualificacao_validade: null,
              qualificacao_vencimento_fim_mes: null,
            };
          }
          if (query.includes('FROM lms_progresso_scorm')) return row;
          if (query.includes('lms_matricula_ciclos')) return { id: 202 };
          return null;
        },
        run: async () => {
          if (query.includes('INSERT INTO lms_progresso_scorm')) {
            upserts.push(args);
            // Emulate the ON CONFLICT upsert for the persisted read-back.
            row = { ...row, lesson_status: args[2], completion_status: args[3], success_status: args[4],
              score_raw: args[5] ?? row.score_raw, score_max: args[6] ?? row.score_max,
              suspend_data: args[11] ?? row.suspend_data, cmi_json: args[13] ?? row.cmi_json };
          }
          return { meta: { changes: 1, last_row_id: 0 } };
        },
        all: async () => ({ results: [] }),
      }),
    })),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);
  const commit = (body: Record<string, unknown>) => app.fetch(new Request('http://localhost/scorm/commit', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ matricula_id: 15, ciclo_id: 202, ...body }),
  }), { DB: db } as Env, {} as ExecutionContext);
  return { commit, upserts, persisted: () => row };
}

function reopenedBody(event: string) {
  const cmi = {
    'cmi.core.lesson_status': 'incomplete', 'cmi.core.score.raw': '0',
    'cmi.core.lesson_location': '52/53', 'cmi.suspend_data': 'restart',
    'airtrust.total_slides': 53, 'airtrust.viewed_slides': [1, 52],
  };
  return {
    commit_event: event, lesson_status: 'incomplete', score_raw: 0, score_max: 100,
    suspend_data: 'restart', cmi_json: JSON.stringify(cmi),
  };
}

function expectStillPassed100(persisted: Record<string, unknown>) {
  expect(persisted.lesson_status).toBe('passed');
  expect(persisted.score_raw).toBe(100);
  expect(persisted.suspend_data).toBe('doutrinamento-final');
  const cmi = JSON.parse(String(persisted.cmi_json));
  expect(cmi['cmi.core.lesson_status']).toBe('passed');
  expect(cmi['cmi.core.score.raw']).toBe('100');
  expect(cmi['cmi.core.lesson_location']).toBe('53/53');
  expect(cmi['airtrust.viewed_slides']).toHaveLength(53);
}

describe('#1311 SCORM commit never downgrades a persisted terminal in the same cycle', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('non-CONCLUIDO (99/100 sem conclusão): reopened incomplete/0 keeps passed/100 in columns and cmi_json', async () => {
    const t = setup('EM_ANDAMENTO');
    const response = await t.commit(reopenedBody('SCORM_COMMIT'));
    expect(response.status).toBe(200);
    expect(t.upserts).toHaveLength(1);
    expectStillPassed100(t.persisted());
    expect(JSON.parse(String(t.persisted().cmi_json))['airtrust.runtime_regression']).toEqual({
      'cmi.core.lesson_status': 'incomplete', 'cmi.core.score.raw': '0',
    });
  });

  it('late unload beacon / LMSFinish replay after the terminal commit is absorbed idempotently', async () => {
    const t = setup('EM_ANDAMENTO');
    for (const event of ['SCORM_BEFORE_UNLOAD_COMMIT', 'SCORM_VISIBILITY_COMMIT', 'SCORM_FINISH']) {
      const response = await t.commit(reopenedBody(event));
      expect(response.status).toBe(200);
      expectStillPassed100(t.persisted());
    }
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('CONCLUIDO: terminal-but-weaker completed/0 cannot replace passed/100', async () => {
    const t = setup('CONCLUIDO');
    const response = await t.commit({
      commit_event: 'SCORM_FINISH', lesson_status: 'completed', score_raw: 0, score_max: 100,
      suspend_data: 'doutrinamento-final',
      cmi_json: JSON.stringify({ ...TERMINAL_CMI, 'cmi.core.lesson_status': 'completed', 'cmi.core.score.raw': '0' }),
    });
    expect(response.status).toBe(200);
    expectStillPassed100(t.persisted());
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('CONCLUIDO: reopened incomplete/0 is ignored without any write', async () => {
    const t = setup('CONCLUIDO');
    const response = await t.commit(reopenedBody('SCORM_BEFORE_UNLOAD_COMMIT'));
    await expect(response.json()).resolves.toMatchObject({ data: { ignoredDowngrade: true } });
    expect(t.upserts).toHaveLength(0);
    expectStillPassed100(t.persisted());
  });
});
