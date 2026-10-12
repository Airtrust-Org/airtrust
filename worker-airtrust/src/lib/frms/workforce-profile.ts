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
  return /(^|\s|[-/])(PILOTO|COPILOTO|COMANDANTE|OPERADOR AEROTATICO|TRIPULANTE AEROTATICO|TRIPULANTE OPERACIONAL|TRIPULANTE DE RESGATE AEREO|OPERADOR DE GUINCHO|MEDICO DE BORDO)(\s|$|[-/])/.test(value);
}

/** Bombeiro militar é posto/cargo genérico; só a função aeronáutica explícita resolve flight. */
function isGenericFirefighterCargo(value: string): boolean {
  return /^(BOMBEIRO MILITAR|MILITAR DO CORPO DE BOMBEIROS|OFICIAL BOMBEIRO MILITAR)$/.test(value);
}

/**
 * Resolve o perfil FRMS a partir do cargo funcional.
 *
 * Regra de negócio: MECÂNICO e INSPETOR pertencem ao perfil de manutenção.
 * `funcao` só é usada quando `cargo` está vazio, exceto nos cargos militares
 * genéricos com função aeronáutica explícita; cargos civis continuam prevalecendo.
 */
export function resolveFrmsWorkforceProfile(
  cargo: unknown,
  funcao?: unknown,
): FrmsWorkforceProfile {
  const normalizedCargo = normalizeWorkforceLabel(cargo);
  const source = normalizedCargo || normalizeWorkforceLabel(funcao);

  if (isMaintenanceLabel(source)) return 'maintenance';
  if (isFlightLabel(source)) return 'flight';

  // Corporações militares costumam registrar posto genérico no cargo e a função
  // aeronáutica real em funcao. Não transferir essa exceção para cargos civis.
  if (normalizedCargo && isGenericFirefighterCargo(normalizedCargo) &&
      isFlightLabel(normalizeWorkforceLabel(funcao))) return 'flight';
  return 'other';
}

export function isMaintenanceCargo(cargo: unknown, funcao?: unknown): boolean {
  return resolveFrmsWorkforceProfile(cargo, funcao) === 'maintenance';
}
