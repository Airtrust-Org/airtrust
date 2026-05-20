import React from 'react';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
  noPadding?: boolean;
}

/**
 * Consistent page layout component following design system
 * Provides standardized spacing, typography, and structure
 */
export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  subtitle,
  description,
  action,
  children,
  className = '',
  headerAction,
  noPadding = false,
}) => {
  return (
    <div className={`w-full ${className}`}>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-[-0.015em] text-slate-800 dark:text-slate-100 sm:text-2xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm font-normal leading-normal text-slate-500 dark:text-slate-400 sm:text-base">
                {subtitle}
              </p>
            )}
            {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>}
          </div>
          {(action || headerAction) && (
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {action}
              {headerAction}
            </div>
          )}
        </div>
      </div>

      {/* Page Content - sem padding extra, já tem 20px do Layout */}
      <div className={`w-full ${noPadding ? '' : ''}`}>{children}</div>
    </div>
  );
};

interface PageSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  noBorder?: boolean;
}

/**
 * Section component for grouping related content
 * Follows design system spacing and styling
 */
export const PageSection: React.FC<PageSectionProps> = ({
  title,
  description,
  children,
  className = '',
  noBorder = false,
}) => {
  return (
    <div className={`mb-6 ${className}`}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-xl font-semibold leading-tight text-slate-800 dark:text-slate-100">{title}</h2>}
          {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
        </div>
      )}
      <div
        className={`overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900 ${!noBorder && 'border border-slate-200/80 dark:border-slate-800'}`}
      >
        {children}
      </div>
    </div>
  );
};

interface PageGridProps {
  columns?: 1 | 2 | 3 | 4 | 5;
  children: React.ReactNode;
  className?: string;
}

/**
 * Responsive grid layout component
 * Automatically adjusts columns based on screen size
 */
export const PageGrid: React.FC<PageGridProps> = ({ columns = 2, children, className = '' }) => {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  };

  return <div className={`grid gap-6 ${gridClasses[columns]} ${className}`}>{children}</div>;
};

interface PageCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  noBorder?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

/**
 * Card component for consistent content containers
 * Provides unified styling across all pages
 */
export const PageCard: React.FC<PageCardProps> = ({
  children,
  className = '',
  hover = false,
  noBorder = false,
  padding = 'md',
  variant = 'neutral',
}) => {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const variantClass = variant ? `card card-${variant}` : '';

  return (
    <div
      className={`
        rounded-2xl bg-white shadow-sm dark:bg-slate-900
        ${!noBorder && 'border border-slate-200/80 dark:border-slate-800'}
        ${
          hover &&
          'cursor-pointer transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700'
        }
        ${paddingClasses[padding]}
        ${variantClass}
        ${className}
      `}
    >
      {children}
    </div>
  );
};
