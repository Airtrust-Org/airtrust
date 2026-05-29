import { normalizeAirtrustRole } from './role-resolution';

export type FichaScope =
  | 'FULL_ACCESS'
  | 'INSTRUTOR_OR_ALUNO'
  | 'ALUNO_PENDING_SIGNATURE'
  | 'NO_ACCESS';

export function normalizeFichaRole(role: unknown): string {
  const normalized = normalizeAirtrustRole(role);
  if (normalized === 'COMPLIANCE') return 'GESTOR';
  if (normalized === 'EDITOR') return 'USUARIO';
  return normalized;
}

export function resolveFichaScope(role: unknown): FichaScope {
  const normalized = normalizeFichaRole(role);

  if (['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'COMPLIANCE'].includes(normalized)) {
    return 'FULL_ACCESS';
  }

  if (normalized === 'INSTRUTOR') {
    return 'INSTRUTOR_OR_ALUNO';
  }

  if (normalized === 'ALUNO' || normalized === 'USUARIO') {
    return 'ALUNO_PENDING_SIGNATURE';
  }

  return 'NO_ACCESS';
}
