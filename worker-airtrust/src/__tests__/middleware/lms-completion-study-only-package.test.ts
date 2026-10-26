import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';

const { readSession, matchSession, detectEdition } = vi.hoisted(() => ({
  readSession: vi.fn(), matchSession: vi.fn(), detectEdition: vi.fn(),
}));
vi.mock('../../lib/lms/lms-asset-session', () => ({
  readCourseAssetSessionPayload: readSession,
  assetSessionMatchesEnrollment: matchSession,
}));
vi.mock('../../services/lms-edition-mismatch', () => ({ detectLmsEditionMismatch: detectEdition }));
vi.mock('../../middleware/rbac', () => ({ hasRole: () => true }));

import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';

// Curso cadastrado como SCORED com nota mínima (configuração herdada), mas cujo
// pacote ativo declara assessment.mode=NONE: não existe prova no treinamento.
const IDS = ['a', 'b', 'c'];
const PREFIX = 'lms/scorm/6/57/v3/';
const course = (over: Record<string, unknown> = {}) => ({
  id: 911, empresa_id: 6, funcionario_id: 77, curso_id: 57,
  status: 'EM_ANDAMENTO', progresso_pct: 99, data_inicio: null, qualificacao_historico_id: null,
  tipo_conteudo: 'scorm', ativo: 1, publicado: 1,
  scorm_mastery_score: 80, scorm_assessment_policy: 'SCORED',
  scorm_package_r2_prefix: PREFIX, scorm_launch_file: 'index.html', gerar_qualificacao_ao_concluir: 1,
  lesson_status: 'incomplete', completion_status: 'incomplete', success_status: null,
  score_raw: null, score_min: null, score_max: null, score_scaled: null,
  session_time: null, total_time: null, suspend_data: null, cmi_json: null, xapi_count: 0, ...over,
});
const bucketWith = (manifest: unknown) => ({
  get: async () => (manifest == null ? null : { size: 400, text: async () => JSON.stringify(manifest) }),
}) as unknown as R2Bucket;
const noExam = (mode = 'NONE') => ({ packageVersion: 'V3', content: { requiredSlides: IDS }, assessment: { mode } });
const ledger = (viewed: number[]) => JSON.stringify({
  'cmi.core.lesson_location': '3/3', 'airtrust.total_slides': 3, 'airtrust.viewed_slides': viewed,
});

async function finalize(row: Record<string, unknown>, bucket: R2Bucket | undefined, payload: Record<string, unknown>) {
  const db = { prepare: vi.fn(() => ({ bind: () => ({ first: async () => row }) })) };
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('empresaId', 6); c.set('userId', 55);
    const denied = await enforceLmsCompletionIntegrity(c);
    return denied ?? next();
  });
  let saved = false;
  app.post('/api/lms/matriculas/scorm/commit', (c) => { saved = true; return c.json({ success: true }); });
  const response = await app.fetch(new Request('http://localhost/api/lms/matriculas/scorm/commit', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ matricula_id: 911, ...payload }),
  }), { DB: db, BUCKET: bucket } as unknown as Env, {} as ExecutionContext);
  return { response, saved };
}
const userFinalize = (viewed: number[], extra: Record<string, unknown> = {}) => ({
  commit_event: 'SCORM_USER_FINALIZE', completion_candidate: true,
  lesson_status: 'completed', cmi_json: ledger(viewed), ...extra,
});

describe('pacote sem prova: o curso é para concluir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detectEdition.mockResolvedValue(null);
    readSession.mockResolvedValue({ matriculaId: 911, cursoId: 57, empresaId: 6 });
    matchSession.mockReturnValue(true);
  });

  it.each(['NONE', 'EXTERNAL'])('conclui com estudo comprovado mesmo com curso SCORED/nota mínima herdados (%s)', async (mode) => {
    const { response, saved } = await finalize(course(), bucketWith(noExam(mode)), userFinalize([1, 2, 3]));
    expect(response.status).toBe(200);
    expect(saved).toBe(true);
  });

  it('sem comprovar todas as telas do manifest não conclui', async () => {
    const { response, saved } = await finalize(course(), bucketWith(noExam()), userFinalize([1, 2]));
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
  });

  it('o mesmo curso SCORED com pacote que traz prova continua exigindo nota (comportamento legado intacto)', async () => {
    const scored = { packageVersion: 'V3', content: { requiredSlides: IDS }, assessment: { mode: 'SCORM' } };
    const { response, saved } = await finalize(course(), bucketWith(scored), userFinalize([1, 2, 3]));
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
  });

  it('sem manifest legível (R2 vazio) o curso SCORED continua fail-closed', async () => {
    const { response, saved } = await finalize(course(), bucketWith(null), userFinalize([1, 2, 3]));
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
  });

  it('reprovação explícita registrada pelo pacote ainda bloqueia', async () => {
    const { response, saved } = await finalize(course(), bucketWith(noExam()),
      userFinalize([1, 2, 3], { lesson_status: 'failed' }));
    expect(response.status).toBe(409);
    expect(saved).toBe(false);
  });
});
