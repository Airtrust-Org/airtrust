import { NIVEIS_ALERTA, type NivelAlerta } from './types';

/**
 * Um alerta vira caso quando a coordenação interage com ele (ciência,
 * tratamento ou encerramento). O recálculo da jornada não pode apagá-lo nem
 * recriar a mesma condição como caso novo; só uma piora de nível gera alerta.
 */
export interface PreservedCaseAlert {
  tipo_limite: string;
  nivel: string;
}

export const ENGAGED_CASE_SQL =
  '(COALESCE(resolvido, 0) = 1 OR COALESCE(visualizado, 0) = 1 OR notas_resolucao IS NOT NULL)';

export function nivelAlertaRank(nivel: string): number {
  return NIVEIS_ALERTA.indexOf(nivel as NivelAlerta);
}

export function alertsNotCoveredByCases<T extends { tipo_limite: string; nivel: string }>(
  generated: readonly T[],
  preserved: readonly PreservedCaseAlert[],
): T[] {
  return generated.filter((alerta) => !preserved.some((caso) =>
    caso.tipo_limite === alerta.tipo_limite &&
    nivelAlertaRank(caso.nivel) >= nivelAlertaRank(alerta.nivel)));
}
