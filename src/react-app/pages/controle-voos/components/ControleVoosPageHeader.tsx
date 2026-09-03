import { cn } from '@/react-app/lib/utils';

interface ControleVoosPageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function ControleVoosPageHeader({ title, description, className, children }: ControleVoosPageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {children && <div className="mt-4 flex items-center gap-2">{children}</div>}
    </div>
  );
}
