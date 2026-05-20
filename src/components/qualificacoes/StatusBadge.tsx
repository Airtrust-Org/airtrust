import { CheckCircle, Clock, AlertCircle, Shield } from 'lucide-react';

interface StatusBadgeProps {
  status: 'vigente' | 'expirando' | 'vencida' | 'vitalicio';
  diasAteVencimento?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, diasAteVencimento, size = 'md' }: StatusBadgeProps) {
  const configs = {
    vigente: {
      icon: CheckCircle,
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      label: 'Vigente',
    },
    expirando: {
      icon: Clock,
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700',
      borderColor: 'border-yellow-200',
      label: 'Expirando',
    },
    vencida: {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      label: 'Vencida',
    },
    vitalicio: {
      icon: Shield,
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      label: 'Vitalício',
    },
  };

  const config = configs[status];
  const Icon = config.icon;

  const sizes = {
    sm: { icon: 12, text: 'text-xs', px: 'px-2', py: 'py-0.5' },
    md: { icon: 14, text: 'text-sm', px: 'px-2.5', py: 'py-1' },
    lg: { icon: 16, text: 'text-base', px: 'px-3', py: 'py-1.5' },
  };

  const sizeConfig = sizes[size];

  return (
    <span
      className={`
      inline-flex items-center gap-1.5 rounded-full border
      ${config.bgColor} ${config.textColor} ${config.borderColor}
      ${sizeConfig.px} ${sizeConfig.py} ${sizeConfig.text}
      font-medium
    `}
    >
      <Icon size={sizeConfig.icon} />
      {config.label}
      {diasAteVencimento !== null && diasAteVencimento !== undefined && (
        <span className="font-normal opacity-75">
          (
          {diasAteVencimento > 0
            ? `${diasAteVencimento}d`
            : `${Math.abs(diasAteVencimento)}d atrás`}
          )
        </span>
      )}
    </span>
  );
}
