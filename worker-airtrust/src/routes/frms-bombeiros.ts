/**
 * Aviação dos Bombeiros (BOA/CBMMG) — API exclusiva.
 *
 * Contrato: mesmo cadastro de funcionarios / autenticação / D1 do AirTrust,
 * mas exclusivamente sob o empresa_id autorizado do novo tenant "bombeiros".
 * Nunca reaproveitar dados, revision/config ou autorização da empresa 6.
 * Nunca expor esta rota pela superfície genérica de relatórios Costa do Sol.
 */
import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { requireRole } from '../middleware/rbac';
import { getTenantContext, type TenantContext } from '../middleware/tenant';
import { getTodayIsoSaoPaulo } from '../utils/qualificacoes-alerta-config';
import {
  FRMS_FIREFIGHTER_AVIATION_PROFILE,
  resolveFrmsRegulatoryProfileEvidence,
} from '../lib/frms/parameter-governance';
import { loadEffectiveFrmsConfiguration } from '../lib/frms/db-service';
import { loadBombeirosCheckinMonthlyEvidence } from '../lib/frms/bombeiros-checkin-evidence';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import { loadFrmsReportCrewScope } from '../lib/frms/report-access';
import { listBombeirosWorkforce } from '../lib/frms/bombeiros-workforce';
import { BombeirosScenarioSchema, assessBombeirosSyntheticScenario } from '../lib/frms/bombeiros-scenario-method';
import { safe } from './frms-shared';

const frmsBombeiros = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();

/** An isolated tenant is mandatory even for platform-admin browsing. */
export function isAuthorizedBombeirosFrmsTenant(
  tenant: Pick<TenantContext, 'empresaId' | 'empresaCodigo' | 'role'> | null | undefined,
): boolean {
  return Boolean(
    tenant && Number.isSafeInteger(tenant.empresaId)
    && tenant.empresaId > 0
    // Empresa 6 = Costa do Sol em produção. Nunca reusar este ID.
    && tenant.empresaId !== 6
    && tenant.empresaCodigo === 'bombeiros'
    && tenant.role === 'admin',
  );
}

function parseMonth(month: string | undefined): string | null {
  if (!month || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  return month;
}

function precedingMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

/** Same profile guard for all BOA FRMS reads — no offshore fallback. */
async function resolveBombeirosReadiness(db: D1Database, empresaId: number) {
  const referenceAt = getTodayIsoSaoPaulo();
  const [evidence, config] = await Promise.all([
    resolveFrmsRegulatoryProfileEvidence(db, { empresaId, referenceAt }),
    loadEffectiveFrmsConfiguration(db, empresaId, referenceAt),
  ]);
  if (
    evidence.empresaId !== empresaId
    || evidence.profileCode !== FRMS_FIREFIGHTER_AVIATION_PROFILE
    || config.empresaId !== empresaId
    || config.profileCode !== FRMS_FIREFIGHTER_AVIATION_PROFILE
    || evidence.regulatoryProfileId !== config.regulatoryProfileId
  ) {
    throw new Error('BOMBEIROS_PROFILE_NOT_APPROVED');
  }
  return { config, referenceAt };
}

frmsBombeiros.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store, max-age=0');
  c.header('Vary', 'Authorization, Cookie');
  await next();
});

/**
 * GET /api/bombeiros/frms/relatorios/mensal-consolidado?mes=YYYY-MM
 *
 * Authorization is enforced at three independent layers:
 *  1. Global auth() + tenantMiddleware() resolve active tenant and membership;
 *  2. admin role and exact BOMBEIROS tenant code, explicitly never empresa 6;
 *  3. effective FIREFIGHTER_AVIATION profile + tenant-and-sector-scoped DB query.
 *
 * No individual employee record, KSS/PVT, name or raw clinical data is returned.
 */
