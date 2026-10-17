import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';

const { readSession, matchSession, detectEdition } = vi.hoisted(() => ({
  readSession: vi.fn(),
  matchSession: vi.fn(),
  detectEdition: vi.fn(),
}));
vi.mock('../../lib/lms/lms-asset-session', () => ({
  readCourseAssetSessionPayload: readSession,
  assetSessionMatchesEnrollment: matchSession,
}));
vi.mock('../../services/lms-edition-mismatch', () => ({
  detectLmsEditionMismatch: detectEdition,
}));
vi.mock('../../middleware/rbac', () => ({ hasRole: () => true }));

import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';

const courseEvidence = {
  id: 911, empresa_id: 6, funcionario_id: 77, curso_id: 57,
  status: 'EM_ANDAMENTO', progresso_pct: 99, data_inicio: null,
  qualificacao_historico_id: null,
  tipo_conteudo: 'scorm', ativo: 1, publicado: 1,
  scorm_mastery_score: 80, scorm_assessment_policy: 'SCORED',
  scorm_package_r2_prefix: 'private-tenant6/course57',
  scorm_launch_file: 'index.html', gerar_qualificacao_ao_concluir: 1,
  lesson_status: 'incomplete', completion_status: 'incomplete',
  success_status: null, score_raw: null, score_min: null,
  score_max: null, score_scaled: null, session_time: null,
  total_time: null, suspend_data: null, cmi_json: null, xapi_count: 0,
};

async function submitCommit(
  payload: Record<string, unknown>,
  savedEvidence: Record<string, unknown> = {},
) {
  let saved = false;
  const db = {
    prepare: vi.fn((sql: string) => {
      if (!sql.includes('FROM lms_matriculas m')) throw new Error('Unexpected SQL');
      return { bind: () => ({ first: async () => ({ ...courseEvidence, ...savedEvidence }) }) };
    }),
  };
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('empresaId', 6);
    c.set('userId', 55);
    const denied = await enforceLmsCompletionIntegrity(c);
    if (denied) return denied;
    return next();
  });
  app.post('/api/lms/matriculas/scorm/commit', c => {
    saved = true;
    return c.json({ success: true, data: { saved: true } });
  });
  const response = await app.fetch(new Request(
    'http://localhost/api/lms/matriculas/scorm/commit',
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matricula_id: 911, ...payload }) },
  ), { DB: db } as unknown as Env, {} as ExecutionContext);
  return { response, saved };
}

describe('Player 2.0 structural split: evidence persistence versus approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detectEdition.mockResolvedValue(null);
    readSession.mockResolvedValue({ matriculaId: 911, cursoId: 57, empresaId: 6 });
    matchSession.mockReturnValue(true);
  });

  it('does not discard ordinary SCO status reporting because final-page evidence is incomplete', async () => {
    const { response, saved } = await submitCommit({
      lesson_status: 'passed',
      score_raw: 0, score_max: 100,
      commit_event: 'SCORM_COMPLETION_CANDIDATE',
      cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '42/42' }),
    });
    expect(response.status).toBe(200);
    expect(saved).toBe(true);
  });

  it('refuses contradictory SCORM statuses even when score passes and 42/42 is recorded', async () => {
    const { response, saved } = await submitCommit({
      lesson_status: 'passed', score_raw: 100, score_max: 100,
      commit_event: 'SCORM_USER_FINALIZE',
      completion_candidate: true,
      cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '42/42' }),
    });
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
    expect(await response.json()).toMatchObject({ code: 'STATE_INCONSISTENT' });
  });

  it('never accepts forged passive completion status without a tenant-bound asset session', async () => {
    matchSession.mockReturnValue(false);
    const { response, saved } = await submitCommit({
      lesson_status: 'passed', commit_event: 'SCORM_COMPLETION_CANDIDATE',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ASSET_SESSION_INVALID' });
    expect(saved).toBe(false);
  });

  it('reconciles authenticated saved slides [1,2] with final [3] before the middleware verdict', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '2/3',
      'airtrust.total_slides': 3,
      'airtrust.viewed_slides': [1, 2],
    });
    const { response, saved } = await submitCommit({
      lesson_status: 'passed', completion_status: 'completed', success_status: 'passed',
      score_raw: 90, score_min: 0, score_max: 100,
      commit_event: 'SCORM_USER_FINALIZE', completion_candidate: true,
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '3/3',
        'airtrust.total_slides': 3, 'airtrust.viewed_slides': [3],
      }),
    }, { cmi_json: previous, score_raw: 30, score_max: 100 });
    expect(response.status).toBe(200);
    expect(saved).toBe(true);
  });

  it('permits scored learning evidence from the assessment without inventing visits', async () => {
    const { response, saved } = await submitCommit({
      lesson_status: 'passed', completion_status: 'completed', success_status: 'passed',
      score_raw: 90, score_max: 100,
      commit_event: 'SCORM_USER_FINALIZE', completion_candidate: true,
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '3/3',
        'airtrust.total_slides': 3, 'airtrust.viewed_slides': [3],
      }),
    });
    expect(response.status).toBe(200);
    expect(saved).toBe(true);
  });

  it('formative content without a scored assessment still rejects an isolated final slide', async () => {
    const { response, saved } = await submitCommit({
      lesson_status: 'completed', completion_status: 'completed',
      commit_event: 'SCORM_USER_FINALIZE', completion_candidate: true,
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '3/3',
        'airtrust.total_slides': 3, 'airtrust.viewed_slides': [3],
      }),
    }, { scorm_assessment_policy: 'FORMATIVE' });
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
    expect(await response.json()).toMatchObject({ code: 'PROGRESS_EVIDENCE_MISSING' });
  });

  it('never merges stored coverage into a changed slide-count/edition marker', async () => {
    const { response, saved } = await submitCommit({
      lesson_status: 'passed', completion_status: 'completed', success_status: 'passed',
      score_raw: 90, score_max: 100,
      commit_event: 'SCORM_USER_FINALIZE', completion_candidate: true,
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '4/4',
        'airtrust.total_slides': 4, 'airtrust.viewed_slides': [4],
      }),
    }, { cmi_json: JSON.stringify({
      'cmi.core.lesson_location': '3/3',
      'airtrust.total_slides': 3, 'airtrust.viewed_slides': [1, 2, 3],
    }) });
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
  });

  it('permits verified terminal evidence to reach the canonical transaction, without minting it here', async () => {
    const { response, saved } = await submitCommit({
      lesson_status: 'passed', completion_status: 'completed',
      success_status: 'passed', score_raw: 100, score_max: 100,
      commit_event: 'SCORM_USER_FINALIZE', completion_candidate: true,
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '42/42',
        'airtrust.total_slides': 42,
        'airtrust.viewed_slides': Array.from({length:42}, (_,i)=>i+1),
      }),
    });
    expect(response.status).toBe(200);
    expect(saved).toBe(true);
  });
});
