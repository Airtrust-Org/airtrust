import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  const config = {
    success: {
      icon: CheckCircle,
      bg: 'bg-green-500',
      border: 'border-green-600'
    },
    error: {
      icon: XCircle,
      bg: 'bg-red-500',
      border: 'border-red-600'
    },
    warning: {
      icon: AlertCircle,
      bg: 'bg-yellow-500',
      border: 'border-yellow-600'
    },
    info: {
      icon: Info,
      bg: 'bg-primary/100',
      border: 'border-primary'
    }
  }[type];
  
  const Icon = config.icon;
  
  return (
    <div className={`${config.bg} ${config.border} border-l-4 text-white p-4 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in`}>
      <Icon size={24} />
      <p className="flex-1">{message}</p>
      <button
        onClick={onClose}
        className="hover:bg-white/20 rounded p-1"
      >
        <X size={18} />
      </button>
    </div>
  );
};
