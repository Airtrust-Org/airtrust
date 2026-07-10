import React from 'react';

export interface QualificacaoDataPointProps {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export function QualificacaoDataPoint({
  label,
  value,
  className = '',
  valueClassName = 'text-sm font-semibold text-slate-900',
}: QualificacaoDataPointProps) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-slate-600 uppercase">
        {label}
      </p>
      <p className={valueClassName}>
        {value}
      </p>
    </div>
  );
}
