import type { Context } from 'hono';
import type { Env } from '../types';

/**
 * HTTP-level guard (returns a Response) for destructive simulator operations.
 * Lives in routes/ because it depends on the HTTP framework; the shared simulator
 * domain helpers are in services/simuladores/shared.
 */
export function requireAdminForDelete(c: Context<{ Bindings: Env }>): Response | null {
  const userRole: unknown = c.get('userRole' as never);
  const normalizedRole =
    typeof userRole === 'string' ? userRole.toLowerCase() : String(userRole || '').toLowerCase();

  const canDelete = ['admin', 'administrador', 'gestor', 'manager'].includes(normalizedRole);

  if (!canDelete) {
    return c.json(
      {
        success: false,
        error:
          'Acesso negado. Apenas gestores e administradores podem excluir registros de simuladores.',
      },
      403,
    );
  }

  return null;
}
