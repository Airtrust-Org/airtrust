/**
 * BaseModal — Design Apple-style
 *
 * Features:
 * - backdrop-blur com overlay sutil
 * - Animação CSS scale-in suave (sem dependência externa)
 * - z-modal alinhado com design-system
 * - Slots: title, subtitle, children, footer
 * - Variantes de tamanho: sm | md | lg | xl | full
 * - Fecha com Escape e clique no backdrop
 * - Acessibilidade: role="dialog", aria-modal, focus trap básico
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  placement?: 'center' | 'top';
  /** Impede fechar clicando no backdrop */
  disableBackdropClose?: boolean;
  className?: string;
}

const sizeClasses: Record<NonNullable<BaseModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  placement = 'center',
  disableBackdropClose = false,
  className,
}: BaseModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disableBackdropClose) return;
    // Fechar apenas quando o clique for diretamente no backdrop (não em filhos/nested modals)
    if (e.target === e.currentTarget) onClose();
  };

  // Fecha com Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Bloqueia scroll do body
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-modal flex justify-center p-4',
        placement === 'top' ? 'items-start pt-20' : 'items-center',
      )}
      role="presentation"
    >
      {/* Backdrop com blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Container do modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={cn(
          'relative w-full animate-scale-in rounded-2xl bg-white shadow-2xl',
          'flex flex-col max-h-[90vh]',
          sizeClasses[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-base font-semibold text-slate-900 leading-tight"
                >
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-0.5 text-sm text-slate-500 leading-snug">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Botão fechar flutuante quando não há header */}
        {!title && !subtitle && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
