import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import {
  deriveRecoveryEvidence,
  type RecoveryActivityType,
} from '../lib/frms/recovery-model';

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

type RecoveryContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const activityTypes = [
  'OFF_DUTY',
  'STANDBY_HOME_HOTEL',
  'STANDBY_ONSITE',
  'ADMIN_TRAINING',
  'DUTY_TRAVEL',
  'MIXED',
  'OTHER',
  'FLIGHT_NOT_IN_SOURCE',
  'UNKNOWN',
] as const;

const segmentTypes = [
  'OFF_DUTY',
  'STANDBY_HOME_HOTEL',
  'STANDBY_ONSITE',
  'ADMIN_TRAINING',
  'DUTY_TRAVEL',
  'OTHER',
] as const;

const locationKinds = ['HOME', 'HOTEL', 'BASE_AIRPORT', 'TRAVEL', 'OTHER'] as const;
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const segmentSchema = z.object({
  activity_type: z.enum(segmentTypes),
  start_time: timeSchema.optional().nullable(),
  end_time: timeSchema.optional().nullable(),
  location_kind: z.enum(locationKinds).optional().nullable(),
  immediate_callout_required: z.boolean().optional().nullable(),
});

const activitySchema = z
  .object({
    reference_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activity_type: z.enum(activityTypes),
    standby_location: z.enum(['HOME', 'HOTEL', 'BASE_AIRPORT', 'OTHER']).optional().nullable(),
    immediate_callout_required: z.boolean().optional().nullable(),
    duty_start_time: timeSchema.optional().nullable(),
    duty_end_time: timeSchema.optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    segments: z.array(segmentSchema).max(3).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.activity_type === 'MIXED' && (!value.segments || value.segments.length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segments'],
        message: 'Dias mistos exigem pelo menos dois segmentos.',
      });
    }
    if (value.activity_type !== 'MIXED' && value.segments && value.segments.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segments'],
        message: 'Segmentos só podem ser informados quando activity_type=MIXED.',
      });
    }
  });

type FlightSummary = {
  detected: boolean;
  sectorCount: number;
  landingCount: number;
  canonicalFlightMinutes: number;
  source: 'SIGVOOS' | 'NONE_FOUND';
};

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function addDaysYmd(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value: string | null | undefined): number | null {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function durationMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return null;
  return e >= s ? e - s : 1440 - s + e;
}

