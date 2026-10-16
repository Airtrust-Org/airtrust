import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import {
  listFrmsOperationalSnapshot,
  type FrmsOperationalSnapshotFilters,
} from '../lib/frms/operational-snapshot';
import { FrmsParameterResolutionError } from '../lib/frms/parameter-governance';
import { canSeeFrmsTeamScopeForContext } from '../lib/frms/access';
import { createLogger, toError } from '../utils/logger';
import { isImaV3StagingPreviewEnabled } from '../lib/frms/ima-v3-preview-access';
import { bridgeImaOperationalSnapshot } from '../lib/frms/ima-v3-operational-snapshot-bridge';
import { auditImaCohortEvidence } from '../lib/frms/ima-v3-cohort-evidence';
import { lastClosedMonthWindow, loadImaCohortEvidenceRows } from '../lib/frms/ima-v3-cohort-reader';

type SnapshotContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

const QuerySchema = z
  .object({
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    funcionario_id: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      }),
    base: z.string().optional(),
    aeronave: z.string().optional(),
    status: z.string().optional(),
    include_inconsistencies: z
      .string()
      .optional()
      .transform((value) => {
        if (value == null || value === '') return true;
        const normalized = value.trim().toLowerCase();
        return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
      }),
  })
  .refine((data) => data.data_fim >= data.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });

async function canSeeTeam(c: SnapshotContext): Promise<boolean> {
  return canSeeFrmsTeamScopeForContext(c);
}

