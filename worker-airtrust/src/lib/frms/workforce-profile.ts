export type FrmsWorkforceProfile = 'flight' | 'maintenance' | 'other';

function normalizeWorkforceLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function isMaintenanceLabel(value: string): boolean {
  return /(^|\s|[-/])(MECANICO|INSPETOR)(\s|$|[-/])/.test(value);
}

function isFlightLabel(value: string): boolean {
  return /(^|\s|[-/])(PILOTO|COPILOTO|COMANDANTE)(\s|$|[-/])/.test(value);
}

/**
 * Resolve o perfil FRMS a partir do cargo funcional.
 *
 * Regra de negócio: MECÂNICO e INSPETOR pertencem ao perfil de manutenção.
 * `funcao` só é usada como compatibilidade quando `cargo` está vazio; um cargo
 * explícito nunca é sobrescrito por uma função genérica/legada.
 */
export function resolveFrmsWorkforceProfile(
  cargo: unknown,
  funcao?: unknown,
): FrmsWorkforceProfile {
  const normalizedCargo = normalizeWorkforceLabel(cargo);
  const source = normalizedCargo || normalizeWorkforceLabel(funcao);

  if (isMaintenanceLabel(source)) return 'maintenance';
  if (isFlightLabel(source)) return 'flight';
  return 'other';
}

export function isMaintenanceCargo(cargo: unknown, funcao?: unknown): boolean {
  return resolveFrmsWorkforceProfile(cargo, funcao) === 'maintenance';
}
