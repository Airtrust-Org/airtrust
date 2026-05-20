import React from 'react';
import { LucideIcon } from 'lucide-react';

type StatusType = 'valid' | 'expiring' | 'expired' | 'renovated' | 'total';

interface StatusCardProps {
  icon: LucideIcon;
  title: string;
  count: number | string;
  status: StatusType;
  onClick?: () => void;
}

/**
 * Global StatusCard Component
 * Used for dashboard statistics with consistent styling
 * Features:
 * - Status-based coloring (green, yellow, red, gray, blue)
 * - Icon display
 * - Hover effects
 * - Responsive design
 */
export function StatusCard({ icon: Icon, title, count, status, onClick }: StatusCardProps) {
  // Get colors based on status
  const getColors = (status: StatusType) => {
    switch (status) {
      case 'valid':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: 'text-green-600',
          count: 'text-green-900',
          hover: 'hover:bg-green-100',
        };
      case 'expiring':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: 'text-yellow-600',
          count: 'text-yellow-900',
          hover: 'hover:bg-yellow-100',
        };
      case 'expired':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: 'text-red-600',
          count: 'text-red-900',
          hover: 'hover:bg-red-100',
        };
      case 'renovated':
        return {
          bg: 'bg-neutral-50',
          border: 'border-neutral-200',
          icon: 'text-neutral-600',
          count: 'text-neutral-900',
          hover: 'hover:bg-neutral-100',
        };
      case 'total':
        return {
          bg: 'bg-primary/10',
          border: 'border-blue-200',
          icon: 'text-primary',
          count: 'text-blue-900',
          hover: 'hover:bg-primary/20',
        };
    }
  };

  const colors = getColors(status);

  return (
    <div
      onClick={onClick}
      className={`
        rounded-lg border p-6
        transition-all duration-200
        ${colors.bg} ${colors.border}
        ${onClick ? `cursor-pointer ${colors.hover}` : ''}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-600">{title}</p>
          <p className={`mt-2 text-2xl font-bold ${colors.count}`}>{count}</p>
        </div>
        <div className={`rounded-full p-3 ${colors.bg} border ${colors.border}`}>
          <Icon className={`h-6 w-6 ${colors.icon}`} />
        </div>
      </div>
    </div>
  );
}

export default StatusCard;
