// FIX: [BUG 5] - Width tokens now enforce minimum widths so the scale grid does not compress.
// escalaTokens.ts
// Fonte unica de verdade para todas as cores e geometrias do modulo Escalas.
// NUNCA hardcode Tailwind de quinzena fora deste arquivo.

export const Q1 = {
  bg: 'bg-fuchsia-50',
  bgHover: 'hover:bg-fuchsia-100',
  bgActive: 'bg-fuchsia-200',
  border: 'border-fuchsia-200',
  borderActive: 'border-fuchsia-400',
  text: 'text-fuchsia-700',
  textMuted: 'text-fuchsia-500',
  pill: 'bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200',
  pillActive: 'bg-fuchsia-500 text-white border border-fuchsia-600',
  accent: 'bg-fuchsia-500',
  label: '1ª Quinzena Q1',
  short: 'Q1',
} as const;

export const Q2 = {
  bg: 'bg-amber-50',
  bgHover: 'hover:bg-amber-100',
  bgActive: 'bg-amber-200',
  border: 'border-amber-200',
  borderActive: 'border-amber-400',
  text: 'text-amber-700',
  textMuted: 'text-amber-500',
  pill: 'bg-amber-100 text-amber-800 border border-amber-200',
  pillActive: 'bg-amber-500 text-white border border-amber-600',
  accent: 'bg-amber-500',
  label: '2ª Quinzena Q2',
  short: 'Q2',
} as const;

export const quinzenaToken = (numero: 1 | 2) => (numero === 1 ? Q1 : Q2);

export const EVENT_TOKENS = {
  DISPONIVEL: { bg: 'bg-emerald-400', text: 'text-white' },
  ALOCACAO: { bg: 'bg-fuchsia-400', text: 'text-white' },
  ALOCACAO_Q2: { bg: 'bg-amber-400', text: 'text-white' },
  FOLGA: { bg: 'bg-slate-200', text: 'text-slate-500' },
  FERIAS: { bg: 'bg-emerald-200', text: 'text-emerald-800' },
  LICENCA: { bg: 'bg-violet-200', text: 'text-violet-800' },
  SIMULADOR: { bg: 'bg-indigo-300', text: 'text-indigo-900' },
  CURSO: { bg: 'bg-purple-200', text: 'text-purple-800' },
  CHEQUE: { bg: 'bg-green-200', text: 'text-green-800' },
  EXAME_MEDICO: { bg: 'bg-rose-200', text: 'text-rose-800' },
  STANDBY: { bg: 'bg-yellow-200', text: 'text-yellow-800' },
  CONFLITO: { bg: 'bg-red-500', text: 'text-white' },
  VAZIO: { bg: 'bg-transparent', text: 'text-slate-300' },
  AVULSA: { bg: 'bg-amber-300', text: 'text-amber-900' },
} as const;

export type EventType = keyof typeof EVENT_TOKENS;

export const EVENT_PRIORITY: EventType[] = [
  'CONFLITO',
  'FERIAS',
  'LICENCA',
  'EXAME_MEDICO',
  'CHEQUE',
  'SIMULADOR',
  'CURSO',
  'STANDBY',
  'ALOCACAO',
  'ALOCACAO_Q2',
  'AVULSA',
  'DISPONIVEL',
  'FOLGA',
  'VAZIO',
];

export const CELL = {
  width: 'w-auto min-w-[1.75rem] xl:min-w-[2rem]',
  height: 'h-5 lg:h-6 xl:h-7',
  radius: 'rounded-md',
  gap: 'gap-px',
  padding: 'p-0.5',
  pillHeight: 'h-6',
  pillRadius: 'rounded',
  pillPaddingX: 'px-1',
  rowHeight: 'h-7 lg:h-8',
  rowPaddingY: 'py-px lg:py-0.5',
  rowGap: 'gap-y-0.5',
  labelWidth: 'w-36 min-w-[9rem] lg:w-40 lg:min-w-[10rem] xl:w-48 xl:min-w-[12rem]',
  labelPadding: 'px-1.5 py-px lg:px-2 lg:py-0.5 xl:px-2 xl:py-1',
} as const;
