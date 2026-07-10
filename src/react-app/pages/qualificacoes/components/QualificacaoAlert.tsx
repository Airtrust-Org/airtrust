import React from 'react';

export type AlertVariant = 'rose' | 'amber' | 'slate' | 'sky';

export interface QualificacaoAlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
};

export function QualificacaoAlert({ variant = 'slate', children, className = '' }: QualificacaoAlertProps) {
  const baseClasses = className || 'rounded-2xl px-4 py-3 text-sm';
  return (
    <div className={`border ${baseClasses} ${VARIANT_CLASSES[variant]}`}>
      {children}
    </div>
  );
}
