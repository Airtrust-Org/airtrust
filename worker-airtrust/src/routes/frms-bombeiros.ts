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
import { loadBoaMonthlyManagementPreview } from '../lib/frms/bombeiros-monthly-management-report';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import { loadFrmsReportCrewScope } from '../lib/frms/report-access';
import { listBombeirosWorkforce } from '../lib/frms/bombeiros-workforce';
import {
  BombeirosCheckinSchema, resolveBoaCrewIdentity, registerBoaCheckin,
  loadBoaCrewCheckinStatus,
  loadBoaOperationalCase, loadBoaCaseQueue, loadBoaCaseEvidenceCoverage,
  registerBoaCaseAction, isBombeirosManagerTenant,
} from '../lib/frms/bombeiros-operational-events';
import { BombeirosScenarioSchema, assessBombeirosSyntheticScenario } from '../lib/frms/bombeiros-scenario-method';
import { validateBoaOperationalSourceBatch } from '../lib/frms/bombeiros-duty-source-contract';
import { checkBoaQaCrosswalk } from '../lib/frms/bombeiros-qa-crosswalk';
import { safe } from './frms-shared';

const frmsBombeiros = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
/**
 * Default-closed BOA QA health-data write authorization.
 * Staging/dev alone does NOT authorize sensitive writes. A single explicitly
 * approved synthetic tenant must be named at runtime, never empresa 6 or all.
 */
function boaSensitiveQaWriteAllowed(env: Env, tenantId: number): boolean {
  const configured = env.BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID ?? '';
  return (env.ENVIRONMENT === 'staging' || env.ENVIRONMENT === 'development')
    && Number.isSafeInteger(tenantId) && tenantId > 0 && tenantId !== 6
    && /^[1-9][0-9]*$/.test(configured) && Number(configured) === tenantId;
}


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
 * GET /api/bombeiros/frms/relatorios/gerencial-tecnico-previa?mes=YYYY-MM
 *
 * Read-only, non-persisted, unsigned evidence preview for the tender.
 * Never treat this as the official signed monthly report.
 */
