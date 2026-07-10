import React from 'react';

export interface QualificacaoInfoCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
}

export function QualificacaoInfoCard({
  label,
  value,
  valueClassName = 'font-semibold text-slate-900',
}: QualificacaoInfoCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-sm ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}
