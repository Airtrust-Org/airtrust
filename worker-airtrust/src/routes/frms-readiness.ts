import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { canSeeFrmsTeamScopeForContext } from '../middleware/frms-access';
import { getEmployeeSectorAccess, buildFuncionarioScopeWhere } from '../middleware/employee-sector-access';
import {
  countReadinessBaselineSessions,
  persistReadinessAssessment,
} from '../lib/frms/readiness-persistence';
import {
  READINESS_PROTOCOL,
  READINESS_PROTOCOL_VERSIONS,
  isReadinessProtocolVersion,
} from '../lib/frms/readiness';
import recoveryRoutes, { refreshRecoveryAssessmentForActivityDate } from './frms-recovery';
import { createLogger } from '../utils/logger';
import { frmsOperationalTodayIso } from '../lib/frms/operational-date';
import { isValidPastOrTodayCheckinDate } from '../lib/frms/checkin-date-guard';
import { isAtOrAfterFrmsPresentation } from '../lib/frms/checkin-submission-timing';

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());
router.route('/recovery', recoveryRoutes);

type ReadinessContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const trialSchema = z.object({
  sequence: z.number().int().positive(),
  scheduledAtMs: z.number().int().nonnegative(),
  stimulusAtMs: z.number().int().min(-1),
  responseAtMs: z.number().int().nonnegative().nullable(),
  reactionTimeMs: z.number().int().nonnegative().nullable(),
  outcome: z.enum(['response', 'lapse', 'false_start', 'missed']),
});

const submitSchema = z.object({
  reference_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_ms: z
    .number()
    .int()
    .min(READINESS_PROTOCOL.defaultDurationMs - READINESS_PROTOCOL.allowedDurationDriftMs)
    .max(READINESS_PROTOCOL.defaultDurationMs + READINESS_PROTOCOL.allowedDurationDriftMs),
  trials: z.array(trialSchema).min(READINESS_PROTOCOL.minimumTrials).max(300),
  // Historical protocol versions are read-only: a 60 s upload cannot masquerade as PVT-B.
  protocol_version: z.literal(READINESS_PROTOCOL.version).optional(),
});

function previousDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function resolveOwnFuncionarioId(c: ReadinessContext, empresaId: number): Promise<number | null> {
  const fromContext = Number(c.get('funcionarioId') || 0);
  if (fromContext > 0) {
    const row = await c.env.DB.prepare(
      `SELECT id
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
        LIMIT 1`,
    )
      .bind(fromContext, empresaId)
      .first<{ id: number }>();
    if (row?.id) return row.id;
  }

  const userId = Number(c.get('userId') || 0);
  if (userId <= 0) return null;

  const byUsuario = await c.env.DB.prepare(
    `SELECT f.id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.id = ?
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();
  if (byUsuario?.id) return byUsuario.id;

  const byFuncionario = await c.env.DB.prepare(
    `SELECT id
       FROM funcionarios
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND COALESCE(ativo, 1) = 1
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();
  return byFuncionario?.id ?? null;
}

router.get('/baseline', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }

  const beforeDate = c.req.query('date');
  if (beforeDate && !/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }
  const protocolParam = c.req.query('protocol');
  const protocolVersion = isReadinessProtocolVersion(protocolParam)
    ? protocolParam
    : READINESS_PROTOCOL.version;
  const sessions = protocolVersion === READINESS_PROTOCOL.version
    ? 0 // Sem aparelho e critério descansado não há baseline válido.
    : await countReadinessBaselineSessions(
      c.env.DB,
      empresaId,
      funcionarioId,
      protocolVersion,
      beforeDate || undefined,
    );
  return c.json({
    success: true,
    data: {
      sessions,
      minimum_sessions: READINESS_PROTOCOL.minimumBaselineSessions,
      // No persisted device/rested qualification exists in Schema V2 yet.
      // A historical session count does not establish a valid baseline.
      ready: false,
      protocol_version: protocolVersion,
    },
  });
});

