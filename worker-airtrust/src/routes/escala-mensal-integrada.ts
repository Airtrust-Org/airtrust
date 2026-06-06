import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  buildIntegratedMonthlyView,
  type IntegratedMonthlyEventSeverity,
} from '../services/escala-mensal-integrada';

const router = new Hono<{ Bindings: Env }>();

const querySchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  colaborador_id: z.string().trim().min(1).optional(),
  base_id: z.string().trim().min(1).optional(),
  funcao_id: z.string().trim().min(1).optional(),
  incluir_frms: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value !== 'false'),
  severidade: z.enum(['INFO', 'WARNING', 'CONFLICT', 'BLOCKING']).optional(),
});

router.get(
  '/visao-mensal-integrada',
  auth(),
  requireRole('admin', 'manager'),
  async (c) => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Parâmetros inválidos',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      );
    }

    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json({ success: false, error: 'Empresa não identificada' }, 401);
    }

    const data = await buildIntegratedMonthlyView({
      db: c.env.DB,
      empresaId,
      month: parsed.data.mes,
      employeeId: parsed.data.colaborador_id,
      baseId: parsed.data.base_id,
      funcaoId: parsed.data.funcao_id,
      includeFrms: parsed.data.incluir_frms,
      severity: parsed.data.severidade as IntegratedMonthlyEventSeverity | undefined,
    });

    return c.json({ success: true, data });
  },
);

export default router;
