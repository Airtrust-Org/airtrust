import type { Context, Env as HonoEnv } from 'hono';
import { getEmpresaId } from '../middleware/tenant';
import { AppError } from './errors';

/**
 * Fail-closed tenant resolution shared by every business domain.
 *
 * Moved out of `routes/escalas-shared.ts` so that LMS, aeronaves, middleware
 * and other domains do not depend on Escalas just to read the request tenant.
 * `routes/escalas-shared.ts` re-exports these for its own sub-modules.
 *
 * Not the same contract as `getEmpresaIdSafe` in `utils/tenant-context.ts`,
 * which returns `null` instead of throwing. Choose deliberately.
 */

/**
 * Wrapper seguro para obter empresaId.
 * auth() seta c.set('empresaId', ...) diretamente, enquanto
 * getEmpresaId() busca via tenantContext (setado por middleware separado).
 * Este wrapper tenta ambos os caminhos e lança 401 se nenhum for válido.
 */
export function getEmpresaIdSafe<E extends HonoEnv>(c: Context<E>): number {
  let empresaId: number | undefined;

  try {
    empresaId = getEmpresaId(c);
  } catch {
    const raw = c.get('empresaId' as never) as unknown;
    empresaId = typeof raw === 'string' ? Number(raw) : (raw as number | undefined);
  }

  if (!Number.isFinite(empresaId) || Number(empresaId) <= 0) {
    throw new AppError('Empresa não identificada no contexto da requisição', 401, 'TENANT_REQUIRED');
  }

  return Number(empresaId);
}

export function getEmpresaIdOptional<E extends HonoEnv>(c: Context<E>): number | undefined {
  try {
    return getEmpresaId(c);
  } catch {
    const raw = c.get('empresaId' as never) as unknown;
    const parsed = typeof raw === 'string' ? Number(raw) : (raw as number);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
