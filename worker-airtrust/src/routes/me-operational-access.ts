/**
 * GET /api/me/operational-access
 *
 * Thin read-only wrapper around resolveOperationalAccess() for the
 * currently authenticated user. Frontend-only convenience — the backend
 * remains the sole authority; this endpoint never grants anything, it just
 * reports what assertOperationalAccess would already allow.
 */
import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { resolveOperationalAccess } from '../services/operational-domain-access';

const router = new Hono<{ Bindings: Env }>();

router.use('/*', auth());
router.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

router.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = Number((c.get as (key: string) => unknown)('userId') || 0);
  const userRole = (c.get as (key: string) => unknown)('userRole');

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });

  return c.json({
    success: true,
    data: {
      administrative_role: userRole ?? null,
      enabled: access.enabled,
      domains: access.domains,
      setor_ids: access.setorIds,
      actions: access.actions,
    },
  });
});

export default router;
