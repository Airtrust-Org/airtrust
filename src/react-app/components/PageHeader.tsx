import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  lastUpdated?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  subtitleClassName,
  lastUpdated,
  actions,
  className,
  children,
}) => {
  const renderedActions = actions ?? children;

  return (
    <div className={`mb-4 ${className || ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <h1 className="text-xl sm:text-xl font-bold text-slate-900 tracking-tight leading-tight dark:text-slate-100">
            {title}
          </h1>
          {subtitle && (
            <p className={`text-sm text-slate-500 font-normal leading-normal dark:text-slate-400 ${subtitleClassName || ''}`}>
              {subtitle}
            </p>
          )}
          {lastUpdated && (
            <p className="text-xs text-slate-400 font-normal leading-normal dark:text-slate-500">
              {lastUpdated}
            </p>
          )}
        </div>
        {renderedActions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:pl-4">
            {renderedActions}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
