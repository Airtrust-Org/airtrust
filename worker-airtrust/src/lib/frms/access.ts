import { normalizeAirtrustRole } from '../../utils/role-resolution';

const FRMS_TEAM_SCOPE_ROLES = new Set([
  'ADMINISTRADOR',
  'ADMIN',
  'GESTOR',
  'MANAGER',
  'COORDENACAO',
  'COORDENADOR',
  'COORDINATOR',
]);

export function canSeeFrmsTeamScope(role: unknown): boolean {
  const normalized = normalizeAirtrustRole(role);
  return FRMS_TEAM_SCOPE_ROLES.has(normalized);
}
