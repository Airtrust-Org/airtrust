/**
 * BOA incident management: only dedicated BOA_* events within manager's tenant
 * and authorized sectors. Does not expose personal/clinical notes in reads.
 * The existing AirTrust alert table and audit service remain canonical.
 */
import { buildFuncionarioScopeWhere, type EmployeeSectorAccess } from '../../services/employee-sector-access';

export interface BombeirosManagedCase {
  id: string;
  resolvido: number;
  notas_resolucao: string | null;
  created_at: string | null;
  resolvido_em: string | null;
}

export function isBombeirosManagerTenant(tenant: {
  empresaId: number; empresaCodigo: string; role: string;
} | null | undefined): boolean {
  return Boolean(tenant && Number.isSafeInteger(tenant.empresaId)
    && tenant.empresaId > 0 && tenant.empresaId !== 6
    && tenant.empresaCodigo === 'bombeiros' && tenant.role === 'manager');
}

/** Only a manager with explicit operational-sector bindings may manage a case. */
export async function loadBombeirosManagerCase(
  db: D1Database,
  empresaId: number,
  alertId: string,
  access: EmployeeSectorAccess,
): Promise<BombeirosManagedCase | null> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || empresaId === 6
    || access.mode !== 'restricted' || access.setorIds.length === 0
    || !alertId || alertId.length > 120) return null;
  const scope = buildFuncionarioScopeWhere(access, 'f');
  if (scope.bindings.length === 0) return null;
  const result = await db.prepare(
    `SELECT a.id, a.resolvido, a.notas_resolucao, a.created_at, a.resolvido_em
       FROM frms_alerta a
       JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
      WHERE a.id = ?
        AND a.deleted_at IS NULL
        AND a.tipo_limite LIKE 'BOA_%'
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND ${scope.clause}
      LIMIT 1`,
  ).bind(alertId, empresaId, ...scope.bindings).first<BombeirosManagedCase>();
  return result && result.id === alertId ? result : null;
}
