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
import { sincronizarCheckinComFrms } from '../lib/frms/fadiga-frms-sync';
import { createLogger, toError } from '../utils/logger';

type SnapshotContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

const ReconcileSchema = z.object({
  data_operacional: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  funcionario_ids: z.array(z.number().int().positive()).min(1).max(50),
});

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

router.post('/operational-snapshot/reconcile-checkins', async (c) => {
  const parsed = ReconcileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten() }, 400);
  }

  const empresaId = getEmpresaId(c);
  const hasTeamScope = await canSeeTeam(c);
  let funcionarioIds = [...new Set(parsed.data.funcionario_ids)];
  let forcedFuncionarioId: number | undefined;

  if (!hasTeamScope) {
    const ownFuncionarioId = await resolveOwnFuncionarioId(c, empresaId);
    if (!ownFuncionarioId) {
      return c.json({ success: false, error: 'Funcionário não encontrado para o usuário atual' }, 404);
    }
    if (funcionarioIds.some((id) => id !== ownFuncionarioId)) {
      return c.json({ success: false, error: 'Escopo de reconciliação não autorizado' }, 403);
    }
    funcionarioIds = [ownFuncionarioId];
    forcedFuncionarioId = ownFuncionarioId;
  }

  const placeholders = funcionarioIds.map(() => '?').join(', ');
  const candidates = await c.env.DB.prepare(
    `SELECT ch.id,
            CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,
            ch.horas_sono,
            ch.wake_time,
            ch.jornada_inicio_prevista
       FROM frms_fadiga_checkin ch
       JOIN funcionarios f
         ON f.id = ch.funcionario_id
        AND f.empresa_id = ch.empresa_id
        AND f.deleted_at IS NULL
      WHERE ch.empresa_id = ?
        AND ch.data_checkin = ?
        AND ch.deleted_at IS NULL
        AND ch.funcionario_id IN (${placeholders})
        AND ch.jornada_inicio_prevista IS NOT NULL
        AND TRIM(ch.jornada_inicio_prevista) <> ''
        AND ch.wake_time IS NOT NULL
        AND TRIM(ch.wake_time) <> ''
        AND ch.horas_sono > 0
        AND ch.horas_sono <= 24
        AND NOT EXISTS (
          SELECT 1
            FROM frms_jornada j
           WHERE j.empresa_id = ch.empresa_id
             AND CAST(j.tripulante_id AS INTEGER) = ch.funcionario_id
             AND j.data = ch.data_checkin
             AND j.deleted_at IS NULL
        )
      ORDER BY ch.funcionario_id ASC`,
  )
    .bind(empresaId, parsed.data.data_operacional, ...funcionarioIds)
    .all<{
      id: string;
      funcionario_id: number;
      horas_sono: number;
      wake_time: string;
      jornada_inicio_prevista: string;
    }>();

  let reconciled = 0;
  let unresolved = 0;
  const logger = createLogger(c as SnapshotContext, 'FrmsOperationalSnapshotReconcile');

  for (const row of candidates.results ?? []) {
    try {
      const result = await sincronizarCheckinComFrms(
        c.env.DB,
        row.id,
        Number(row.funcionario_id),
        parsed.data.data_operacional,
        Number(row.horas_sono),
        empresaId,
        row.wake_time,
        row.jornada_inicio_prevista,
      );
      if (result.sincronizado) reconciled += 1;
      else unresolved += 1;
    } catch (error) {
      unresolved += 1;
      logger.error('Falha ao reconciliar check-in FRMS completo sem jornada', toError(error), {
        funcionarioId: Number(row.funcionario_id),
        dataOperacional: parsed.data.data_operacional,
      });
    }
  }

  return c.json({
    success: true,
    data: {
      requested: funcionarioIds.length,
      eligible: candidates.results?.length ?? 0,
      reconciled,
      unresolved,
    },
    meta: {
      scope: hasTeamScope ? 'team' : 'self',
      forced_funcionario_id: forcedFuncionarioId,
    },
  });
});

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
      data: result.items,
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

export default router;