async function resolveOwnFuncionarioId(c: RecoveryContext, empresaId: number): Promise<number | null> {
  const fromContext = Number(c.get('funcionarioId') || 0);
  if (fromContext > 0) {
    const row = await c.env.DB.prepare(
      `SELECT id FROM funcionarios
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
        LIMIT 1`,
    )
      .bind(fromContext, empresaId)
      .first<{ id: number }>();
    if (row?.id) return row.id;
  }

  const userId = Number(c.get('userId') || 0);
  if (userId <= 0) return null;
  const row = await c.env.DB.prepare(
    `SELECT f.id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.id = ?
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo,1)=1
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();
  if (row?.id) return row.id;

  const legacy = await c.env.DB.prepare(
    `SELECT id FROM funcionarios
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND COALESCE(ativo,1)=1
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();
  return legacy?.id ?? null;
}

async function getFlightSummary(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  referenceDate: string,
): Promise<FlightSummary> {
  let sectorCount = 0;
  let landingCount = 0;
  try {
    const cv = await db
      .prepare(
        `SELECT
           COUNT(*) AS sector_count,
           COALESCE(SUM(pousos_diurnos + pousos_noturnos), 0) AS landing_count
         FROM (
           SELECT DISTINCT
             e.id,
             COALESCE(e.pousos_diurnos, 0) AS pousos_diurnos,
             COALESCE(e.pousos_noturnos, 0) AS pousos_noturnos
           FROM cv_voo_tripulantes t
           JOIN cv_voos v
             ON v.id = t.voo_id
            AND v.empresa_id = t.empresa_id
            AND v.deleted_at IS NULL
           JOIN cv_voo_etapas e
             ON e.id = t.etapa_id
            AND e.empresa_id = t.empresa_id
            AND e.deleted_at IS NULL
          WHERE t.empresa_id = ?
            AND t.funcionario_id = ?
            AND v.data_programacao = ?
            AND t.deleted_at IS NULL
         )`,
      )
      .bind(empresaId, funcionarioId, referenceDate)
      .first<{ sector_count: number; landing_count: number }>();
    sectorCount = Number(cv?.sector_count || 0);
    landingCount = Number(cv?.landing_count || 0);
  } catch {
    // Older environments may not have CV tables. Canonical jornada check below still applies.
  }

  let canonicalFlightMinutes = 0;
  try {
    const jornada = await db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(horas_voo_minutos,0)),0) AS minutes
           FROM frms_jornada
          WHERE tripulante_id = ?
            AND data = ?
            AND UPPER(COALESCE(origem,'')) = 'SIGVOOS'
            AND deleted_at IS NULL`,
      )
      .bind(funcionarioId, referenceDate)
      .first<{ minutes: number }>();
    canonicalFlightMinutes = Number(jornada?.minutes || 0);
  } catch {
    // Fail closed below: a crew can still report FLIGHT_NOT_IN_SOURCE.
  }

  const detected = sectorCount > 0 || canonicalFlightMinutes > 0;
  return {
    detected,
    sectorCount,
    landingCount,
    canonicalFlightMinutes,
    source: detected ? 'SIGVOOS' : 'NONE_FOUND',
  };
}

async function getSleepTargetHours(db: D1Database): Promise<number> {
  try {
    const row = await db
      .prepare(
        `SELECT valor_numerico
           FROM frms_configuracao_limites
          WHERE nome = 'HORAS_SONO_PADRAO' AND ativo = 1 AND deleted_at IS NULL
          LIMIT 1`,
      )
      .first<{ valor_numerico: number }>();
    const value = Number(row?.valor_numerico);
    return Number.isFinite(value) && value >= 4 && value <= 12 ? value : 8;
  } catch {
    return 8;
  }
}

async function countPriorQualifyingNights(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  referenceDate: string,
): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT reference_date, qualifying_recovery_night
         FROM frms_recovery_assessment
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND reference_date < ?
          AND deleted_at IS NULL
        ORDER BY reference_date DESC
        LIMIT 14`,
    )
    .bind(empresaId, funcionarioId, referenceDate)
    .all<{ reference_date: string; qualifying_recovery_night: number }>();

  let expected = addDaysYmd(referenceDate, -1);
  let count = 0;
  for (const row of rows.results || []) {
    if (row.reference_date !== expected || Number(row.qualifying_recovery_night) !== 1) break;
    count += 1;
    expected = addDaysYmd(expected, -1);
  }
  return count;
}

async function loadRecoveryEvidence(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  referenceDate: string,
): Promise<{
  checkinId: string | null;
  readinessAssessmentId: string | null;
  sleepHours24h: number | null;
  kssScore: number | null;
  readinessClassification: 'baseline_building' | 'preserved' | 'attention' | 'operational_review' | null;
}> {
  const assessmentDate = addDaysYmd(referenceDate, 1);
  const [checkin, readiness] = await Promise.all([
    db
      .prepare(
        `SELECT id, horas_sono, kss_score
           FROM frms_fadiga_checkin
          WHERE empresa_id = ? AND funcionario_id = ? AND data_checkin = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, funcionarioId, assessmentDate)
      .first<{ id: string; horas_sono: number; kss_score: number }>(),
    db
      .prepare(
        `SELECT id, classification
           FROM frms_readiness_assessment
          WHERE empresa_id = ? AND funcionario_id = ? AND reference_date = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, funcionarioId, assessmentDate)
      .first<{ id: string; classification: string }>(),
  ]);

  const validReadiness = ['baseline_building', 'preserved', 'attention', 'operational_review'].includes(
    String(readiness?.classification || ''),
  )
    ? (readiness!.classification as 'baseline_building' | 'preserved' | 'attention' | 'operational_review')
    : null;

  return {
    checkinId: checkin?.id ?? null,
    readinessAssessmentId: readiness?.id ?? null,
    sleepHours24h: checkin?.horas_sono == null ? null : Number(checkin.horas_sono),
    kssScore: checkin?.kss_score == null ? null : Number(checkin.kss_score),
    readinessClassification: validReadiness,
  };
}

