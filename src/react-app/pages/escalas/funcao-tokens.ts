export interface FuncaoVisualToken {
  badgeClassName: string;
  selectedCardClassName: string;
  selectedMutedTextClassName: string;
  activeButtonClassName: string;
}

const DEFAULT_TOKEN: FuncaoVisualToken = {
  badgeClassName: 'bg-slate-100 text-slate-700',
  selectedCardClassName: 'border-slate-900 bg-slate-900 text-white',
  selectedMutedTextClassName: 'text-slate-200',
  activeButtonClassName: 'border-slate-900 bg-slate-900 text-white',
};

const FUNCao_TOKENS: Record<string, FuncaoVisualToken> = {
  PIC: {
    badgeClassName: 'bg-sky-100 text-sky-700',
    selectedCardClassName: 'border-sky-800 bg-sky-900 text-white',
    selectedMutedTextClassName: 'text-sky-100',
    activeButtonClassName: 'border-sky-700 bg-sky-700 text-white',
  },
  PIC_CHK: {
    badgeClassName: 'bg-sky-100 text-sky-700',
    selectedCardClassName: 'border-sky-800 bg-sky-900 text-white',
    selectedMutedTextClassName: 'text-sky-100',
    activeButtonClassName: 'border-sky-700 bg-sky-700 text-white',
  },
  SIC: {
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    selectedCardClassName: 'border-emerald-800 bg-emerald-900 text-white',
    selectedMutedTextClassName: 'text-emerald-100',
    activeButtonClassName: 'border-emerald-700 bg-emerald-700 text-white',
  },
  SIC_CHK: {
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    selectedCardClassName: 'border-emerald-800 bg-emerald-900 text-white',
    selectedMutedTextClassName: 'text-emerald-100',
    activeButtonClassName: 'border-emerald-700 bg-emerald-700 text-white',
  },
};

export function getFuncaoVisualToken(funcao: string | null | undefined): FuncaoVisualToken {
  const normalized = String(funcao || '')
    .trim()
    .toUpperCase();
  return FUNCao_TOKENS[normalized] || DEFAULT_TOKEN;
}