frmsBombeiros.get('/relatorios/mensal-consolidado', requireRole('admin'), safe(async (c) => {
  const tenant = getTenantContext(c);
  if (!isAuthorizedBombeirosFrmsTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_TENANT_REQUIRED' }, 403);
  }
  const empresaId = tenant.empresaId;
  const mes = parseMonth(c.req.query('mes'));
  if (!mes) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_MONTH' }, 400);
  }

  // Independent governance is enforced BEFORE touching canonical employees.
  let policy: Awaited<ReturnType<typeof loadEffectiveFrmsConfiguration>>;
  let referenceAt: string;
  try {
    ({ config: policy, referenceAt } = await resolveBombeirosReadiness(c.env.DB, empresaId));
  } catch {
    return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503);
  }

  const access = await getEmployeeSectorAccess(c, empresaId);
  const { ids } = await loadFrmsReportCrewScope(c.env.DB, empresaId, access);
  if (ids.size < 5) {
    return c.json({ success: false, code: 'BOMBEIROS_SMALL_COHORT' }, 403);
  }

  // Do not call the generic operational-snapshot/compliance aggregator: it
  // contains offshore-specific policy paths and is NOT BOA methodology.
  const summary = await loadBombeirosCheckinMonthlyEvidence(c.env.DB, empresaId, mes, ids);
  return c.json({
    success: true,
    data: summary,
    meta: {
      tenant_id: empresaId,
      period: mes,
      comparison_month: precedingMonth(mes),
      generated_at: new Date().toISOString(),
      policy_reference_date: referenceAt,
      profile_code: policy.profileCode,
      revision_id: policy.revision.id,
      policy_version: policy.revision.policy_version,
      source: 'BOMBEIROS_CHECKIN_RECEIPT_EVIDENCE_ONLY',
      limitations: [
        'Este resumo comprova somente a existência de recibos de check-in enviados e NÃO comprova conformidade com limites, prontidão nem aptidão.',
        'A revisão exibida é a vigente na emissão; a revisão de cada dia histórico deve ser auditada separadamente.',
        'Escopo de funcionários e consultas pertencem somente ao tenant Bombeiros.',
      ],
    },
  });
}));

/**
 * GET /api/bombeiros/frms/equipe?cursor=0&limit=50
 * Read-only employee registry view, NOT an operational dispatch or crew roster.
 * A person's aviation classification cannot by itself authorize flight duty.
 */
frmsBombeiros.get('/equipe', requireRole('admin'), safe(async (c) => {
  const tenant = getTenantContext(c);
  if (!isAuthorizedBombeirosFrmsTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_TENANT_REQUIRED' }, 403);
  }
  const cursorQuery = c.req.query('cursor') ?? '0';
  const limitQuery = c.req.query('limit') ?? '50';
  if (!/^\d+$/.test(cursorQuery) || !/^\d+$/.test(limitQuery)) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_ROSTER_PAGE' }, 400);
  }
  const cursor = Number(cursorQuery);
  const limit = Number(limitQuery);
  if (!Number.isSafeInteger(cursor) || cursor < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 130) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_ROSTER_PAGE' }, 400);
  }
  try {
    await resolveBombeirosReadiness(c.env.DB, tenant.empresaId);
  } catch {
    return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503);
  }
  const access = await getEmployeeSectorAccess(c, tenant.empresaId);
  const result = await listBombeirosWorkforce(c.env.DB, tenant.empresaId, access, { cursor, limit });
  return c.json({
    success: true, data: result, meta: {
      tenant_id: tenant.empresaId,
      profile_code: FRMS_FIREFIGHTER_AVIATION_PROFILE,
      source: 'AIRTRUST_FUNCIONARIOS_TENANT_SCOPED',
    },
  });
}));

/**
 * POST /api/bombeiros/frms/simulacao/metodologia
 * Only a synthetic, non-persistent methodological scenario for authorized QA.
 * This never authorizes operational duty or accepts employee identifiers.
 */
frmsBombeiros.post('/simulacao/metodologia', requireRole('admin'), safe(async (c) => {
  const tenant = getTenantContext(c);
  if (!isAuthorizedBombeirosFrmsTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_TENANT_REQUIRED' }, 403);
  }
  // Never run this with actual production data or user-entered clinical info.
  if (c.env.ENVIRONMENT !== 'staging' && c.env.ENVIRONMENT !== 'development') {
    return c.json({ success: false, code: 'BOMBEIROS_SYNTHETIC_ONLY_STAGING' }, 404);
  }
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = BombeirosScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_SYNTHETIC_SCENARIO' }, 400);
  }
  // Governance is required even for a synthetic screen; no shared offshore policy.
  let policy: Awaited<ReturnType<typeof loadEffectiveFrmsConfiguration>>;
  try {
    ({ config: policy } = await resolveBombeirosReadiness(c.env.DB, tenant.empresaId));
  } catch {
    return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503);
  }
  const result = assessBombeirosSyntheticScenario(parsed.data);
  c.header('Cache-Control', 'private, no-store');
  return c.json({
    success: true,
    data: result,
    meta: {
      tenant_id: tenant.empresaId,
      profile_code: policy.profileCode,
      revision_id: policy.revision.id,
      simulated: true,
      stored: false,
      human_review_required: true,
    },
  });
}));

export default frmsBombeiros;