router.get('/today', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }

  const referenceDate = c.req.query('date') || frmsOperationalTodayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT
       id, reference_date, protocol_version, scoring_version, classification,
       baseline_sessions, baseline_ready, baseline_median_rt_ms, baseline_lapse_rate,
       median_rt_delta_pct, lapse_rate_delta, duration_ms, valid_trials,
       lapse_count, lapse_rate, false_start_count, missed_count,
       median_rt_ms, mean_rt_ms, p90_rt_ms, sd_rt_ms, response_speed,
       warning_signals_json, critical_signals_json, created_at
     FROM frms_readiness_assessment
     WHERE empresa_id = ?
       AND funcionario_id = ?
       AND reference_date = ?
       AND deleted_at IS NULL
     LIMIT 1`,
  )
    .bind(empresaId, funcionarioId, referenceDate)
    .first<Record<string, unknown>>();

  return c.json({ success: true, data: row || null });
});

router.get('/team', async (c) => {
  const empresaId = getEmpresaId(c);
  const referenceDate = c.req.query('date') || frmsOperationalTodayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }

  const hasTeamScope = await canSeeFrmsTeamScopeForContext(c);
  let forcedFuncionarioId: number | undefined;
  if (!hasTeamScope) {
    const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
    if (!funcionarioId) {
      return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
    }
    forcedFuncionarioId = funcionarioId;
  }

  // A team-view role does not grant access to all sectors in the tenant.
  // Apply the same employee-sector policy used by other FRMS team reports.
  const teamSectorAccess = hasTeamScope ? await getEmployeeSectorAccess(c, empresaId) : null;
  const teamScope = teamSectorAccess ? buildFuncionarioScopeWhere(teamSectorAccess, 'f') : null;

  // Anchor the team view in the authoritative daily check-in instead of the
  // readiness table alone. Historical builds persisted these in two requests;
  // if the second request failed, the operator saw "check-in realizado" beside
  // a readiness gap without knowing whether the test write had been lost.
  // Brief protocol has no validated same-device/rested baseline in this schema.
  // Never count different-device sessions as evidence of normal readiness.
  const fields = `
    CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,
    ch.data_checkin AS reference_date,
    COALESCE(ra.classification, 'baseline_building') AS classification,
    COALESCE(ra.baseline_sessions, 0) AS baseline_sessions,
    COALESCE(ra.baseline_ready, 0) AS baseline_ready,
    ra.median_rt_delta_pct,
    ra.lapse_rate_delta,
    ra.warning_signals_json,
    ra.critical_signals_json,
    COALESCE(ra.created_at, ch.created_at) AS created_at,
    CASE WHEN ra.id IS NULL THEN 1 ELSE 0 END AS assessment_missing`;
  const baseSql = `SELECT ${fields}
       FROM frms_fadiga_checkin ch
       INNER JOIN funcionarios f
         ON f.id = CAST(ch.funcionario_id AS INTEGER)
        AND f.empresa_id = ch.empresa_id
        AND f.deleted_at IS NULL
       LEFT JOIN frms_readiness_assessment ra
         ON ra.empresa_id = ch.empresa_id
        AND ra.funcionario_id = ch.funcionario_id
        AND ra.reference_date = ch.data_checkin
        AND ra.deleted_at IS NULL
      WHERE ch.empresa_id = ?
        AND ch.data_checkin = ?
        AND ch.deleted_at IS NULL
        AND ${teamScope?.clause ?? '1 = 1'}`;
  const commonBinds = [empresaId, referenceDate, ...(teamScope?.bindings ?? [])] as const;
  const statement = forcedFuncionarioId
    ? c.env.DB.prepare(`${baseSql} AND ch.funcionario_id = ? ORDER BY ch.funcionario_id ASC`).bind(
        ...commonBinds,
        forcedFuncionarioId,
      )
    : c.env.DB.prepare(`${baseSql} ORDER BY ch.funcionario_id ASC`).bind(...commonBinds);

  const result = await statement.all<Record<string, unknown>>();
  return c.json({
    success: true,
    data: result.results || [],
    meta: {
      scope: hasTeamScope ? 'team' : 'self',
      forced_funcionario_id: forcedFuncionarioId,
    },
  });
});

router.post('/', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }

  const parsed = submitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'invalid_readiness_payload',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const operationalToday = frmsOperationalTodayIso();
  if (!isValidPastOrTodayCheckinDate(parsed.data.reference_date, operationalToday)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }
  // Objective tests performed now cannot be certified as historical pre-flight evidence.
  if (parsed.data.reference_date !== operationalToday) {
    return c.json({ success: false, error: 'retrospective_readiness_not_allowed' }, 409);
  }

  // Subjective signals are authoritative from the already-saved tenant-scoped
  // daily fatigue check-in. The browser cannot override KSS or sleep values here.
  const checkin = await c.env.DB.prepare(
    `SELECT id, kss_score, kss_provenance, horas_sono, jornada_inicio_prevista
       FROM frms_fadiga_checkin
      WHERE empresa_id = ?
        AND funcionario_id = ?
        AND data_checkin = ?
        AND deleted_at IS NULL
      LIMIT 1`,
  )
    .bind(empresaId, funcionarioId, parsed.data.reference_date)
    .first<{ id: string; kss_score: number; kss_provenance: string | null; horas_sono: number | null; jornada_inicio_prevista: string | null }>();

  if (!checkin?.id) {
    return c.json(
      {
        success: false,
        error: 'daily_checkin_required',
        message: 'Registre o check-in de fadiga antes de salvar o teste de prontidao.',
      },
      409,
    );
  }

  if (isAtOrAfterFrmsPresentation(new Date(), checkin.jornada_inicio_prevista)) {
    return c.json({ success: false, error: 'post_presentation_readiness_not_allowed' }, 409);
  }

  // Legacy numeric KSS without provenance is not evidence of a crew response.
  // Never compute objective-readiness conclusions from a defaulted/derived KSS.
  if (checkin.kss_provenance !== 'CREW_REPORTED' ||
      !Number.isInteger(checkin.kss_score) ||
      checkin.kss_score < 1 || checkin.kss_score > 9) {
    return c.json({
      success: false,
      error: 'KSS_PROVENANCE_UNVERIFIED',
      message: 'É necessário KSS explicitamente informado pelo tripulante para registrar o teste.',
    }, 409);
  }

  // SQL NULL must not be coerced to 0 hours of sleep: absence is not a
  // crew-declared sleepless night, and readiness cannot infer the difference.
  if (checkin.horas_sono == null || !Number.isFinite(Number(checkin.horas_sono))) {
    return c.json({
      success: false,
      error: 'SLEEP_EVIDENCE_MISSING',
      message: 'Informe as horas de sono no check-in antes de registrar o teste.',
    }, 409);
  }

  try {
    const result = await persistReadinessAssessment(c.env.DB, {
      empresaId,
      funcionarioId,
      userId: Number(c.get('userId') || 0) || null,
      checkinId: checkin.id,
      referenceDate: parsed.data.reference_date,
      kssScore: Number(checkin.kss_score),
      sleepHours: Number(checkin.horas_sono),
      durationMs: parsed.data.duration_ms,
      trials: parsed.data.trials,
      protocolVersion: parsed.data.protocol_version,
    });

    const recovery = await refreshRecoveryAssessmentForActivityDate({
      db: c.env.DB,
      empresaId,
      funcionarioId,
      referenceDate: previousDate(parsed.data.reference_date),
    });

    return c.json({ success: true, data: { ...result, recovery_previous_day: recovery } }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'readiness_persistence_failed';
    if (code === 'invalid_trial_sequence' || code === 'invalid_trial_timing') {
      return c.json({ success: false, error: code }, 400);
    }
    createLogger(c, 'FrmsReadiness').error(
      'frms_readiness_persistence_failed',
      new Error('readiness_persistence_failed'),
    );
    return c.json({ success: false, error: 'readiness_persistence_failed' }, 500);
  }
});

export default router;
