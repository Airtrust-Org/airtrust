/** Learner-owned PPTX slide observations; authorization is checked per request. */
import { Hono, type Context } from 'hono';
import { getEmpresaIdSafe } from '../utils/tenant-resolution';
import { resolveLmsFuncionarioId } from '../services/lms-learner-identity';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  MIN_SLIDE_INTERVAL_MS, getPptxEvidenceState, readCurrentPptxEnrollment, isActiveEnrollment,
} from '../services/lms-pptx-evidence';

export function registerPptxEvidenceRoutes(app: Hono<{ Bindings: Env }>): void {
  async function ownedState(c: Context<{ Bindings: Env }>) {
    const empresaId = getEmpresaIdSafe(c);
    const matriculaId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(matriculaId) || matriculaId < 1) {
      throw new ApiError('Matrícula inválida', 400);
    }
    const enrollment = await readCurrentPptxEnrollment(c.env.DB, empresaId, matriculaId);
    if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);
    // Even a manager/admin role cannot impersonate the enrolled learner to
    // record slide consumption or claim server evidence.
    const caller = await resolveLmsFuncionarioId(
      c.env.DB, c.get('userId' as never), empresaId,
    );
    if (!caller || Number(caller) !== Number(enrollment.funcionario_id)) {
      throw new ApiError('Acesso restrito ao aluno matriculado', 403);
    }
    return getPptxEvidenceState(c.env.DB, c.env.BUCKET, empresaId, matriculaId);
  }

  app.get('/:id/pptx-evidence', async (c) => {
    const state = await ownedState(c);
    return c.json({ success: true, data: state.coverage });
  });

  app.post('/:id/pptx-evidence', async (c) => {
    const state = await ownedState(c);
    if (!isActiveEnrollment(state.enrollment.status)) {
      throw new ApiError('Matrícula não está ativa para consumo', 409, 'PPTX_ENROLLMENT_INACTIVE');
    }
    const input = await c.req.json().catch(() => null) as { slide_index?: unknown; asset_etag?: unknown } | null;
    // An old browser tab must never qualify a replacement PPTX, even when
    // its slide count is identical. Only observations from the downloaded R2
    // object version are eligible for persistence.
    if (typeof input?.asset_etag !== 'string' || input.asset_etag !== state.coverage.asset_etag) {
      throw new ApiError('A apresentação foi atualizada. Recarregue o arquivo.', 409, 'PPTX_ASSET_VERSION_MISMATCH');
    }
    const slideIndex = input?.slide_index;
    if (!Number.isSafeInteger(slideIndex) || Number(slideIndex) < 0 ||
        Number(slideIndex) >= state.coverage.total_slides) {
      throw new ApiError('Índice de slide inválido', 400, 'PPTX_SLIDE_INDEX_INVALID');
    }
    const index = Number(slideIndex);
    const nextIndex = state.coverage.next_slide;
    if (index < nextIndex && state.coverage.visited_indexes.includes(index)) {
      // Deterministic and idempotent replay: never modify prior evidence.
      return c.json({ success: true, data: state.coverage, replay: true });
    }
    if (index !== nextIndex) {
      throw new ApiError('Os slides devem ser registrados em sequência', 409, 'PPTX_SLIDE_SEQUENCE_REQUIRED');
    }
    if (state.lastRecordedAt && Date.now() - Date.parse(state.lastRecordedAt) < MIN_SLIDE_INTERVAL_MS) {
      throw new ApiError('Tempo mínimo de visualização não atendido', 409, 'PPTX_SLIDE_INTERVAL_REQUIRED');
    }
    const empresaId = getEmpresaIdSafe(c);
    const timestamp = new Date().toISOString();
    const applied = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO lms_pptx_slide_evidences
       (empresa_id,matricula_id,curso_id,funcionario_id,ciclo_id,content_sha256,
        slide_index,total_slides,server_received_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      empresaId, state.enrollment.matricula_id, state.enrollment.curso_id,
      state.enrollment.funcionario_id, state.enrollment.ciclo_id,
      state.coverage.content_sha256, index, state.coverage.total_slides, timestamp,
    ).run();
    if (!applied.success) throw new ApiError('Falha ao persistir evidência PPTX', 503, 'PPTX_EVIDENCE_PERSISTENCE_FAILED');
    // Read back authoritative state after unique/idempotent insertion.
    const current = await getPptxEvidenceState(
      c.env.DB, c.env.BUCKET, empresaId, state.enrollment.matricula_id,
    );
    return c.json({ success: true, data: current.coverage });
  });
}
