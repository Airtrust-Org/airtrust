import { isPrimaryAdmin } from './development-module-nav';

export type HomeProfile =
  | 'PRIMARY_ADMIN_DASHBOARD'
  | 'MANAGER_FUNCIONARIOS'
  | 'STUDENT_MANUTENCAO'
  | 'STUDENT_TRIPULACAO'
  | 'STUDENT_ADMINISTRATIVO'
  | 'STUDENT_DEFAULT'
  | 'DEFAULT_FUNCIONARIOS';

export interface HomeProfileUser {
  email?: string | null;
  role?: string | null;
  funcionario_id?: number | null;
}

export interface HomeProfileFuncionarioContext {
  id?: number | null;
  funcao?: string | null;
  cargo?: string | null;
  setor?: string | null;
  setor_id?: number | null;
}

const MANAGER_ROLES = new Set(['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER']);
const STUDENT_LIKE_ROLES = new Set([
  'ALUNO',
  'STUDENT',
  'INSTRUTOR',
  'INSTRUCTOR',
  'USUARIO',
  'USER',
]);

const MAINTENANCE_KEYWORDS = [
  'MRO',
  'MANUTENCAO',
  'AERONAVEGABILIDADE',
  'OFICINA',
  'MECANICO',
];

const FLIGHT_CREW_KEYWORDS = [
  'TRIPULACAO',
  'OPERACOES AEREAS',
  'OPERACOES DE VOO',
  'PILOTO',
  'COPILOTO',
  'COMISSARIO',
  'COMISSARIA',
];

const ADMINISTRATIVE_KEYWORDS = [
  'ADMINISTRATIVO',
  'ADMINISTRACAO',
  'FINANCEIRO',
  'RH',
  'RECURSOS HUMANOS',
  'COMERCIAL',
  'JURIDICO',
  'SUPRIMENTOS',
  'COMPRAS',
];

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getContextTokens(
  funcionario: HomeProfileFuncionarioContext | null | undefined,
): string[] {
  if (!funcionario) return [];

  return [funcionario.setor, funcionario.funcao, funcionario.cargo]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function matchesContext(
  funcionario: HomeProfileFuncionarioContext | null | undefined,
  keywords: string[],
): boolean {
  const tokens = getContextTokens(funcionario);
  return tokens.some((token) => keywords.some((keyword) => token.includes(keyword)));
}

export function normalizeSetor(setor: string | null | undefined): string {
  return normalizeText(setor);
}

export function isMaintenanceContext(
  funcionario: HomeProfileFuncionarioContext | null | undefined,
): boolean {
  return matchesContext(funcionario, MAINTENANCE_KEYWORDS);
}

export function isFlightCrewContext(
  funcionario: HomeProfileFuncionarioContext | null | undefined,
): boolean {
  return matchesContext(funcionario, FLIGHT_CREW_KEYWORDS);
}

export function isAdministrativeContext(
  funcionario: HomeProfileFuncionarioContext | null | undefined,
): boolean {
  return matchesContext(funcionario, ADMINISTRATIVE_KEYWORDS);
}

export function isStudentLikeHomeRole(role: string | null | undefined): boolean {
  return STUDENT_LIKE_ROLES.has(normalizeText(role));
}

export function resolveHomeProfile(
  user: HomeProfileUser | null | undefined,
  funcionario: HomeProfileFuncionarioContext | null | undefined,
): HomeProfile {
  if (isPrimaryAdmin(user)) {
    return 'PRIMARY_ADMIN_DASHBOARD';
  }

  const role = normalizeText(user?.role);
  if (MANAGER_ROLES.has(role)) {
    return 'MANAGER_FUNCIONARIOS';
  }

  if (isStudentLikeHomeRole(role)) {
    if (isMaintenanceContext(funcionario)) return 'STUDENT_MANUTENCAO';
    if (isFlightCrewContext(funcionario)) return 'STUDENT_TRIPULACAO';
    if (isAdministrativeContext(funcionario)) return 'STUDENT_ADMINISTRATIVO';
    return 'STUDENT_DEFAULT';
  }

  return 'DEFAULT_FUNCIONARIOS';
}

export function resolveHomePath(profile: HomeProfile): string {
  switch (profile) {
    case 'PRIMARY_ADMIN_DASHBOARD':
      return '/';
    case 'MANAGER_FUNCIONARIOS':
    case 'DEFAULT_FUNCIONARIOS':
      return '/funcionarios';
    default:
      return '/home';
  }
}
