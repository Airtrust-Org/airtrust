import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { checkPermission, getEmpresaId } from '../middleware/tenant';
import type { Env, Variables } from '../types';
import {
  EdbShadowPreviewError,
  loadEdbShadowPreview,
} from '../services/edb/control-flight-shadow-preview';
import { loadEdbShadowPreliminaryAssessment } from '../services/edb/control-flight-shadow-assessment';
import {
  createEdbShadowReviewEvidence,
  edbShadowReviewInputSchema,
  EdbShadowReviewEvidenceError,
} from '../services/edb/shadow-review-evidence';
import edbShadowOperationalRoutes from './edb-shadow-operational';

const edbShadowPreview = new Hono<{ Bindings: Env; Variables: Variables }>();

function requireEdbShadowPreviewAccess(): MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> {
  return async (c, next) => {
    if (!checkPermission(c, 'manager')) {
      throw new ApiError('Permissao insuficiente', 403, 'EDB_SHADOW_PREVIEW_RBAC_FORBIDDEN');
    }
    await next();
  };
}

function parseFlightId(value: string): number {
  const flightId = Number(value);
  if (!Number.isInteger(flightId) || flightId <= 0) {
    throw new ApiError('Voo invalido', 400, 'EDB_SHADOW_PREVIEW_INVALID_FLIGHT_ID');
  }
  return flightId;
}

function mapPreviewError(error: unknown, fallbackCode: string): never {
  if (error instanceof EdbShadowPreviewError) {
    const message =
      error.code === 'FLIGHT_NOT_FOUND'
        ? 'Voo nao encontrado'
        : 'Preview eDB indisponivel por inconsistencia de escopo';
    throw new ApiError(message, error.status, `EDB_SHADOW_PREVIEW_${error.code}`);
  }
  throw new ApiError('Preview eDB indisponivel', 500, fallbackCode);
}

edbShadowPreview.get(
  '/shadow-preview/:flightId',
  auth(),
  requireEdbShadowPreviewAccess(),
  async (c) => {
    const tenantId = getEmpresaId(c);
    const flightId = parseFlightId(c.req.param('flightId'));

    try {
      const preview = await loadEdbShadowPreview(c.env.DB, tenantId, flightId);
      return c.json({
        success: true,
        data: {
          status: preview.draft.status,
          classification: 'NON_OFFICIAL_SHADOW_PREVIEW',
          notices: {
            officialLogbook: false,
            replacesPaper: false,
            containsSignature: false,
            persistsRegulatedRecord: false,
          },
          draft: preview.draft,
          findings: preview.findings,
          fieldSources: preview.fieldSources,
        },
      });
    } catch (error) {
      return mapPreviewError(error, 'EDB_SHADOW_PREVIEW_FAILED');
    }
  },
);

edbShadowPreview.get(
  '/shadow-assessment/:flightId',
  auth(),
  requireEdbShadowPreviewAccess(),
  async (c) => {
    const tenantId = getEmpresaId(c);
    const flightId = parseFlightId(c.req.param('flightId'));

    try {
      const assessment = await loadEdbShadowPreliminaryAssessment(c.env.DB, tenantId, flightId);
      return c.json({ success: true, data: assessment });
    } catch (error) {
      return mapPreviewError(error, 'EDB_SHADOW_ASSESSMENT_FAILED');
    }
  },
);

edbShadowPreview.post(
  '/shadow-review/:flightId/evidence',
  auth(),
  requireEdbShadowPreviewAccess(),
  async (c) => {
    const tenantId = getEmpresaId(c);
    const userId = c.get('userId');
    const flightId = parseFlightId(c.req.param('flightId'));
    const parsed = edbShadowReviewInputSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) {
      throw new ApiError('Revisao shadow invalida', 400, 'EDB_SHADOW_REVIEW_INVALID_INPUT');
    }

    try {
      const evidence = await createEdbShadowReviewEvidence({
        db: c.env.DB,
        tenantId,
        userId,
        flightId,
        review: parsed.data,
      });
      return c.json({ success: true, data: evidence });
    } catch (error) {
      if (error instanceof EdbShadowReviewEvidenceError) {
        throw new ApiError(
          'Revisao shadow bloqueada por criterio de seguranca',
          error.status,
          `EDB_SHADOW_REVIEW_${error.code}`,
        );
      }
      return mapPreviewError(error, 'EDB_SHADOW_REVIEW_EVIDENCE_FAILED');
    }
  },
);

edbShadowPreview.route('/', edbShadowOperationalRoutes);

export default edbShadowPreview;
