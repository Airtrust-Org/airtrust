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
import { canSeeFrmsTeamScope } from '../lib/frms/access';
import { createLogger, toError } from '../utils/logger';

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

function canSeeTeam(c: SnapshotContext): boolean {
  return canSeeFrmsTeamScope(c.get('userRole'));
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

  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env; Variables: Variables }>);
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
  const hasTeamScope = canSeeTeam(c);
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
      return c.json({
        success: true,
        data: [],
        summary: {
          total_tripulantes: 0,
          total_escalados: 0,
          checkins_recebidos: 0,
          checkins_pendentes: 0,
          alertas_criticos: 0,
          alertas_atencao: 0,
          dados_estimados: 0,
          inconsistencias: 0,
          sem_fatorizacao: 0,
        },
        meta: {
          scope: hasTeamScope ? 'team' : 'self',
          forced_funcionario_id: forcedFuncionarioId,
          notice: 'FRMS_CONTEXT_UNAVAILABLE',
          message: error.message,
        },
      });
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
