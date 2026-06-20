import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import {
  listFrmsOperationalSnapshot,
  type FrmsOperationalSnapshotFilters,
  type FrmsOperationalSnapshotItem,
} from '../lib/frms/operational-snapshot';
import { canSeeFrmsTeamScope } from '../lib/frms/access';
import { buildDecisaoFields } from '../lib/frms/decision-policy';

type ProjectionContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

const querySchema = z
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

async function resolveOwnFuncionarioId(
  c: ProjectionContext,
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

function buildProjectionItems(items: FrmsOperationalSnapshotItem[]): FrmsOperationalSnapshotItem[] {
  return items.map((item) => {
    const projected = {
      ...item,
      natureza_dado: 'PROJECAO' as const,
    };
    return {
      ...projected,
      ...buildDecisaoFields(projected, { naturezaDado: 'PROJECAO' }),
    };
  });
}

router.get('/projection', async (c) => {
  const parsed = querySchema.safeParse({
    data_inicio: c.req.query('data_inicio'),
    data_fim: c.req.query('data_fim'),
    funcionario_id: c.req.query('funcionario_id'),
    base: c.req.query('base'),
    aeronave: c.req.query('aeronave'),
    status: c.req.query('status'),
    include_inconsistencies: c.req.query('include_inconsistencies'),
  });

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' }, 400);
  }

  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env; Variables: Variables }>);
  const filters: FrmsOperationalSnapshotFilters = {
    funcionario_id: parsed.data.funcionario_id,
    base: parsed.data.base,
    aeronave: parsed.data.aeronave,
    status: parsed.data.status
      ? parsed.data.status
          .split(',')
          .map((status) => status.trim().toUpperCase())
          .filter(Boolean)
      : undefined,
    include_inconsistencies: parsed.data.include_inconsistencies,
  };

  const hasTeamScope = canSeeFrmsTeamScope(c.get('userRole'));
  let forcedFuncionarioId: number | undefined;
  if (!hasTeamScope) {
    const ownFuncionarioId = await resolveOwnFuncionarioId(c, empresaId);
    if (!ownFuncionarioId) {
      return c.json(
        { success: false, error: 'Funcionario nao encontrado para o usuario atual' },
        404,
      );
    }
    filters.funcionario_id = ownFuncionarioId;
    forcedFuncionarioId = ownFuncionarioId;
  }

  const snapshot = await listFrmsOperationalSnapshot(c.env.DB, {
    empresaId,
    dataInicio: parsed.data.data_inicio,
    dataFim: parsed.data.data_fim,
    filters,
  });

  return c.json({
    success: true,
    data: buildProjectionItems(snapshot.items),
    summary: snapshot.summary,
    meta: {
      scope: hasTeamScope ? 'team' : 'self',
      forced_funcionario_id: forcedFuncionarioId,
      projection_mode: true,
      writes: 0,
    },
  });
});

export { buildProjectionItems };
export default router;
