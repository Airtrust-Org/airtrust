// src/react-app/pages/escalas/utils/ordenarEscalas.ts
//
// Pure helpers for the Escalas listing (layout/UX finding N-08):
//  - deterministic chronological ordering of existing month schedules;
//  - derivation of the "próximas competências" creation slots, kept strictly
//    separate from the grid of existing schedules.
//
// No data/business-rule changes: these only reorder and partition what the
// API already returns.

export interface CompetenciaTemporal {
  mes: number;
  ano: number;
}

/**
 * Ordena competências cronologicamente (ano e, em seguida, mês), de forma
 * estável e puramente numérica — nunca lexicográfica. Não muta o array
 * recebido.
 *
 * Comportamento previsível com múltiplos anos: dez/2025 vem antes de jan/2026.
 */
export function ordenarEscalasCronologicamente<T extends CompetenciaTemporal>(
  escalas: readonly T[],
): T[] {
  return [...escalas].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

/**
 * Retorna os próximos meses (1..12) do ano informado que ainda não possuem
 * escala, limitado a `limite`. Alimenta a seção separada de criação, garantindo
 * que a ação `Criar mês` nunca seja renderizada como se fosse uma competência
 * já existente.
 */
export function proximasCompetenciasSemEscala(
  escalas: readonly CompetenciaTemporal[],
  ano: number,
  limite = 3,
): number[] {
  const mesesComEscala = new Set(
    escalas.filter((escala) => escala.ano === ano).map((escala) => escala.mes),
  );
  return Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((mes) => !mesesComEscala.has(mes))
    .slice(0, Math.max(0, limite));
}
