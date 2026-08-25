/**
 * Backup & Restore API
 *
 * Intentionally disabled until a tenant-scoped design is implemented.
 *
 * The previous file kept full cross-tenant export/restore/delete handlers below
 * an unconditional 503 middleware. Although unreachable, that destructive code
 * remained part of the runtime module and could be re-enabled accidentally by
 * removing one guard. The unsafe handlers have been removed from this route.
 *
 * Governed environment-level D1 backups used by release workflows are separate
 * from this application API and remain the supported backup mechanism.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';

const backup = new Hono<{ Bindings: Env }>();

backup.use('*', auth());
backup.use('*', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');

  return c.json(
    {
      success: false,
      error:
        'Backup temporariamente desativado para implementação de isolamento de tenant. Nenhum dado foi exportado.',
      code: 'BACKUP_DISABLED_PENDING_TENANT_ISOLATION',
      details:
        'Use somente os mecanismos governados de backup do ambiente. A API será reintroduzida apenas com escopo de tenant explícito e testes de isolamento.',
    },
    503,
  );
});

export default backup;
