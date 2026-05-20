import { ReactNode } from 'react';
import { cn } from '@/react-app/lib/utils';
import BasePageHeader from '@/react-app/components/PageHeader';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn(className)}>
      {breadcrumbs && <div className="mb-2">{breadcrumbs}</div>}
      <BasePageHeader title={title} subtitle={description} actions={action} />
    </div>
  );
}
