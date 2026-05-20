import { useEffect, useState, useRef } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

// ===== TOAST ITEM WITH AUTO-DISMISS & ACCESSIBILITY =====
function ToastItem({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ===== AUTO-DISMISS WITH CONFIGURABLE TIMEOUT =====
  useEffect(() => {
    // Default: 3-5 seconds based on type
    let duration = toast.duration;
    if (!duration) {
      // Errors longer than success
      if (toast.type === 'error') {
        duration = 5000;
      } else if (toast.type === 'warning') {
        duration = 4000;
      } else {
        duration = 3000;
      }
    }

    timerRef.current = setTimeout(() => {
      setIsExiting(true);
      closeTimeoutRef.current = setTimeout(() => onClose(toast.id), 300);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [toast, onClose]);

  // ===== KEYBOARD NAVIGATION (Escape to close) =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsExiting(true);
    closeTimeoutRef.current = setTimeout(() => onClose(toast.id), 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" aria-hidden="true" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" aria-hidden="true" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" aria-hidden="true" />;
      case 'info':
        return <Info className="w-5 h-5 text-primary flex-shrink-0" aria-hidden="true" />;
    }
  };

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-900';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'info':
        return 'bg-primary/10 border-blue-200 text-blue-900';
    }
  };

  const getAriaRole = () => {
    if (toast.type === 'error') return 'alert';
    return 'status';
  };

  return (
    <div
      className={`
        ${getStyles()}
        border rounded-lg shadow-lg p-4 mb-3 flex items-start gap-3 min-w-[300px] max-w-md
        transition-all duration-200 ease-out
        ${isExiting ? 'opacity-0 translate-x-4 scale-[0.98]' : 'opacity-100 translate-x-0 scale-100'}
      `}
      role={getAriaRole()}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {getIcon()}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={handleClose}
        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        aria-label="Fechar notificação"
        title="Fechar (ESC)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

// ===== TOAST CONTAINER WITH ARIA LIVE REGION =====
export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col items-end pointer-events-none"
      role="region"
      aria-label="Notificações"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}
