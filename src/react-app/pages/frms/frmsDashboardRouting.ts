import type { FrmsOperationalAccess } from '@/react-app/hooks/useFrmsOperationalAccess';

export type FrmsManagementArea = 'operacoes' | 'manutencao';

export function isTenantAdminRole(role: string | null | undefined): boolean {
  const normalized = String(role || '').trim().toUpperCase();
  return normalized === 'ADMIN' || normalized === 'ADMINISTRADOR';
}

export function canManageFrmsOperations(
  access: Pick<
    FrmsOperationalAccess,
    'administrative_role' | 'domains' | 'can_manage_maintenance'
  >,
): boolean {
  return (
    isTenantAdminRole(access.administrative_role) ||
    access.domains.includes('OPERACOES') ||
    access.domains.includes('FRMS') ||
    !access.can_manage_maintenance
  );
}

export function resolveFrmsManagementArea(params: {
  requestedArea: string | null;
  canManageOperations: boolean;
  canManageMaintenance: boolean;
}): FrmsManagementArea {
  const { requestedArea, canManageOperations, canManageMaintenance } = params;

  if (requestedArea === 'manutencao' && canManageMaintenance) return 'manutencao';
  if (requestedArea === 'operacoes' && canManageOperations) return 'operacoes';
  if (canManageOperations) return 'operacoes';
  if (canManageMaintenance) return 'manutencao';
  return 'operacoes';
}