frmsBombeiros.get('/relatorios/gerencial-tecnico-previa', requireRole('admin'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!isAuthorizedBombeirosFrmsTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_TENANT_REQUIRED' }, 403);
  }
  const mes = parseMonth(c.req.query('mes'));
  if (!mes || mes.startsWith('0000')) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_MONTH' }, 400);
  }
  let policy: Awaited<ReturnType<typeof loadEffectiveFrmsConfiguration>>;
  let referenceAt: string;
  try {
    ({ config: policy, referenceAt } = await resolveBombeirosReadiness(c.env.DB, tenant.empresaId));
  } catch {
    return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503);
  }
  const access = await getEmployeeSectorAccess(c, tenant.empresaId);
  const { ids } = await loadFrmsReportCrewScope(c.env.DB, tenant.empresaId, access);
  if (ids.size < 5) {
    return c.json({ success: false, code: 'BOMBEIROS_SMALL_COHORT' }, 403);
  }
  let report: Awaited<ReturnType<typeof loadBoaMonthlyManagementPreview>>;
  try {
    report = await loadBoaMonthlyManagementPreview(c.env.DB, tenant.empresaId, mes, ids);
  } catch {
    // Invalid/missing provenance MUST NOT degrade to a normal-looking zero.
    return c.json({ success: false, code: 'BOMBEIROS_MONTHLY_EVIDENCE_UNVERIFIED' }, 503);
  }
  // An integrity checksum enables comparing a captured read-only JSON
  // preview with its source metadata. It is NOT a signature, custody ledger,
  // immutable archive or substitute for independent audit.
  const digestInput = {
    tenant_id: tenant.empresaId,
    reference_month: mes,
    as_of: report.as_of,
    policy_revision: policy.revision.id,
    report,
  };
  const digest = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(digestInput)));
  const digestHex = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  return c.json({
    success: true, data: report,
    meta: {
      content_sha256: digestHex,
      checksum_scope: 'JSON_STRINGIFY_TENANT_MONTH_AS_OF_POLICY_REVISION_REPORT_V1',
      checksum_only_not_signature: true,
      tenant_id: tenant.empresaId,
      reference_month: mes,
      generated_at: new Date().toISOString(),
      profile_code: policy.profileCode,
      policy_revision: policy.revision.id,
      policy_version: policy.revision.policy_version,
      policy_reference_date: referenceAt,
      signature: 'NOT_SIGNED',
      permanent_archive: 'NOT_CREATED',
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
 * Preflight for a purely fictitious BOA duty export. No database or object
 * storage write is authorized; this checks payload integrity only.
 * An approved source, tenant/employee mapping and exposure denominator are
 * deliberately NOT implied by this successful validation.
 */
frmsBombeiros.post('/fontes-operacionais/validar-qa', requireRole('admin'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!isAuthorizedBombeirosFrmsTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_TENANT_REQUIRED' }, 403);
  }
  if (c.env.ENVIRONMENT !== 'staging' && c.env.ENVIRONMENT !== 'development') {
    return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_STAGING_ONLY' }, 404);
  }
  const contentType = c.req.header('Content-Type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_JSON_REQUIRED' }, 415);
  }
  // Bound the *actual* body, not only an untrusted Content-Length header.
  // Never retain, echo or log opaque source identifiers or raw JSON.
  const maxBytes = 262144;
  const reader = c.req.raw.body?.getReader();
  if (!reader) return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_EMPTY' }, 400);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  let tooLarge = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { tooLarge = true; break; }
      parts.push(chunk.value);
    }
  } finally {
    if (tooLarge) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (tooLarge) return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_TOO_LARGE' }, 413);
  if (!bytes) return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_EMPTY' }, 400);
  const payloadBytes = new Uint8Array(bytes);
  let position = 0;
  for (const part of parts) { payloadBytes.set(part, position); position += part.byteLength; }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(payloadBytes));
  } catch {
    return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_INVALID_JSON' }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_INVALID' }, 400);
  }
  const source = (payload as { source?: Record<string, unknown> }).source;
  // Without approved LGPD and official BOA source, accept fictitious QA only.
  if (!source || source.source_system_id !== 'BOA-QA-SYNTHETIC'
    || typeof source.dataset_id !== 'string' || !source.dataset_id.startsWith('qa-')
    || typeof source.source_document_reference !== 'string'
    || !source.source_document_reference.startsWith('qa-')) {
    return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_SYNTHETIC_ONLY' }, 403);
  }
  // The BOA policy must be active before the QA result is exposed.
  try { await resolveBombeirosReadiness(c.env.DB, tenant.empresaId); }
  catch { return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503); }
  // Optional QA-only identity map is validated against active tenant records.
  // It never becomes an approved source link and never writes to D1.
  const qaCrosswalk = (payload as { qa_crosswalk?: unknown }).qa_crosswalk;
  const sourcePayload = qaCrosswalk === undefined ? payload : {
    ...(payload as Record<string, unknown>), qa_crosswalk: undefined,
  };
  // Remove optional property: Zod's strict source contract must stay strict.
  if (qaCrosswalk !== undefined) delete sourcePayload.qa_crosswalk;
  let candidate: ReturnType<typeof validateBoaOperationalSourceBatch>;
  try { candidate = validateBoaOperationalSourceBatch(sourcePayload); }
  catch { return c.json({ success: false, code: 'BOA_SOURCE_PREFLIGHT_INVALID' }, 400); }
  let mappingStatus: Awaited<ReturnType<typeof checkBoaQaCrosswalk>> | null = null;
  if (qaCrosswalk !== undefined) {
    try {
      mappingStatus = await checkBoaQaCrosswalk(
        c.env.DB, tenant.empresaId, sourcePayload, qaCrosswalk);
    } catch {
      return c.json({ success: false, code: 'BOA_SOURCE_QA_CROSSWALK_UNVERIFIED' }, 422);
    }
  }
  const digest = await crypto.subtle.digest('SHA-256', payloadBytes);
  const sha256 = [...new Uint8Array(digest)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
  const missing = Object.fromEntries(
    [...new Set(candidate.records.flatMap(item => item.missing_sources))].sort()
      .map(key => [key, candidate.records.filter(item => item.missing_sources.includes(key)).length]),
  );
  return c.json({
    success: true,
    data: {
      schema: candidate.contract_version, status: candidate.verification,
      input_sha256: sha256, record_count: candidate.records.length,
      candidate_totals_ms: candidate.candidate_totals_ms,
      missing_sources_count: missing,
      tenant_identity_link: mappingStatus?.tenant_identity_link ?? 'NOT_RESOLVED',
      qa_crosswalk_status: mappingStatus?.status ?? 'NOT_SUBMITTED',
      qa_matched_crew_count: mappingStatus?.mapped_crew_count ?? null,
      source_approval: 'NOT_EVALUATED',
      scientific_risk_score: null,
      operational_exposure_denominator_ms: null,
      stored: false,
      dispatch_permission: 'NOT_GRANTED',
    },
    meta: {
      tenant_id: tenant.empresaId, synthetic_only: true, write_performed: false,
      interpretation: 'SCHEMA_ONLY_NO_APPROVED_SOURCE_OR_AUTHENTICATED_ROSTER',
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

/**
 * Crew-owned BOA check-in. Never derive an employee from user-supplied IDs.
 * No dummy offshore score, no "fit for duty" declaration, no background write.
 */
frmsBombeiros.get('/checkin/status', requireRole('student', 'editor', 'instructor', 'manager'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!tenant || tenant.empresaCodigo !== 'bombeiros' || tenant.empresaId === 6
    || !Number.isSafeInteger(tenant.empresaId) || tenant.empresaId <= 0
    || !['student', 'editor', 'instructor', 'manager'].includes(tenant.role)) {
    return c.json({ success: false, code: 'BOMBEIROS_CREW_TENANT_REQUIRED' }, 403);
  }
  const userId = Number(c.get('userId'));
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return c.json({ success: false, code: 'BOMBEIROS_ACTOR_REQUIRED' }, 403);
  }
  try { await resolveBombeirosReadiness(c.env.DB, tenant.empresaId); }
  catch { return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503); }
  const employeeId = await resolveBoaCrewIdentity(c.env.DB, tenant.empresaId, userId);
  if (!employeeId) {
    return c.json({ success: false, code: 'BOMBEIROS_CREW_NOT_AUTHORIZED' }, 403);
  }
  const result = await loadBoaCrewCheckinStatus(
    c.env.DB, tenant.empresaId, employeeId, userId, getTodayIsoSaoPaulo(),
  );
  c.header('Cache-Control', 'private, no-store');
  return c.json({ success: true, data: result, meta: { tenant_id: tenant.empresaId } });
}));

