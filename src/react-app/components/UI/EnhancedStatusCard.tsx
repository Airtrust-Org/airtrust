import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatusCardProps {
  icon: LucideIcon;
  label: string;
  count: number;
  status: 'valid' | 'expiring' | 'expired' | 'revoked' | 'total';
  description?: string;
  onClick?: () => void;
}

const statusConfig = {
  valid: {
    bgGradient: 'from-green-50 to-green-100',
    borderColor: 'border-green-600',
    textColor: 'text-green-700',
    gradientText: 'from-green-600 to-green-700',
    shadow: 'shadow-green-100',
    hoverShadow: 'hover:shadow-green-200',
  },
  expiring: {
    bgGradient: 'from-orange-50 to-orange-100',
    borderColor: 'border-orange-600',
    textColor: 'text-orange-700',
    gradientText: 'from-orange-600 to-orange-700',
    shadow: 'shadow-orange-100',
    hoverShadow: 'hover:shadow-orange-200',
  },
  expired: {
    bgGradient: 'from-red-50 to-red-100',
    borderColor: 'border-red-600',
    textColor: 'text-red-700',
    gradientText: 'from-red-600 to-red-700',
    shadow: 'shadow-red-100',
    hoverShadow: 'hover:shadow-red-200',
  },
  revoked: {
    bgGradient: 'from-neutral-100 to-neutral-200',
    borderColor: 'border-neutral-400',
    textColor: 'text-neutral-700',
    gradientText: 'from-neutral-600 to-neutral-700',
    shadow: 'shadow-neutral-100',
    hoverShadow: 'hover:shadow-neutral-200',
  },
  total: {
    bgGradient: 'from-blue-50 to-blue-100',
    borderColor: 'border-primary',
    textColor: 'text-blue-700',
    gradientText: 'from-blue-600 to-blue-700',
    shadow: 'shadow-blue-100',
    hoverShadow: 'hover:shadow-blue-200',
  },
};

/**
 * Enhanced StatusCard Component
 * Features:
 * - Gradient background
 * - Large shadow with smooth elevation
 * - Hover effects (scale + shadow increase)
 * - Status-specific coloring
 * - Gradient text for numbers
 * - Smooth transitions
 * - Optional click handler
 *
 * @param {StatusCardProps} props - Component props
 * @returns {JSX.Element} Rendered card
 */
export const EnhancedStatusCard: React.FC<StatusCardProps> = ({
  icon: Icon,
  label,
  count,
  status,
  description,
  onClick,
}) => {
  const config = statusConfig[status];

  return (
    <button
      onClick={onClick}
      className={`
        w-full h-full
        bg-gradient-to-b ${config.bgGradient}
        border-3 ${config.borderColor}
        rounded-xl
        p-6
        shadow-lg ${config.shadow}
        transition-all duration-300
        hover:scale-105 ${config.hoverShadow} hover:shadow-2xl
        focus-visible:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/30
        transform cursor-pointer
        group
      `}
    >
      {/* Icon */}
      <div className="flex justify-center mb-4">
        <Icon
          className={`w-12 h-12 ${config.textColor} transition-transform duration-300 group-hover:scale-110`}
        />
      </div>

      {/* Label */}
      <p className={`text-sm font-semibold ${config.textColor} mb-2 uppercase tracking-wide`}>
        {label}
      </p>

      {/* Count with Gradient Text */}
      <div className="mb-3">
        <p
          className={`
          text-2xl font-bold
          bg-gradient-to-r ${config.gradientText}
          bg-clip-text text-transparent
          transition-all duration-300
          group-hover:scale-110 transform origin-left
        `}
        >
          {count.toLocaleString('pt-BR')}
        </p>
      </div>

      {/* Description (optional) */}
      {description && (
        <p className={`text-xs ${config.textColor} opacity-75 font-medium`}>{description}</p>
      )}

      {/* Subtle bottom accent line */}
      <div
        className={`
        mt-4 h-1 w-0 bg-gradient-to-r ${config.gradientText}
        transition-all duration-300 group-hover:w-full
        rounded-full
      `}
      />
    </button>
  );
};

export default EnhancedStatusCard;
