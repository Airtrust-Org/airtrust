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
import { loadEffectiveFrmsConfiguration, relatorioCompliance } from '../lib/frms/db-service';
import { buildFrmsMonthlyConsolidatedSummary } from '../lib/frms/monthly-consolidated-summary';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import { loadFrmsReportCrewScope } from '../lib/frms/report-access';
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

  // Independent regulatory governance. Offshore assignment, a missing revision,
  // or ambiguous profile all fail closed before any workforce/FRMS aggregation.
  const referenceAt = getTodayIsoSaoPaulo();
  let policy: Awaited<ReturnType<typeof loadEffectiveFrmsConfiguration>>;
  try {
    const [evidence, config] = await Promise.all([
      resolveFrmsRegulatoryProfileEvidence(c.env.DB, {
        empresaId, referenceAt,
      }),
      loadEffectiveFrmsConfiguration(c.env.DB, empresaId, referenceAt),
    ]);
    if (
      evidence.empresaId !== empresaId
      || evidence.profileCode !== FRMS_FIREFIGHTER_AVIATION_PROFILE
      || config.empresaId !== empresaId
      || config.profileCode !== FRMS_FIREFIGHTER_AVIATION_PROFILE
      || evidence.regulatoryProfileId !== config.regulatoryProfileId
    ) {
      return c.json({ success: false, code: 'BOMBEIROS_PROFILE_NOT_APPROVED' }, 503);
    }
    policy = config;
  } catch {
    return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503);
  }

  const access = await getEmployeeSectorAccess(c, empresaId);
  const { ids } = await loadFrmsReportCrewScope(c.env.DB, empresaId, access);
  if (ids.size < 5) {
    return c.json({ success: false, code: 'BOMBEIROS_SMALL_COHORT' }, 403);
  }

  const previousMonth = precedingMonth(mes);
  const [current, previous] = await Promise.all([
    relatorioCompliance(c.env.DB, mes, empresaId, ids),
    relatorioCompliance(c.env.DB, previousMonth, empresaId, ids),
  ]);
  const summary = buildFrmsMonthlyConsolidatedSummary(current, previous, ids.size);
  return c.json({
    success: true,
    data: summary,
    meta: {
      tenant_id: empresaId,
      period: mes,
      comparison_month: previousMonth,
      generated_at: new Date().toISOString(),
      policy_reference_date: referenceAt,
      profile_code: policy.profileCode,
      revision_id: policy.revision.id,
      policy_version: policy.revision.policy_version,
      source: 'BOMBEIROS_FRMS_CANONICAL_COMPLIANCE',
      limitations: [
        'Este resumo não é o relatório mensal técnico assinado exigido pelo edital.',
        'A revisão exibida é a vigente na emissão; a revisão de cada dia histórico deve ser auditada separadamente.',
        'Escopo de funcionários e consultas pertencem somente ao tenant Bombeiros.',
      ],
    },
  });
}));

export default frmsBombeiros;
