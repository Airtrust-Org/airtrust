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
 * - Acessibilidade: role="dialog", aria-modal e associações ARIA únicas
 */

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Nome acessível usado quando o modal não possui título visível. */
  ariaLabel?: string;
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
  ariaLabel = 'Janela de diálogo',
  children,
  footer,
  size = 'md',
  placement = 'center',
  disableBackdropClose = false,
  className,
}: BaseModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

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

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-modal flex justify-center overflow-y-auto p-4',
        placement === 'top' ? 'items-start pt-6 sm:pt-10' : 'items-center',
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
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        className={cn(
          'at-surface relative my-auto flex w-full animate-scale-in flex-col rounded-2xl shadow-2xl',
          placement === 'top'
            ? 'max-h-[calc(100dvh-2.5rem)] sm:max-h-[calc(100dvh-3.5rem)]'
            : 'max-h-[calc(100dvh-2rem)]',
          sizeClasses[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="text-base font-semibold leading-tight text-slate-900">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p id={subtitleId} className="mt-0.5 text-sm leading-snug text-slate-500">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="at-focus at-interactive inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:text-slate-600"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Botão fechar flutuante quando não há header */}
        {!title && !subtitle && (
          <button
            type="button"
            onClick={onClose}
            className="at-focus at-interactive absolute right-4 top-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
