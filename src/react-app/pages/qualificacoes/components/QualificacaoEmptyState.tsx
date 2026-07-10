import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface QualificacaoEmptyStateProps {
  title: string;
  description: React.ReactNode;
  icon: LucideIcon;
  action?: React.ReactNode;
}

export function QualificacaoEmptyState({
  title,
  description,
  icon: Icon,
  action,
}: QualificacaoEmptyStateProps) {
  return (
    <div className="text-center py-12">
      <Icon className="mx-auto mb-4 text-slate-300" size={60} aria-hidden="true" />
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {title}
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        {description}
      </p>
      {action}
    </div>
  );
}