frmsBombeiros.post('/checkin', requireRole('student', 'editor', 'instructor', 'manager'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!tenant || tenant.empresaCodigo !== 'bombeiros' || tenant.empresaId === 6
    || !Number.isSafeInteger(tenant.empresaId) || tenant.empresaId <= 0
    || !['student','editor','instructor','manager'].includes(tenant.role)) {
    return c.json({ success: false, code: 'BOMBEIROS_CREW_TENANT_REQUIRED' }, 403);
  }
  // Deliberately defer production handling of sensitive operational/health
  // reports until privacy/retention/incident response approvals are complete.
  if (c.env.ENVIRONMENT !== 'staging' && c.env.ENVIRONMENT !== 'development') {
    return c.json({ success: false, code: 'BOMBEIROS_CHECKIN_STAGING_ONLY' }, 404);
  }
  if (!boaSensitiveQaWriteAllowed(c.env, tenant.empresaId)) {
    return c.json({ success: false, code: 'BOMBEIROS_QA_WRITE_NOT_APPROVED' }, 503);
  }
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = BombeirosCheckinSchema.safeParse(raw);
  if (!parsed.success) return c.json({
    success: false, code: 'BOMBEIROS_CHECKIN_INCOMPLETE',
  }, 400);
  const userId = Number(c.get('userId'));
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return c.json({ success: false, code: 'BOMBEIROS_ACTOR_REQUIRED' }, 403);
  }
  const date = getTodayIsoSaoPaulo();
  let policy: Awaited<ReturnType<typeof loadEffectiveFrmsConfiguration>>;
  try {
    ({ config: policy } = await resolveBombeirosReadiness(c.env.DB, tenant.empresaId));
  } catch {
    return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503);
  }
  const employeeId = await resolveBoaCrewIdentity(c.env.DB, tenant.empresaId, userId);
  if (!employeeId) return c.json({ success: false, code: 'BOMBEIROS_CREW_NOT_AUTHORIZED' }, 403);
  const receipt = await registerBoaCheckin(
    c.env.DB, tenant.empresaId, employeeId, userId, date, parsed.data,
    { profile_code: policy.profileCode, revision_id: policy.revision.id,
      policy_version: policy.revision.policy_version },
  );
  if (!receipt.accepted && receipt.status === 'RECHECK_DENIED') {
    return c.json({
      success: false, code: 'BOMBEIROS_CREW_NOT_AUTHORIZED',
      dispatch_permission: 'NOT_GRANTED',
    }, 403);
  }
  if (!receipt.accepted) return c.json({
    success: false, code: 'BOMBEIROS_CHECKIN_ALREADY_RECEIVED',
    dispatch_permission: 'NOT_GRANTED',
  }, 409);
  return c.json({ success: true, data: receipt, meta: {
    tenant_id: tenant.empresaId, source: 'FRMS_FADIGA_EVENTO_BOA_ONLY',
    profile_code: policy.profileCode, revision_id: policy.revision.id,
    clinical_validation: 'NOT_ESTABLISHED',
  } }, 201);
}));

