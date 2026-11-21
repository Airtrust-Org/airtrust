/**
 * ConfirmDialog — substitui `window.confirm`/`alert` por um diálogo
 * acessível, estilizado e assíncrono.
 *
 * Uso imperativo: ver `useConfirmDialog` em `@/react-app/hooks/useConfirmDialog`.
 */
import { useState, type ReactNode } from 'react';
import { BaseModal } from './BaseModal';
import { cn } from '@/react-app/lib/utils';

export interface ConfirmOptions {
  title: string;
  /** Consequência da ação, em linguagem direta. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` destaca ações destrutivas e foca "Cancelar" ao abrir. */
  tone?: 'default' | 'danger';
  /** Se informado, o usuário precisa digitar este texto para habilitar a confirmação. */
  requireText?: string;
}

interface ConfirmDialogProps extends ConfirmOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  requireText,
  onConfirm,
  onCancel,
  isBusy = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const textMatches = !requireText || typed.trim() === requireText;
  const danger = tone === 'danger';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            data-autofocus={danger || requireText ? '' : undefined}
            onClick={onCancel}
            className="at-focus min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus={!danger && !requireText ? '' : undefined}
            onClick={onConfirm}
            disabled={!textMatches || isBusy}
            className={cn(
              'at-focus min-h-11 cursor-pointer rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              danger ? 'bg-red-700 hover:bg-red-800' : 'bg-primary hover:bg-primary/90',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {description && <div className="text-sm leading-relaxed text-slate-700">{description}</div>}
      {requireText && (
        <div className="mt-4">
          <label htmlFor="confirm-dialog-text" className="block text-sm font-medium text-slate-700">
            Digite <span className="font-mono font-semibold">{requireText}</span> para confirmar
          </label>
          <input
            id="confirm-dialog-text"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}
    </BaseModal>
  );
}
