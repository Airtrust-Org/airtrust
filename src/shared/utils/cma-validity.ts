/**
 * Validade do CMA por idade (fonte única).
 *
 * Regra aprovada pelo proprietário:
 *  - 12 meses para tripulante com menos de 60 anos na data de realização;
 *  - 6 meses se o tripulante tem 60 anos ou mais na data de realização
 *    (aniversário de 60 anos no próprio dia da realização já conta como 60);
 *  - sem data de nascimento válida: 12 meses COM sinalização
 *    (`birthDateMissing`/`basis = 'BIRTH_DATE_MISSING'`) — nunca inventar idade.
 *
 * A idade é calculada por componentes civis (ano/mês/dia), sem fuso. Quem
 * nasceu em 29/02 completa anos em 01/03 nos anos não bissextos.
 * O vencimento em si segue a regra única "no dia" (calcularDataVencimento).
 *
 * @module shared/utils/cma-validity (compartilhado Worker + frontend)
 */

import { parseCivilDay } from './validade-meses';

export const CMA_CODE = 'CMA';
export const CMA_VALIDITY_MONTHS_DEFAULT = 12;
export const CMA_VALIDITY_MONTHS_AGE_60_PLUS = 6;
export const CMA_AGE_THRESHOLD_YEARS = 60;

export type CmaValidityBasis = 'UNDER_60' | 'AGE_60_PLUS' | 'BIRTH_DATE_MISSING';

export interface CmaValidity {
  months: 6 | 12;
  basis: CmaValidityBasis;
  /** Idade completa na data de realização; null quando não calculável. */
  ageYears: number | null;
  /** true quando a data de nascimento ausente/inválida forçou o padrão de 12 meses. */
  birthDateMissing: boolean;
  /** Mensagem de sinalização para o usuário/auditoria (null quando não há alerta). */
  warning: string | null;
}

export function isCmaCode(code: unknown): boolean {
  return (
    String(code ?? '')
      .trim()
      .toUpperCase() === CMA_CODE
  );
}

/** Idade completa em anos em `referenceDay`; null se alguma data for inválida ou a referência anteceder o nascimento. */
export function completedAgeYears(birthDay: unknown, referenceDay: unknown): number | null {
  const birth = parseCivilDay(birthDay);
  const ref = parseCivilDay(referenceDay);
  if (!birth || !ref) return null;
  let age = ref.year - birth.year;
  if (ref.month < birth.month || (ref.month === birth.month && ref.day < birth.day)) age -= 1;
  return age >= 0 ? age : null;
}

export function resolveCmaValidity(params: {
  /** Data de realização/conclusão (YYYY-MM-DD). */
  dataRealizacao: unknown;
  /** funcionarios.nascimento (YYYY-MM-DD). */
  dataNascimento: unknown;
}): CmaValidity {
  const age = completedAgeYears(params.dataNascimento, params.dataRealizacao);
  if (age === null) {
    return {
      months: CMA_VALIDITY_MONTHS_DEFAULT,
      basis: 'BIRTH_DATE_MISSING',
      ageYears: null,
      birthDateMissing: true,
      warning:
        'CMA calculado com validade padrão de 12 meses: data de nascimento do tripulante ausente ou inválida. Cadastre a data de nascimento para aplicar a regra de 6 meses a partir dos 60 anos.',
    };
  }
  if (age >= CMA_AGE_THRESHOLD_YEARS) {
    return {
      months: CMA_VALIDITY_MONTHS_AGE_60_PLUS,
      basis: 'AGE_60_PLUS',
      ageYears: age,
      birthDateMissing: false,
      warning: null,
    };
  }
  return {
    months: CMA_VALIDITY_MONTHS_DEFAULT,
    basis: 'UNDER_60',
    ageYears: age,
    birthDateMissing: false,
    warning: null,
  };
}

/** Aviso quando o CMA caiu no padrão de 12 meses por falta de data de nascimento (null caso contrário). */
export function cmaValidityWarning(params: {
  codigo: unknown;
  dataRealizacao: unknown;
  dataNascimento: unknown;
}): string | null {
  if (!isCmaCode(params.codigo)) return null;
  return resolveCmaValidity({
    dataRealizacao: params.dataRealizacao,
    dataNascimento: params.dataNascimento,
  }).warning;
}
