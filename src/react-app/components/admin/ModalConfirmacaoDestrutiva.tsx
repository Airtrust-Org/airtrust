/**
 * Modal de Confirmação Destrutiva
 *
 * Modal reutilizável para ações destrutivas que requerem confirmação
 * por digitação de palavra-chave.
 *
 * Features:
 * - Campo de texto para digitar palavra de confirmação
 * - Botão desabilitado até confirmação correta
 * - Foco automático no campo de texto
 * - Visual vermelho/destrutivo
 * - Loading state durante execução
 */

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ModalConfirmacaoDestrutivaProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  confirmWord: string;
  confirmWordLabel?: string;
  actionLabel?: string;
}

export function ModalConfirmacaoDestrutiva({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmWord,
  confirmWordLabel = 'Digite para confirmar',
  actionLabel = 'Apagar Tudo',
}: ModalConfirmacaoDestrutivaProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isConfirmWordCorrect = inputValue.toUpperCase() === confirmWord.toUpperCase();

  // Focar no input quando abrir
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Resetar ao fechar
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!isConfirmWordCorrect) return;

    setIsLoading(true);
    setError(null);

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isConfirmWordCorrect && !isLoading) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-red-200 bg-red-50">
          <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-red-900">{title}</h2>
            <p className="text-sm text-red-700 mt-1">Esta ação é irreversível</p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="text-sm text-gray-700 whitespace-pre-line">{description}</div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <strong>Erro:</strong> {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="confirm-input" className="block text-sm font-medium text-gray-700">
              {confirmWordLabel}:
            </label>
            <div className="space-y-1">
              <input
                ref={inputRef}
                id="confirm-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Digite: ${confirmWord}`}
                disabled={isLoading}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-lg disabled:opacity-50"
              />
              <p className="text-xs text-gray-500">
                Digite{' '}
                <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">{confirmWord}</code>{' '}
                para habilitar o botão
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmWordCorrect || isLoading}
            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Apagando...
              </span>
            ) : (
              actionLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
