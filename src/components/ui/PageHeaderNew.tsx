import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  lastUpdated?: string;
}

export function PageHeader({ title, subtitle, action, lastUpdated }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-[288px] flex-col gap-1">
        <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && (
          <p className="text-base font-normal leading-normal text-slate-500">{subtitle}</p>
        )}
        {lastUpdated && (
          <p className="text-sm font-normal leading-normal text-slate-400">
            Atualizado: {lastUpdated}
          </p>
        )}
      </div>
      {action && <div className="flex items-center">{action}</div>}
    </div>
  );
}
