import React from 'react';

export interface QualificacaoSectionBoxProps {
  title?: React.ReactNode;
  titleRight?: React.ReactNode;
  variant?: 'white' | 'slate';
  className?: string;
  children: React.ReactNode;
}

export function QualificacaoSectionBox({
  title,
  titleRight,
  variant = 'white',
  className = '',
  children,
}: QualificacaoSectionBoxProps) {
  const bgClass = variant === 'slate' ? 'bg-slate-50' : 'bg-white';
  const trackClass = variant === 'slate' ? 'tracking-[0.18em]' : 'tracking-[0.16em]';

  return (
    <div className={`rounded-2xl border border-slate-200 px-4 py-3 ${bgClass} ${className}`}>
      {(title || titleRight) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <p className={`text-xs font-semibold uppercase text-slate-500 ${trackClass}`}>
              {title}
            </p>
          )}
          {titleRight && <div>{titleRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
