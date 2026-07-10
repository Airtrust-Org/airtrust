import React from 'react';
import {
  getStatusColor,
  getStatusDotColor,
  getStatusLabel,
} from '../qualificacoes.helpers';

interface QualificacaoStatusBadgeProps {
  status: string;
  isRenovada?: boolean;
}

export function QualificacaoStatusBadge({ status, isRenovada = false }: QualificacaoStatusBadgeProps) {
  const colorClass = isRenovada ? 'bg-blue-600/10 text-blue-600' : getStatusColor(status);
  const dotColorClass = isRenovada ? 'bg-primary' : getStatusDotColor(status);
  const label = isRenovada ? 'Renovada' : getStatusLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colorClass}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotColorClass}`} />
      {label}
    </span>
  );
}
