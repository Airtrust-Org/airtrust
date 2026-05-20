import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: string[];
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            {breadcrumb.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="material-symbols-outlined text-sm">chevron_right</span>}
                <span className={i === breadcrumb.length - 1 ? 'text-slate-900 font-medium' : ''}>
                  {item}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>

        {subtitle && <p className="text-sm text-slate-600 mt-2">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
