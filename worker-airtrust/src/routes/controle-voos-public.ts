import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getFlightPlanningPdfByDocumentId,
  verifyFlightPlanningPdfToken,
} from '../services/controle-voos/flight-planning-attachment';

const publicControleVoos = new Hono<{ Bindings: Env }>();

publicControleVoos.get('/planejamento-previo/:token', async (c) => {
  const claims = await verifyFlightPlanningPdfToken(c.env.JWT_SECRET, c.req.param('token'));
  if (!claims) {
    throw new ApiError('Documento indisponivel', 404, 'CONTROLE_VOOS_PLANNING_PDF_TOKEN_INVALID');
  }

  const attachment = await getFlightPlanningPdfByDocumentId(
    c.env.DB,
    claims.empresaId,
    claims.vooId,
    claims.documentId,
  );
  if (!attachment) {
    throw new ApiError('Documento indisponivel', 404, 'CONTROLE_VOOS_PLANNING_PDF_NOT_FOUND');
  }

  const object = await c.env.BUCKET.get(attachment.r2Key);
  if (!object) {
    throw new ApiError('Documento indisponivel', 404, 'CONTROLE_VOOS_PLANNING_PDF_STORAGE_NOT_FOUND');
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${attachment.fileName}"`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(object.body, { headers });
});

export default publicControleVoos;
