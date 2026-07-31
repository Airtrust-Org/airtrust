import { useId } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  /** Mensagem principal do modal */
  message?: string;
  /** Alias de message (compatibilidade UI/ConfirmDeleteModal) */
  customMessage?: string;
  itemName?: string;
  confirmText?: string;
  cancelText?: string;
  /** Estado de loading */
  loading?: boolean;
  /** Alias de loading (compatibilidade UI/ConfirmDeleteModal) */
  isDeleting?: boolean;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar Exclusão',
  message,
  customMessage,
  itemName,
  confirmText = 'Excluir',
  cancelText = 'Cancelar',
  loading = false,
  isDeleting = false,
}: ConfirmDeleteModalProps) {
  const titleId = useId();
  const messageId = useId();
  const itemId = useId();
  const warningId = useId();

  if (!isOpen) return null;

  const isLoading = loading || isDeleting;
  const displayMessage = message || customMessage || 'Deseja realmente excluir este item?';
  const descriptionIds = [messageId, itemName ? itemId : null, warningId]
    .filter((id): id is string => Boolean(id))
    .join(' ');

  const handleConfirm = async () => {
    await onConfirm();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal overflow-y-auto p-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionIds}
        aria-busy={isLoading}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-lg bg-white shadow-xl my-auto"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-full">
              <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
            </div>
            <h2 id={titleId} className="text-xl font-semibold text-gray-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            aria-label="Fechar confirmação"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <p id={messageId} className="text-gray-700 mb-4">
            {displayMessage}
          </p>
          {itemName && (
            <div id={itemId} className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-900">
                Item: <span className="font-bold">{itemName}</span>
              </p>
            </div>
          )}
          <p id={warningId} className="text-sm text-gray-600 mt-4">
            ⚠️ Esta ação não pode ser desfeita.
          </p>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <div
                className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                aria-hidden="true"
              />
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Default export para compatibilidade retroativa
export default ConfirmDeleteModal;
