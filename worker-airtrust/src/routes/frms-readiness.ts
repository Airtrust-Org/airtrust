import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import {
  countReadinessBaselineSessions,
  persistReadinessAssessment,
} from '../lib/frms/readiness-persistence';
import { READINESS_PROTOCOL } from '../lib/frms/readiness';

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

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
});

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
  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }

  const excludeDate = c.req.query('date');
  if (excludeDate && !/^\d{4}-\d{2}-\d{2}$/.test(excludeDate)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }
  const sessions = await countReadinessBaselineSessions(
    c.env.DB,
    empresaId,
    funcionarioId,
    excludeDate || undefined,
  );
  return c.json({
    success: true,
    data: {
      sessions,
      minimum_sessions: READINESS_PROTOCOL.minimumBaselineSessions,
      ready: sessions >= READINESS_PROTOCOL.minimumBaselineSessions,
    },
  });
});

router.get('/today', async (c) => {
  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
  const funcionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!funcionarioId) {
    return c.json({ success: false, error: 'Funcionario nao encontrado para o usuario atual' }, 404);
  }

  const referenceDate = c.req.query('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT
       id, reference_date, protocol_version, scoring_version, classification,
       baseline_sessions, baseline_ready, duration_ms, valid_trials,
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

router.post('/', async (c) => {
  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
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

  // Subjective signals are authoritative from the already-saved tenant-scoped
  // daily fatigue check-in. The browser cannot override KSS or sleep values here.
  const checkin = await c.env.DB.prepare(
    `SELECT id, kss_score, horas_sono
       FROM frms_fadiga_checkin
      WHERE empresa_id = ?
        AND funcionario_id = ?
        AND data_checkin = ?
        AND deleted_at IS NULL
      LIMIT 1`,
  )
    .bind(empresaId, funcionarioId, parsed.data.reference_date)
    .first<{ id: string; kss_score: number; horas_sono: number }>();

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
    });

    return c.json({ success: true, data: result }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'readiness_persistence_failed';
    if (code === 'invalid_trial_sequence' || code === 'invalid_trial_timing') {
      return c.json({ success: false, error: code }, 400);
    }
    console.error('[frms-readiness] persistence failed', {
      empresaId,
      funcionarioId,
      referenceDate: parsed.data.reference_date,
      error: code,
    });
    return c.json({ success: false, error: 'readiness_persistence_failed' }, 500);
  }
});

export default router;
