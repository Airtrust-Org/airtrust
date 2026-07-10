import React from 'react';

export type ChipColor = 'purple' | 'slate' | 'sky';

export interface QualificacaoChipProps {
  color?: ChipColor;
  children: React.ReactNode;
}

const COLOR_CLASSES: Record<ChipColor, string> = {
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  slate: 'bg-white text-slate-600 ring-slate-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function QualificacaoChip({ color = 'slate', children }: QualificacaoChipProps) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${COLOR_CLASSES[color]}`}>
      {children}
    </span>
  );
}
