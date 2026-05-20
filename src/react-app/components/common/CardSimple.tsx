import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

export const CardSimple: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  hover = false,
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={`
        rounded-lg border border-slate-200 bg-white shadow dark:border-slate-800 dark:bg-slate-900
        ${paddingClasses[padding]}
        ${hover ? 'cursor-pointer transition-shadow hover:shadow-lg' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
}) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

interface CardBodyProps {
  children: ReactNode;
}

export const CardBody: React.FC<CardBodyProps> = ({ children }) => {
  return <div>{children}</div>;
};

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className = '',
}) => {
  return <div className={`mt-4 border-t border-gray-200 pt-4 dark:border-slate-800 ${className}`}>{children}</div>;
};
