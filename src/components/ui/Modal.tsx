import 'material-symbols/outlined.css';
import { useId, useRef } from 'react';
import { useModalA11y } from '@/react-app/hooks/useModalA11y';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const titleId = useId();
  useModalA11y({ isOpen, onClose, dialogRef });

  if (!isOpen) return null;

  const sizeConfig: Record<string, { widthClass: string; maxHeight: string }> = {
    sm: { widthClass: 'max-w-sm', maxHeight: 'min(70vh, calc(100dvh - 1.5rem))' },
    md: { widthClass: 'max-w-md', maxHeight: 'min(82vh, calc(100dvh - 1.5rem))' },
    lg: { widthClass: 'max-w-2xl', maxHeight: 'min(84vh, calc(100dvh - 1.5rem))' },
    xl: { widthClass: 'max-w-3xl', maxHeight: 'min(86vh, calc(100dvh - 1.5rem))' },
    '2xl': { widthClass: 'max-w-2xl', maxHeight: 'min(88vh, calc(100dvh - 1.5rem))' },
    '3xl': { widthClass: 'max-w-4xl', maxHeight: 'min(88vh, calc(100dvh - 1.5rem))' },
    '4xl': { widthClass: 'max-w-5xl', maxHeight: 'min(90vh, calc(100dvh - 1.5rem))' },
    '5xl': { widthClass: 'max-w-6xl', maxHeight: 'min(92vh, calc(100dvh - 1.5rem))' },
    full: { widthClass: 'max-w-full mx-4', maxHeight: 'calc(100dvh - 2rem)' },
  };

  const cfg = sizeConfig[size] || sizeConfig.md;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="presentation"
    >
      <div className="flex min-h-[calc(100dvh-1.5rem)] w-full items-center justify-center sm:min-h-[calc(100dvh-2rem)]">
        <div
          ref={dialogRef}
          data-modal-container
          className={`relative flex w-full flex-col ${cfg.widthClass} overflow-hidden rounded-2xl bg-white shadow-2xl motion-safe:transition-all motion-safe:duration-200 ease-out`}
          style={{ maxHeight: cfg.maxHeight }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 id={titleId} className="pr-3 text-lg font-bold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
            </button>
          </div>

          <div data-modal-body className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {children}
          </div>

          {footer && (
            <div
              data-modal-footer
              className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3"
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
