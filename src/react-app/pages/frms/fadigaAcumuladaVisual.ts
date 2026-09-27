export type FadigaAcumuladaAlerta = 'normal' | 'verde' | 'amarelo' | 'vermelho' | 'incompleto';

export type FadigaAcumuladaVisualMeta = {
  label: 'Normal' | 'Atenção' | 'Alerta' | 'Crítico' | 'Dados incompletos';
  barClass: string;
  surfaceClass: string;
  textClass: string;
  dotClass: string;
};

/**
 * O backend mantém os identificadores históricos `verde/amarelo/vermelho`.
 * A apresentação NÃO deve interpretar o nome bruto como a cor da UI:
 * Os identificadores históricos são apenas níveis semânticos; as faixas numéricas
 * vêm dos thresholds governados retornados pelo backend e não são definidas aqui.
 */
const META: Record<FadigaAcumuladaAlerta, FadigaAcumuladaVisualMeta> = {
  normal: {
    label: 'Normal',
    barClass: 'bg-emerald-500',
    surfaceClass:
      'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  verde: {
    label: 'Atenção',
    barClass: 'bg-amber-500',
    surfaceClass: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20',
    textClass: 'text-amber-700 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  amarelo: {
    label: 'Alerta',
    barClass: 'bg-orange-500',
    surfaceClass:
      'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20',
    textClass: 'text-orange-700 dark:text-orange-300',
    dotClass: 'bg-orange-500',
  },
  vermelho: {
    label: 'Crítico',
    barClass: 'bg-red-500',
    surfaceClass: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20',
    textClass: 'text-red-700 dark:text-red-300',
    dotClass: 'bg-red-500',
  },
  incompleto: {
    label: 'Dados incompletos',
    barClass: 'bg-slate-400',
    surfaceClass: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
    textClass: 'text-slate-600 dark:text-slate-300',
    dotClass: 'bg-slate-400',
  },
};

export function getFadigaAcumuladaVisual(alerta: string): FadigaAcumuladaVisualMeta {
  if (alerta === 'verde' || alerta === 'amarelo' || alerta === 'vermelho' || alerta === 'incompleto') {
    return META[alerta];
  }
  return META.normal;
}

export function buildFadigaAcumuladaLegenda(thresholds: { verde: number; amarelo: number; vermelho: number }) {
  return [
    { alerta: 'normal' as const, faixa: `<${thresholds.verde}%` },
    { alerta: 'verde' as const, faixa: `≥${thresholds.verde}%` },
    { alerta: 'amarelo' as const, faixa: `≥${thresholds.amarelo}%` },
    { alerta: 'vermelho' as const, faixa: `≥${thresholds.vermelho}%` },
  ];
}
