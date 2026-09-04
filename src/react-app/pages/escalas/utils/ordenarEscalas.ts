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

export type ClassificacaoTemporal = 'passada' | 'atual' | 'futura';

/**
 * Competência (ano+mês) correspondente à data informada. Isola o único ponto
 * que depende do relógio, para que a classificação abaixo seja determinística
 * e testável sem stub de `Date` na renderização.
 */
export function competenciaAtualDoSistema(
  agora: Date = new Date(),
): CompetenciaTemporal {
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

/**
 * Classifica uma competência como passada/atual/futura comparando ANO e MÊS
 * (nunca só o número do mês):
 *  - ano diferente → decide pelo ano;
 *  - mesmo ano e mesmo mês → atual;
 *  - mesmo ano, mês diferente → decide pelo mês.
 *
 * Assim, jan/2027 visto em set/2026 é futuro, e set/2025 ou set/2027 nunca
 * são "atual".
 */
export function classificarCompetencia(
  competencia: CompetenciaTemporal,
  referencia: CompetenciaTemporal,
): ClassificacaoTemporal {
  if (competencia.ano !== referencia.ano) {
    return competencia.ano < referencia.ano ? 'passada' : 'futura';
  }
  if (competencia.mes === referencia.mes) return 'atual';
  return competencia.mes < referencia.mes ? 'passada' : 'futura';
}
