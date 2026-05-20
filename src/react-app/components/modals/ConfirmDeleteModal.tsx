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
  if (!isOpen) return null;

  const isLoading = loading || isDeleting;
  const displayMessage = message || customMessage || 'Deseja realmente excluir este item?';

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-full">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 mb-4">{displayMessage}</p>
          {itemName && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-900">
                Item: <span className="font-bold">{itemName}</span>
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600 mt-4">⚠️ Esta ação não pode ser desfeita.</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Default export para compatibilidade retroativa
export default ConfirmDeleteModal;