async function upsertRecoveryAssessment(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  referenceDate: string;
  recoveryDayId: string;
  activityType: RecoveryActivityType;
  immediateCalloutRequired: boolean | null;
}): Promise<Record<string, unknown>> {
  const evidence = await loadRecoveryEvidence(
    params.db,
    params.empresaId,
    params.funcionarioId,
    params.referenceDate,
  );
  const sleepTargetHours = await getSleepTargetHours(params.db);
  const priorNights = await countPriorQualifyingNights(
    params.db,
    params.empresaId,
    params.funcionarioId,
    params.referenceDate,
  );
  const result = deriveRecoveryEvidence({
    activityType: params.activityType,
    sleepHours24h: evidence.sleepHours24h,
    sleepTargetHours,
    consecutiveQualifyingNights: priorNights + 1,
    readinessClassification: evidence.readinessClassification,
    immediateCalloutRequired: params.immediateCalloutRequired,
    activityKnown: params.activityType !== 'UNKNOWN',
  });
  const consecutiveQualifyingNights = result.qualifyingRecoveryNight ? priorNights + 1 : 0;
  const now = nowSql();

  const existing = await params.db
    .prepare(
      `SELECT id FROM frms_recovery_assessment
        WHERE empresa_id = ? AND funcionario_id = ? AND reference_date = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.empresaId, params.funcionarioId, params.referenceDate)
    .first<{ id: string }>();
  if (existing?.id) {
    await params.db
      .prepare(
        `UPDATE frms_recovery_assessment SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(now, now, existing.id, params.empresaId)
      .run();
  }

  const id = crypto.randomUUID();
  await params.db
    .prepare(
      `INSERT INTO frms_recovery_assessment (
         id, empresa_id, funcionario_id, reference_date, recovery_day_id,
         checkin_id, readiness_assessment_id, model_version,
         recovery_state, recovery_confidence, qualifying_recovery_night,
         consecutive_qualifying_nights, sleep_hours_24h, sleep_target_hours,
         kss_score, readiness_classification, effectiveness_delta_pct,
         reasons_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'recovery-v1-evidence-only', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .bind(
      id,
      params.empresaId,
      params.funcionarioId,
      params.referenceDate,
      params.recoveryDayId,
      evidence.checkinId,
      evidence.readinessAssessmentId,
      result.state,
      result.confidence,
      result.qualifyingRecoveryNight ? 1 : 0,
      consecutiveQualifyingNights,
      evidence.sleepHours24h,
      sleepTargetHours,
      evidence.kssScore,
      evidence.readinessClassification,
      JSON.stringify(result.reasons),
      now,
      now,
    )
    .run();

  return {
    id,
    recovery_state: result.state,
    recovery_confidence: result.confidence,
    qualifying_recovery_night: result.qualifyingRecoveryNight,
    consecutive_qualifying_nights: consecutiveQualifyingNights,
    sleep_hours_24h: evidence.sleepHours24h,
    sleep_target_hours: sleepTargetHours,
    kss_score: evidence.kssScore,
    readiness_classification: evidence.readinessClassification,
    reasons: result.reasons,
    effectiveness_delta_pct: null,
  };
}

export async function refreshRecoveryAssessmentForActivityDate(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  referenceDate: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const activity = await params.db
      .prepare(
        `SELECT id, activity_type, immediate_callout_required
           FROM frms_recovery_activity_day
          WHERE empresa_id = ? AND funcionario_id = ? AND reference_date = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(params.empresaId, params.funcionarioId, params.referenceDate)
      .first<{ id: string; activity_type: RecoveryActivityType; immediate_callout_required: number | null }>();
    if (!activity?.id) return null;
    return upsertRecoveryAssessment({
      db: params.db,
      empresaId: params.empresaId,
      funcionarioId: params.funcionarioId,
      referenceDate: params.referenceDate,
      recoveryDayId: activity.id,
      activityType: activity.activity_type,
      immediateCalloutRequired:
        activity.immediate_callout_required == null ? null : Number(activity.immediate_callout_required) === 1,
    });
  } catch {
    // Migration may not yet be applied in older environments.
    return null;
  }
}

router.get('/context', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }
  const referenceDate = c.req.query('date') || addDaysYmd(new Date().toISOString().slice(0, 10), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }

  const flight = await getFlightSummary(c.env.DB, empresaId, funcionarioId, referenceDate);
  let activity: Record<string, unknown> | null = null;
  let assessment: Record<string, unknown> | null = null;
  try {
    activity = await c.env.DB
      .prepare(
        `SELECT * FROM frms_recovery_activity_day
          WHERE empresa_id = ? AND funcionario_id = ? AND reference_date = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, funcionarioId, referenceDate)
      .first<Record<string, unknown>>();
    assessment = await c.env.DB
      .prepare(
        `SELECT * FROM frms_recovery_assessment
          WHERE empresa_id = ? AND funcionario_id = ? AND reference_date = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, funcionarioId, referenceDate)
      .first<Record<string, unknown>>();
  } catch {
    return c.json({
      success: true,
      data: {
        reference_date: referenceDate,
        schema_ready: false,
        flight,
        requires_activity_classification: false,
        activity: null,
        assessment: null,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      reference_date: referenceDate,
      assessment_date: addDaysYmd(referenceDate, 1),
      schema_ready: true,
      flight,
      requires_activity_classification: !flight.detected && !activity,
      activity,
      assessment,
      prompt_reason: flight.detected ? 'FLIGHT_DETECTED' : 'NO_FLIGHT_FOUND_IN_SIGVOOS',
    },
  });
});