/**
 * The manager's queue contains only case IDs and lifecycle states. It cannot
 * expose a health note, employee identity, KSS or sleep metrics.
 */
frmsBombeiros.get('/casos', requireRole('manager'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!isBombeirosManagerTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_MANAGER_TENANT_REQUIRED' }, 403);
  }
  const limitText = c.req.query('limit') ?? '50';
  const cursorAt = c.req.query('cursor_at');
  const cursorId = c.req.query('cursor_id');
  if (!/^\d+$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100
      || (cursorAt == null) !== (cursorId == null)) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_CASE_CURSOR' }, 400);
  }
  if (cursorAt != null && (!/^\d{4}-\d{2}-\d{2}T[^ ]+Z$/.test(cursorAt)
    || !cursorId || cursorId.length > 120)) {
    return c.json({ success: false, code: 'BOMBEIROS_INVALID_CASE_CURSOR' }, 400);
  }
  try { await resolveBombeirosReadiness(c.env.DB, tenant.empresaId); }
  catch { return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503); }
  const actorId = Number(c.get('userId'));
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    return c.json({ success: false, code: 'BOMBEIROS_ACTOR_REQUIRED' }, 403);
  }
  const access = await getEmployeeSectorAccess(c, tenant.empresaId);
  const queue = await loadBoaCaseQueue(c.env.DB, tenant.empresaId, actorId, access,
    Number(limitText), cursorAt && cursorId ? { created_at: cursorAt, id: cursorId } : undefined);
  if (!queue) return c.json({ success: false, code: 'BOMBEIROS_MANAGER_SECTOR_REQUIRED' }, 403);
  return c.json({
    success: true, data: queue,
    meta: { tenant_id: tenant.empresaId, source: 'BOA_SANITIZED_CASE_QUEUE' },
  });
}));

