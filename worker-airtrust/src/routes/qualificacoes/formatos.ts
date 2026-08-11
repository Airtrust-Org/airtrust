/**
 * Legacy qualification-format surface.
 *
 * `formato` was removed from the functional qualification classification
 * contract. The route remains mounted temporarily so old clients receive an
 * explicit, authenticated retirement response instead of silently creating
 * new divergent taxonomy. Physical columns/tables are retained only for
 * read-only diagnosis, rollback evidence and a later governed Schema V2
 * cleanup after reconciliation proves zero references.
 */

import { Hono, type Context } from 'hono';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getEmpresaId } from '../../middleware/tenant';

const router = new Hono<{ Bindings: Env }>();

function retired(c: Context<{ Bindings: Env }>) {
  // Resolve tenant even for the retirement response so every authenticated
  // surface remains fail-closed and satisfies the tenant-boundary contract.
  getEmpresaId(c);
  return c.json(
    {
      success: false,
      error: 'Formato de qualificação foi aposentado; use categoria_id',
      code: 'QUALIFICATION_FORMAT_REMOVED',
    },
    410,
  );
}

router.get('/', auth(), retired);
router.get('/:id', auth(), retired);
router.post('/', auth(), requireRole('admin'), retired);
router.put('/:id', auth(), requireRole('admin'), retired);
router.delete('/:id', auth(), requireRole('admin'), retired);

export default router;