router.post('/activity', async (c) => {
  const empresaId = getEmpresaId(c);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }
  const parsed = activitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ success: false, error: 'invalid_recovery_activity', details: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const flight = await getFlightSummary(c.env.DB, empresaId, funcionarioId, data.reference_date);
  if (flight.detected && data.activity_type !== 'FLIGHT_NOT_IN_SOURCE') {
    return c.json(
      {
        success: false,
        error: 'flight_detected_for_reference_date',
        message: 'SIGVOOS possui atividade de voo nesta data; a classificação de dia sem voo foi rejeitada.',
        flight,
      },
      409,
    );
  }
  if (flight.detected && data.activity_type === 'FLIGHT_NOT_IN_SOURCE') {
    return c.json(
      {
        success: false,
        error: 'source_gap_not_applicable',
        message: 'O voo já está presente no SIGVOOS; não há discrepância de fonte para registrar.',
        flight,
      },
      409,
    );
  }

  const now = nowSql();
  const existing = await c.env.DB
    .prepare(
      `SELECT id FROM frms_recovery_activity_day
        WHERE empresa_id = ? AND funcionario_id = ? AND reference_date = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, funcionarioId, data.reference_date)
    .first<{ id: string }>();
  if (existing?.id) {
    await c.env.DB
      .prepare(
        `UPDATE frms_recovery_activity_day SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(now, now, existing.id, empresaId)
      .run();
  }

  const activityId = crypto.randomUUID();
  const totalDutyMinutes = durationMinutes(data.duty_start_time, data.duty_end_time);
  const noFlightConfirmed =
    data.activity_type !== 'FLIGHT_NOT_IN_SOURCE' && data.activity_type !== 'UNKNOWN' ? 1 : 0;
  await c.env.DB
    .prepare(
      `INSERT INTO frms_recovery_activity_day (
         id, empresa_id, funcionario_id, reference_date, no_flight_confirmed,
         activity_type, standby_location, immediate_callout_required,
         duty_start_time, duty_end_time, total_duty_minutes,
         source, confidence, notes, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREW_REPORTED', 'REPORTED', ?, ?, ?, ?)`,
    )
    .bind(
      activityId,
      empresaId,
      funcionarioId,
      data.reference_date,
      noFlightConfirmed,
      data.activity_type,
      data.standby_location ?? null,
      data.immediate_callout_required == null ? null : data.immediate_callout_required ? 1 : 0,
      data.duty_start_time ?? null,
      data.duty_end_time ?? null,
      totalDutyMinutes,
      data.notes ?? null,
      Number(c.get('userId') || 0) || null,
      now,
      now,
    )
    .run();

  if (data.activity_type === 'MIXED' && data.segments) {
    const statements = data.segments.map((segment, index) =>
      c.env.DB
        .prepare(
          `INSERT INTO frms_recovery_activity_segment (
             id, recovery_day_id, empresa_id, funcionario_id, sequence,
             activity_type, start_time, end_time, duration_minutes,
             location_kind, immediate_callout_required, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          activityId,
          empresaId,
          funcionarioId,
          index + 1,
          segment.activity_type,
          segment.start_time ?? null,
          segment.end_time ?? null,
          durationMinutes(segment.start_time, segment.end_time),
          segment.location_kind ?? null,
          segment.immediate_callout_required == null ? null : segment.immediate_callout_required ? 1 : 0,
          now,
        ),
    );
    if (statements.length > 0) await c.env.DB.batch(statements);
  }

  const assessment = await upsertRecoveryAssessment({
    db: c.env.DB,
    empresaId,
    funcionarioId,
    referenceDate: data.reference_date,
    recoveryDayId: activityId,
    activityType: data.activity_type,
    immediateCalloutRequired: data.immediate_callout_required ?? null,
  });

  return c.json(
    {
      success: true,
      data: {
        activity: {
          id: activityId,
          reference_date: data.reference_date,
          activity_type: data.activity_type,
          no_flight_confirmed: noFlightConfirmed === 1,
          source: 'CREW_REPORTED',
        },
        assessment,
        flight,
        source_discrepancy: data.activity_type === 'FLIGHT_NOT_IN_SOURCE',
      },
    },
    201,
  );
});

export default router;