/** Coverage of evidence, NOT an individual clinical report or risk score. */
frmsBombeiros.get('/casos/:id/evidencias', requireRole('manager'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!isBombeirosManagerTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_MANAGER_TENANT_REQUIRED' }, 403);
  }
  try { await resolveBombeirosReadiness(c.env.DB, tenant.empresaId); }
  catch { return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503); }
  const actorId = Number(c.get('userId'));
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    return c.json({ success: false, code: 'BOMBEIROS_ACTOR_REQUIRED' }, 403);
  }
  const access = await getEmployeeSectorAccess(c, tenant.empresaId);
  const result = await loadBoaCaseEvidenceCoverage(
    c.env.DB, tenant.empresaId, c.req.param('id') ?? '', actorId, access);
  if (!result) return c.json({ success: false, code: 'BOMBEIROS_CASE_NOT_AVAILABLE' }, 404);
  return c.json({ success: true, data: result, meta: {
    tenant_id: tenant.empresaId, source: 'BOA_CASE_EVIDENCE_COVERAGE_ONLY',
    clinical_validation: 'NOT_ESTABLISHED',
  } });
}));
/** Case overview without identifying health values or employee names. */
frmsBombeiros.get('/casos/:id', requireRole('manager'), safe(async c => {
  const tenant = getTenantContext(c);
  if (!isBombeirosManagerTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_MANAGER_TENANT_REQUIRED' }, 403);
  }
  try { await resolveBombeirosReadiness(c.env.DB, tenant.empresaId); }
  catch { return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503); }
  const actorId = Number(c.get('userId'));
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    return c.json({ success: false, code: 'BOMBEIROS_ACTOR_REQUIRED' }, 403);
  }
  const access = await getEmployeeSectorAccess(c, tenant.empresaId);
  const result = await loadBoaOperationalCase(
    c.env.DB, tenant.empresaId, c.req.param('id') ?? '', actorId, access);
  if (!result) return c.json({ success: false, code: 'BOMBEIROS_CASE_NOT_AVAILABLE' }, 404);
  return c.json({ success: true, data: result.status, meta: {
    tenant_id: tenant.empresaId, source: 'BOA_FRMS_APPEND_ONLY_EVENT_STREAM',
  } });
}));

/** Append-only, tenant-and-sector-checked mitigation and efficacy decisions. */
async function handleBoaCaseTransition(
  c: Parameters<Parameters<typeof safe>[0]>[0],
  kind: 'treatment' | 'closure',
) {
  const tenant = getTenantContext(c);
  if (!isBombeirosManagerTenant(tenant)) {
    return c.json({ success: false, code: 'BOMBEIROS_MANAGER_TENANT_REQUIRED' }, 403);
  }
  if (c.env.ENVIRONMENT !== 'staging' && c.env.ENVIRONMENT !== 'development') {
    return c.json({ success: false, code: 'BOMBEIROS_CASE_WRITES_STAGING_ONLY' }, 404);
  }
  if (!boaSensitiveQaWriteAllowed(c.env, tenant.empresaId)) {
    return c.json({ success: false, code: 'BOMBEIROS_QA_WRITE_NOT_APPROVED' }, 503);
  }
  try { await resolveBombeirosReadiness(c.env.DB, tenant.empresaId); }
  catch { return c.json({ success: false, code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' }, 503); }
  const userId = Number(c.get('userId'));
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return c.json({ success: false, code: 'BOMBEIROS_ACTOR_REQUIRED' }, 403);
  }
  const access = await getEmployeeSectorAccess(c, tenant.empresaId);
  const body: unknown = await c.req.json().catch(() => null);
  const caseId = c.req.param('id') ?? '';
  const result = await registerBoaCaseAction(
    c.env.DB, tenant.empresaId, caseId, userId, body, kind, access,
  );
  if (result === 'INVALID') return c.json({
    success: false,
    code: kind === 'treatment' ? 'BOMBEIROS_TREATMENT_INCOMPLETE' : 'BOMBEIROS_EFFECTIVENESS_REQUIRED',
  }, 400);
  if (result !== 'RECORDED') return c.json({
    success: false, code: 'BOMBEIROS_CASE_NOT_OPEN_OR_UNAUTHORIZED',
  }, 409);
  return c.json({
    success: true, status: kind === 'treatment' ? 'EM_TRATAMENTO' : 'RESOLVIDO',
    case_id: caseId,
  });
}
frmsBombeiros.put('/casos/:id/tratamento', requireRole('manager'), safe(async c =>
  handleBoaCaseTransition(c, 'treatment')));
frmsBombeiros.put('/casos/:id/resolver', requireRole('manager'), safe(async c =>
  handleBoaCaseTransition(c, 'closure')));

export default frmsBombeiros;
