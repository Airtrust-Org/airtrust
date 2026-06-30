function normalizeRoleToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

const OPERATIONAL_ROLE_TOKENS = new Set([
  'PILOTO',
  'COPILOTO',
  'COMANDANTE',
  'PIC',
  'SIC',
  'TRIPULANTE',
]);

const NON_OPERATIONAL_ROLE_TOKENS = [
  'MECANIC',
  'MANUTEN',
  'TECNIC',
  'ADMIN',
  'INSTRUTOR MANUTEN',
];

export interface OperationalCrewClassification {
  normalizedFuncao: string | null;
  normalizedCargo: string | null;
  isOperational: boolean;
  exclusionReason: 'MISSING_ROLE' | 'NON_OPERATIONAL_ROLE' | null;
}

export function classifyOperationalCrewRole(
  funcao: string | null | undefined,
  cargo: string | null | undefined,
): OperationalCrewClassification {
  const normalizedFuncao = normalizeRoleToken(funcao);
  const normalizedCargo = normalizeRoleToken(cargo);
  const values = [normalizedFuncao, normalizedCargo].filter((value): value is string => Boolean(value));

  if (values.length === 0) {
    return {
      normalizedFuncao,
      normalizedCargo,
      isOperational: false,
      exclusionReason: 'MISSING_ROLE',
    };
  }

  if (
    values.some((value) => NON_OPERATIONAL_ROLE_TOKENS.some((token) => value.includes(token)))
  ) {
    return {
      normalizedFuncao,
      normalizedCargo,
      isOperational: false,
      exclusionReason: 'NON_OPERATIONAL_ROLE',
    };
  }

  if (values.some((value) => OPERATIONAL_ROLE_TOKENS.has(value))) {
    return {
      normalizedFuncao,
      normalizedCargo,
      isOperational: true,
      exclusionReason: null,
    };
  }

  return {
    normalizedFuncao,
    normalizedCargo,
    isOperational: false,
    exclusionReason: 'NON_OPERATIONAL_ROLE',
  };
}

export function isOperationalCrewRole(
  funcao: string | null | undefined,
  cargo: string | null | undefined,
): boolean {
  return classifyOperationalCrewRole(funcao, cargo).isOperational;
}