async function resolveOwnFuncionarioId(
  c: SnapshotContext,
  empresaId: number,
): Promise<number | null> {
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

function normalizeSnapshotItemForApi<T extends {
  recovery_credit_points?: number | null;
  recovery_state?: string | null;
  recovery_activity_type?: string | null;
}>(item: T): T & { recovery_credit_points: number | null } {
  const hasRecoveryEvidence = Boolean(
    item.recovery_state?.trim() || item.recovery_activity_type?.trim(),
  );
  return {
    ...item,
    recovery_credit_points: hasRecoveryEvidence ? Number(item.recovery_credit_points ?? 0) : null,
  };
}

router.get('/operational-snapshot', async (c) => {
  const parsed = QuerySchema.safeParse({
    data_inicio: c.req.query('data_inicio'),
    data_fim: c.req.query('data_fim'),
    funcionario_id: c.req.query('funcionario_id'),
    base: c.req.query('base'),
    aeronave: c.req.query('aeronave'),
    status: c.req.query('status'),
    include_inconsistencies: c.req.query('include_inconsistencies'),
  });

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten() }, 400);
  }

  const empresaId = getEmpresaId(c);
  const data = parsed.data;

  const filters: FrmsOperationalSnapshotFilters = {
    funcionario_id: data.funcionario_id,
    base: data.base,
    aeronave: data.aeronave,
    status: data.status
      ? data.status
          .split(',')
          .map((status) => status.trim().toUpperCase())
          .filter(Boolean)
      : undefined,
    include_inconsistencies: data.include_inconsistencies,
  };
  const hasTeamScope = await canSeeTeam(c);
  let forcedFuncionarioId: number | undefined;

  if (!hasTeamScope) {
    const ownFuncionarioId = await resolveOwnFuncionarioId(c, empresaId);
    if (!ownFuncionarioId) {
      return c.json(
        {
          success: false,
          error: 'Funcionário não encontrado para o usuário atual',
        },
        404,
      );
    }

    filters.funcionario_id = ownFuncionarioId;
    forcedFuncionarioId = ownFuncionarioId;
  }

  try {
    const result = await listFrmsOperationalSnapshot(c.env.DB, {
      empresaId,
      dataInicio: data.data_inicio,
      dataFim: data.data_fim,
      filters,
    });

    return c.json({
      success: true,
      data: result.items.map(normalizeSnapshotItemForApi),
      summary: result.summary,
      meta: {
        scope: hasTeamScope ? 'team' : 'self',
        forced_funcionario_id: forcedFuncionarioId,
      },
    });
  } catch (error) {
    if (error instanceof FrmsParameterResolutionError) {
      return c.json(
        {
          success: false,
          error: 'Configuração FRMS indisponível para a data selecionada.',
          code: error.code,
          meta: {
            scope: hasTeamScope ? 'team' : 'self',
            forced_funcionario_id: forcedFuncionarioId,
            notice: 'FRMS_CONTEXT_UNAVAILABLE',
          },
        },
        503,
      );
    }

    const logger = createLogger(c as SnapshotContext, 'FrmsOperationalSnapshot');
    logger.error('Erro ao montar snapshot operacional FRMS', toError(error));

    return c.json(
      {
        success: false,
        error: 'Erro ao montar snapshot operacional FRMS',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});


/**
 * Experimental shadow: staging and explicit tenant allowlist only. No runtime
 * score, no write, no PII returned. Protected by existing auth plus team RBAC.
 */
router.get('/ima-v3/schedule-exposure-shadow', async (c) => {
  const empresaId = getEmpresaId(c);
  if (!isImaV3StagingPreviewEnabled(c.env, empresaId)) {
    return c.json({ success: false, code: 'NOT_FOUND' }, 404);
  }
  if (!(await canSeeTeam(c))) {
    return c.json({ success: false, code: 'FRMS_TEAM_SCOPE_REQUIRED' }, 403);
  }
  const parsed = z.object({
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    funcionario_id: z.coerce.number().int().positive().safe(),
    reference_utc_offset_minutes: z.string().regex(/^[+-]?\d+$/)
      .transform(Number).pipe(z.number().int().min(-720).max(840)),
  }).safeParse({
    data_inicio: c.req.query('data_inicio'),
    data_fim: c.req.query('data_fim'),
    funcionario_id: c.req.query('funcionario_id'),
    reference_utc_offset_minutes: c.req.query('reference_utc_offset_minutes'),
  });
  if (!parsed.success) return c.json({ success: false, code: 'INVALID_SHADOW_SCOPE' }, 400);
  const { data_inicio, data_fim, funcionario_id, reference_utc_offset_minutes } = parsed.data;
  const validDay = (value: string) => {
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  };
  if (!validDay(data_inicio) || !validDay(data_fim)) {
    return c.json({ success: false, code: 'INVALID_SHADOW_DATE' }, 400);
  }
  const days = Math.round(
    (Date.parse(data_fim + 'T00:00:00Z') - Date.parse(data_inicio + 'T00:00:00Z')) / 86_400_000,
  );
  if (days < 0 || days > 6) {
    return c.json({ success: false, code: 'SHADOW_WINDOW_1_TO_7_DAYS_ONLY' }, 400);
  }
  try {
    const employee = await c.env.DB.prepare(
      'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? ' +
      'AND deleted_at IS NULL AND COALESCE(ativo, 1) = 1 LIMIT 1',
    ).bind(funcionario_id, empresaId).first<{ id: number }>();
    if (!employee?.id) {
      return c.json({ success: false, code: 'NOT_FOUND' }, 404);
    }
    const snapshot = await listFrmsOperationalSnapshot(c.env.DB, {
      empresaId,
      dataInicio: data_inicio,
      dataFim: data_fim,
      filters: { funcionario_id, include_inconsistencies: true },
    });
    const absOffset = Math.abs(reference_utc_offset_minutes);
    const offset = (reference_utc_offset_minutes < 0 ? '-' : '+') +
      String(Math.floor(absOffset / 60)).padStart(2, '0') + ':' +
      String(absOffset % 60).padStart(2, '0');
    const endExclusive = new Date(Date.parse(data_fim + 'T00:00:00Z') + 86_400_000)
      .toISOString().slice(0, 10);
    const audit = bridgeImaOperationalSnapshot({
      expectedEmpresaId: empresaId,
      expectedFuncionarioId: funcionario_id,
      snapshotRows: snapshot.items,
      windowStartAt: data_inicio + 'T00:00:00' + offset,
      windowEndAt: endExclusive + 'T00:00:00' + offset,
      referenceUtcOffsetMinutes: reference_utc_offset_minutes,
    });
    return c.json({
      success: true,
      data: audit,
      meta: {
        mode: 'EXPERIMENTAL_SHADOW_ONLY',
        physiologyValidated: false,
        writes: 0,
        civilClockAssumption: 'CALLER_SUPPLIED_FIXED_OFFSET_NOT_ZONE_VERIFIED',
      },
    });
  } catch (error) {
    if (error instanceof FrmsParameterResolutionError) {
      return c.json({ success: false, code: 'FRMS_CONTEXT_UNAVAILABLE' }, 503);
    }
    if (error instanceof Error && error.message.startsWith('IMA_')) {
      return c.json({ success: false, code: 'IMA_SHADOW_UNRESOLVED_EVIDENCE' }, 409);
    }
    const logger = createLogger(c as SnapshotContext, 'FrmsImaV3Shadow');
    logger.error('FRMS shadow preview failed', toError(error));
    return c.json({ success: false, code: 'IMA_SHADOW_UNAVAILABLE' }, 500);
  }
});


/**
 * A coarsened, fixed-window pilot of the historic data feasibility audit.
 * Strictly staging + explicit tenant allowlist + team FRMS role. All read-only.
 * Only aggregates are returned, and only when >= 10 distinct people exist.
 */
router.get('/ima-v3/cohort-readiness-shadow', async (c) => {
  const empresaId = getEmpresaId(c);
  if (!isImaV3StagingPreviewEnabled(c.env, empresaId)) {
    return c.json({ success: false, code: 'NOT_FOUND' }, 404);
  }
  if (!(await canSeeTeam(c))) {
    return c.json({ success: false, code: 'FRMS_TEAM_SCOPE_REQUIRED' }, 403);
  }

  // No configurable employees, roles, groups, dates or base filters:
  // prevents small-cell probing and arbitrary overlapping cohort comparisons.
  const fields = Object.keys(c.req.query());
  if (fields.length !== 1 || fields[0] !== 'window_days') {
    return c.json({ success: false, code: 'IMA_COHORT_FIXED_WINDOW_ONLY' }, 400);
  }
  const parsed = z.enum(['30', '60', '90']).safeParse(c.req.query('window_days'));
  if (!parsed.success) {
    return c.json({ success: false, code: 'IMA_COHORT_FIXED_WINDOW_ONLY' }, 400);
  }

  try {
    const window = lastClosedMonthWindow(new Date(), Number(parsed.data) as 30 | 60 | 90);
    const rows = await loadImaCohortEvidenceRows(
      c.env.DB, empresaId, window.startDate, window.endDate,
    );
    const report = auditImaCohortEvidence({
      expectedEmpresaId: empresaId,
      startDate: window.startDate,
      endDate: window.endDate,
      rows,
      boundaryProvenanceUnavailable: true,
    });
    return c.json({
      success: true,
      data: report,
      meta: {
        mode: 'EXPERIMENTAL_COHORT_SHADOW_ONLY',
        source: 'CHECKIN_OR_JOURNEY_DAYS_ONLY',
        suppressedSmallCohorts: true,
        dataCompleteness: 'PARTIAL_ACTIVITY_BASED_DENOMINATOR',
        writes: 0,
        clinicalValidation: false,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('IMA_')) {
      return c.json({ success: false, code: 'IMA_COHORT_EVIDENCE_RECONCILIATION_REQUIRED' }, 409);
    }
    // No identifiers or raw SQL errors are exported to the browser.
    return c.json({ success: false, code: 'IMA_COHORT_UNAVAILABLE' }, 503);
  }
});

export default router;
