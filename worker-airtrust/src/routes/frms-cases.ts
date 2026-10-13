/** Casos FRMS: ciência, tratamento e resolução em etapas. */
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { requirePermission } from '../middleware/rbac';
import {
  marcarAlertaVisualizado,
  registrarTratamentoAlerta,
  marcarAlertaResolvido,
} from '../lib/frms/db-service';
import {
  buildFrmsCaseResolutionNotes,
  buildFrmsCaseTreatmentNotes,
  readFrmsPendingTreatment,
} from '../lib/frms/case-resolution';
import { safe, getEmpresaIdSafe, assertAlertaEmpresa } from './frms-shared';

const frmsCaseRoutes = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();

/**
 * PUT /api/frms/alertas/:id/visualizar
 */
frmsCaseRoutes.put(
  '/alertas/:id/visualizar',
  requirePermission('frms', 'editar', 'admin', 'manager'),
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const denied = await assertAlertaEmpresa(c, id);
    if (denied) return denied;

    const userId = String(c.get('userId') || 'system');
    await marcarAlertaVisualizado(c.env.DB, id, userId);
    return c.json({ success: true });
  }),
);

/**
 * PUT /api/frms/alertas/:id/tratamento
 * Registra responsável, prazo, ação e justificativa sem encerrar o alerta.
 */
frmsCaseRoutes.put(
  '/alertas/:id/tratamento',
  requirePermission('frms', 'editar', 'admin', 'manager'),
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const denied = await assertAlertaEmpresa(c, id);
    if (denied) return denied;
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) return c.json({ success: false, code: 'FRMS_TENANT_CONTEXT_REQUIRED' }, 403);

    const userId = String(c.get('userId') || 'system');
    const notes = buildFrmsCaseTreatmentNotes(await c.req.json().catch(() => null), userId);
    if (!notes) {
      return c.json({
        success: false,
        error: 'O tratamento exige responsável, prazo, medida e justificativa.',
        code: 'FRMS_CASE_TREATMENT_INCOMPLETE',
      }, 400);
    }

    const saved = await registrarTratamentoAlerta(c.env.DB, id, userId, notes, empresaId);
    if (!saved) return c.json({
      success: false,
      error: 'Caso inexistente, já encerrado ou fora do escopo da empresa.',
      code: 'FRMS_CASE_NOT_OPEN',
    }, 409);
    return c.json({ success: true, status: 'EM_TRATAMENTO' });
  }),
);

/**
 * PUT /api/frms/alertas/:id/resolver
 * Só encerra após registrar tratamento e documentar verificação de eficácia.
 */
frmsCaseRoutes.put(
  '/alertas/:id/resolver',
  requirePermission('frms', 'editar', 'admin', 'manager'),
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const denied = await assertAlertaEmpresa(c, id);
    if (denied) return denied;
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) return c.json({ success: false, code: 'FRMS_TENANT_CONTEXT_REQUIRED' }, 403);

    const existing = await c.env.DB.prepare(`
      SELECT a.notas_resolucao FROM frms_alerta a
      JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
      WHERE a.id = ? AND a.deleted_at IS NULL
        AND COALESCE(a.resolvido, 0) = 0
        AND f.empresa_id = ? AND f.deleted_at IS NULL
      LIMIT 1
    `).bind(id, empresaId).first<{ notas_resolucao: string | null }>();
    const treatment = readFrmsPendingTreatment(existing?.notas_resolucao);
    if (!treatment) {
      return c.json({
        success: false,
        error: 'Registre responsável, prazo e medida de tratamento antes de encerrar o caso.',
        code: 'FRMS_CASE_TREATMENT_REQUIRED',
      }, 409);
    }

    const payload: unknown = await c.req.json().catch(() => null);
    const efficacy = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).avaliacao_eficacia : null;
    const userId = String(c.get('userId') || 'system');
    // Never silently rewrite the previously audited treatment during closure.
    const notes = buildFrmsCaseResolutionNotes({
      ...treatment, avaliacao_eficacia: efficacy,
    }, userId);
    if (!notes) {
      return c.json({
        success: false,
        error: 'O encerramento exige avaliação documentada da eficácia da mitigação.',
        code: 'FRMS_CASE_EFFECTIVENESS_REQUIRED',
      }, 400);
    }
    const closed = await marcarAlertaResolvido(c.env.DB, id, userId, notes, empresaId);
    if (!closed) return c.json({
      success: false,
      error: 'Caso já encerrado ou indisponível no escopo da empresa.',
      code: 'FRMS_CASE_NOT_OPEN',
    }, 409);
    return c.json({ success: true, status: 'RESOLVIDO' });
  }),
);


export default frmsCaseRoutes;
