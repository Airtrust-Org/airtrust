/** Formata número no padrão brasileiro: 12345.7 → 12.345,7 */
export function formatBrNumber(value: number, decimals = 0): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Formata horas de voo no padrão brasileiro */
export function formatFH(value: number): string {
  return formatBrNumber(value, 1);
}

/** Formata ciclos no padrão brasileiro */
export function formatCiclos(value: number): string {
  return formatBrNumber(value, 0);
}

/** Formata tipo de controle para exibição amigável */
export function formatTipoControle(tipo: string): string {
  const labels: Record<string, string> = {
    FH: 'Horas de Voo (FH)',
    HT: 'Horas de Voo (FH)',
    FC: 'Ciclos de Voo (FC)',
    CY: 'Ciclos',
    DY: 'Dias Calendário',
    MO: 'Meses',
    LD: 'Pousos',
    CA: 'Calendário',
  };
  return labels[tipo] || tipo;
}
