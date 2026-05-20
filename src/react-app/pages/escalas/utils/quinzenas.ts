import type { QuinzenaEscala } from '../hooks/queries/useEscalasQuery';

export type QuinzenaMode = '1q' | '2q' | 'custom';

const OPERATIONAL_QUINZENA_PRESETS: Record<
  number,
  Record<string, { inicio: string; fim: string }>
> = {
  2025: {
    '12_1': { inicio: '2025-12-15', fim: '2025-12-29' },
  },
  2026: {
    '1_1': { inicio: '2025-12-30', fim: '2026-01-14' },
    '1_2': { inicio: '2026-01-15', fim: '2026-01-30' },
    '2_1': { inicio: '2026-01-31', fim: '2026-02-14' },
    '2_2': { inicio: '2026-02-15', fim: '2026-02-28' },
    '3_1': { inicio: '2026-03-01', fim: '2026-03-15' },
    '3_2': { inicio: '2026-03-16', fim: '2026-03-31' },
    '4_1': { inicio: '2026-04-01', fim: '2026-04-15' },
    '4_2': { inicio: '2026-04-16', fim: '2026-04-30' },
    '5_1': { inicio: '2026-05-01', fim: '2026-05-16' },
    '5_2': { inicio: '2026-05-17', fim: '2026-05-31' },
    '6_1': { inicio: '2026-06-01', fim: '2026-06-15' },
    '6_2': { inicio: '2026-06-16', fim: '2026-06-30' },
    '7_1': { inicio: '2026-07-01', fim: '2026-07-15' },
    '7_2': { inicio: '2026-07-16', fim: '2026-07-31' },
    '8_1': { inicio: '2026-08-01', fim: '2026-08-16' },
    '8_2': { inicio: '2026-08-17', fim: '2026-08-31' },
    '9_1': { inicio: '2026-09-01', fim: '2026-09-15' },
    '9_2': { inicio: '2026-09-16', fim: '2026-09-30' },
    '10_1': { inicio: '2026-10-01', fim: '2026-10-15' },
    '10_2': { inicio: '2026-10-16', fim: '2026-10-31' },
    '11_1': { inicio: '2026-11-01', fim: '2026-11-15' },
    '11_2': { inicio: '2026-11-16', fim: '2026-11-30' },
    '12_1': { inicio: '2026-12-01', fim: '2026-12-14' },
    '12_2': { inicio: '2026-12-15', fim: '2026-12-29' },
  },
};

export function getDefaultQuinzenaRange(ano: number, mes: number, num: 1 | 2) {
  const preset = OPERATIONAL_QUINZENA_PRESETS[ano]?.[`${mes}_${num}`];
  if (preset) {
    return preset;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  const lastDay = new Date(ano, mes, 0).getDate();
  const primeiraQuinzenaFim = Math.min(16, lastDay);
  const segundaQuinzenaInicio = Math.min(primeiraQuinzenaFim + 1, lastDay);

  if (num === 1) {
    return {
      inicio: `${ano}-${pad(mes)}-01`,
      fim: `${ano}-${pad(mes)}-${pad(primeiraQuinzenaFim)}`,
    };
  }

  return {
    inicio: `${ano}-${pad(mes)}-${pad(segundaQuinzenaInicio)}`,
    fim: `${ano}-${pad(mes)}-${pad(lastDay)}`,
  };
}

function isLegacyMonthlyGeneratorRange(quinzena: QuinzenaEscala) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const prefix = `${quinzena.ano}-${pad(quinzena.mes)}`;
  const lastDay = new Date(quinzena.ano, quinzena.mes, 0).getDate();

  if (quinzena.numero === 1) {
    return (
      quinzena.data_inicio === `${prefix}-01` &&
      (quinzena.data_fim === `${prefix}-15` || quinzena.data_fim === `${prefix}-16`)
    );
  }

  return (
    (quinzena.data_inicio === `${prefix}-16` || quinzena.data_inicio === `${prefix}-17`) &&
    quinzena.data_fim === `${prefix}-${pad(lastDay)}`
  );
}

export function normalizeLegacyQuinzena(quinzena: QuinzenaEscala): QuinzenaEscala {
  const preset = OPERATIONAL_QUINZENA_PRESETS[quinzena.ano]?.[`${quinzena.mes}_${quinzena.numero}`];
  if (!preset && !isLegacyMonthlyGeneratorRange(quinzena)) {
    return quinzena;
  }

  if (preset && quinzena.data_inicio === preset.inicio && quinzena.data_fim === preset.fim) {
    return quinzena;
  }

  if (
    preset &&
    (quinzena.data_inicio !== preset.inicio || quinzena.data_fim !== preset.fim) &&
    !isLegacyMonthlyGeneratorRange(quinzena)
  ) {
    return quinzena;
  }

  const range = getDefaultQuinzenaRange(quinzena.ano, quinzena.mes, quinzena.numero as 1 | 2);
  return {
    ...quinzena,
    data_inicio: range.inicio,
    data_fim: range.fim,
  };
}

export function normalizeLegacyQuinzenas(quinzenas: QuinzenaEscala[] | null | undefined) {
  return (quinzenas || []).map(normalizeLegacyQuinzena);
}

export function detectQuinzenaMode(
  dataInicio: string,
  dataFim: string,
  quinzenas: QuinzenaEscala[] | undefined,
  mes: number,
): QuinzenaMode {
  if (!dataInicio || !dataFim) return 'custom';

  const q1 = quinzenas?.find((q) => q.mes === mes && q.numero === 1);
  const q2 = quinzenas?.find((q) => q.mes === mes && q.numero === 2);

  if (q1 && dataInicio === q1.data_inicio && dataFim === q1.data_fim) return '1q';
  if (q2 && dataInicio === q2.data_inicio && dataFim === q2.data_fim) return '2q';
  return 'custom';
}

export function getPeriodoPreviewLabel(mode: QuinzenaMode): string {
  if (mode === '1q') return '1ª Quinzena';
  if (mode === '2q') return '2ª Quinzena';
  return 'Período personalizado';
}
