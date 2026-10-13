import { FRMS_FIREFIGHTER_AVIATION_PROFILE } from './parameter-governance';

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

/** These positions exist only under the separately approved firefighting aviation tenant. */
function isFirefighterAviationLabel(value: string): boolean {
  return /(^|\s|[-/])(OPERADOR AEROTATICO|TRIPULANTE AEROTATICO|TRIPULANTE OPERACIONAL|TRIPULANTE DE RESGATE AEREO|OPERADOR DE GUINCHO|MEDICO DE BORDO)(\s|$|[-/])/.test(value);
}

/** Bombeiro militar é posto/cargo genérico; só a função aeronáutica explícita resolve flight. */
function isGenericFirefighterCargo(value: string): boolean {
  return /^(BOMBEIRO MILITAR|MILITAR DO CORPO DE BOMBEIROS|OFICIAL BOMBEIRO MILITAR)$/.test(value);
}

/**
 * Resolve o perfil FRMS a partir do cargo funcional.
 *
 * Regra de negócio: MECÂNICO e INSPETOR pertencem ao perfil de manutenção.
 * `funcao` só é usada quando `cargo` está vazio, exceto em cargos militares
 * genéricos com função aérea explícita NO TENANT FIREFIGHTER_AVIATION.
 * Sem profileCode resolvido e autorizado no backend, não existem exceções bombeiros.
 */
export function resolveFrmsWorkforceProfile(
  cargo: unknown,
  funcao?: unknown,
  profileCode?: string | null,
): FrmsWorkforceProfile {
  const normalizedCargo = normalizeWorkforceLabel(cargo);
  const source = normalizedCargo || normalizeWorkforceLabel(funcao);

  if (isMaintenanceLabel(source)) return 'maintenance';
  if (isFlightLabel(source)) return 'flight';

  // Nunca expor capacidades específicas do bombeiro ao tenant offshore ou
  // por texto de cargo. A autorização deriva exclusivamente da atribuição
  // efetiva de perfil regulatório tenant-scoped, carregada pelo servidor.
  if (profileCode !== FRMS_FIREFIGHTER_AVIATION_PROFILE) return 'other';
  if (isFirefighterAviationLabel(source)) return 'flight';
  if (normalizedCargo && isGenericFirefighterCargo(normalizedCargo)) {
    const normalizedFuncao = normalizeWorkforceLabel(funcao);
    if (isFlightLabel(normalizedFuncao) || isFirefighterAviationLabel(normalizedFuncao)) {
      return 'flight';
    }
  }
  return 'other';
}

export function isMaintenanceCargo(cargo: unknown, funcao?: unknown): boolean {
  return resolveFrmsWorkforceProfile(cargo, funcao) === 'maintenance';
}
