import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env, Variables } from '../../types';

const { readSession, matchSession } = vi.hoisted(() => ({
  readSession: vi.fn(),
  matchSession: vi.fn(),
}));

vi.mock('../../lib/lms/lms-asset-session', () => ({
  readCourseAssetSessionPayload: readSession,
  assetSessionMatchesEnrollment: matchSession,
}));
vi.mock('../../middleware/rbac', () => ({ hasRole: () => true }));

import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';

type Evidence = Record<string, unknown>;

function cmi(total: number, withCoverage = true) {
  return JSON.stringify({
    'cmi.location': `${total}/${total}`,
    'cmi.core.lesson_location': `${total}/${total}`,
    ...(withCoverage ? {
      'airtrust.total_slides': total,
      'airtrust.viewed_slides': Array.from({ length: total }, (_, i) => i + 1),
    } : {}),
  });
}

function validEvidence(): Evidence {
  return {
    id: 863,
    empresa_id: 1,
    funcionario_id: 77,
    curso_id: 41,
    status: 'EM_ANDAMENTO',
    progresso_pct: 100,
    qualificacao_historico_id: null,
    tipo_conteudo: 'scorm',
    ativo: 1,
    publicado: 1,
    scorm_mastery_score: 80,
    scorm_assessment_policy: 'SCORED',
    scorm_package_r2_prefix: 'tenant-1/course-41/package-active/',
    scorm_launch_file: 'index.html',
    gerar_qualificacao_ao_concluir: 1,
    lesson_status: 'passed',
    completion_status: 'completed',
    success_status: 'passed',
    score_raw: 100,
    score_min: 0,
    score_max: 100,
    score_scaled: null,
    session_time: '00:20:00',
    total_time: '00:20:00',
    suspend_data: null,
    cmi_json: cmi(37),
    xapi_count: 0,
  };
}

async function submitFinalize(overrides: Evidence = {}) {
  const evidence = { ...validEvidence(), ...overrides };
  const selectArgs: unknown[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      if (!sql.includes('FROM lms_matriculas m')) throw new Error('Unexpected SQL');
      return {
        bind: (...args: unknown[]) => {
          selectArgs.push(args);
          return { first: async () => evidence };
        },
      };
    }),
  } as unknown as D1Database;

  let downstreamCalled = false;
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', async (ctx, next) => {
    ctx.set('empresaId', 1);
    ctx.set('userId', 42);
    ctx.set('funcionarioId', 77);
    const block = await enforceLmsCompletionIntegrity(ctx);
    if (block) return block;
    return next();
  });
  app.post('/api/lms/matriculas/:id/finalizar', (ctx) => {
    downstreamCalled = true;
    return ctx.json({ success: true, data: { novo_status: 'CONCLUIDO' } });
  });
  const response = await app.fetch(
    new Request('http://localhost/api/lms/matriculas/863/finalizar', { method: 'POST' }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
  return { response, downstreamCalled, selectArgs };
}

describe('CFIT: confirmação de SCORM aprovado e persistido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readSession.mockResolvedValue({ matriculaId: 863, cursoId: 41, empresaId: 1 });
    matchSession.mockReturnValue(true);
  });

  it('aceita a matrícula SCORM de 37/37 com passed, 100, nota mínima e sessão válida', async () => {
    const { response, downstreamCalled, selectArgs } = await submitFinalize();
    expect(response.status).toBe(200);
    expect(downstreamCalled).toBe(true);
    expect(selectArgs).toEqual([[863, 1]]);
    expect(matchSession).toHaveBeenCalledWith(
      expect.anything(), { empresaId: 1, cursoId: 41, matriculaId: 863 },
    );
  });

  it('não reaproveita badge de progresso sem cobertura de todas as unidades', async () => {
    const { response, downstreamCalled } = await submitFinalize({ cmi_json: cmi(37, false) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PROGRESS_EVIDENCE_MISSING',
    });
    expect(downstreamCalled).toBe(false);
  });

  it('não transforma 37/37 e nota 100 em aprovação quando SCORM ainda é incomplete', async () => {
    const { response, downstreamCalled } = await submitFinalize({
      lesson_status: 'incomplete', completion_status: 'incomplete', success_status: null,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'COMPLETION_EVIDENCE_INSUFFICIENT',
    });
    expect(downstreamCalled).toBe(false);
  });

  it('rejeita explicit failure mesmo com passed gravado', async () => {
    const { response } = await submitFinalize({ success_status: 'failed' });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'EXPLICIT_FAILURE' });
  });

  it('rejeita nota inferior à mínima', async () => {
    const { response } = await submitFinalize({ score_raw: 70 });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SCORE_BELOW_MASTERY' });
  });

  it('rejeita sessão inválida sem dar acesso à conclusão', async () => {
    matchSession.mockReturnValue(false);
    const { response, downstreamCalled } = await submitFinalize();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'ASSET_SESSION_INVALID' });
    expect(downstreamCalled).toBe(false);
  });

  it('rejeita binding do pacote ausente', async () => {
    const { response } = await submitFinalize({ scorm_package_r2_prefix: null });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'PACKAGE_BINDING_INVALID' });
  });

  it('mantém CONTENT_EVIDENCE_REQUIRED para PDF qualificante com progresso 100', async () => {
    const { response, downstreamCalled } = await submitFinalize({
      tipo_conteudo: 'pdf', scorm_package_r2_prefix: null, scorm_launch_file: null,
      lesson_status: null, completion_status: null, success_status: null,
      scorm_mastery_score: null, score_raw: null, score_min: null, score_max: null,
      cmi_json: null,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'CONTENT_EVIDENCE_REQUIRED' });
    expect(downstreamCalled).toBe(false);
  });
});
