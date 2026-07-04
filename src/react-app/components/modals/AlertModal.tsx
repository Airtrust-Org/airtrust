import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  backdrop?: boolean;
}

export default function AlertModal({
  isOpen,
  onClose,
  title = 'Atenção',
  message,
  confirmText = 'Entendi',
  backdrop = true,
}: AlertModalProps) {
  if (!isOpen) return null;

  const containerClass = backdrop
    ? 'fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal overflow-y-auto p-4'
    : 'fixed inset-0 flex items-center justify-center z-modal overflow-y-auto p-4';

  return createPortal(
    <div className={containerClass}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-lg bg-white shadow-xl my-auto">
        <div className="flex shrink-0 items-center justify-between p-6 border-b">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <p className="text-gray-700">{message}</p>
        </div>

        <div className="flex shrink-0 justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
