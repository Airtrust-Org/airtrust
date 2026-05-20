import { useEffect, useRef, useState } from 'react';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { registerConfirmDialogHandler } from '@/react-app/utils/confirmDialog';

type ConfirmRequest = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  message: string;
  resolve: (confirmed: boolean) => void;
};

export default function GlobalConfirmDialogHost() {
  const queueRef = useRef<ConfirmRequest[]>([]);
  const [activeRequest, setActiveRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const showNext = () => {
      if (queueRef.current.length === 0) {
        setActiveRequest(null);
        return;
      }
      const next = queueRef.current.shift() ?? null;
      setActiveRequest(next);
    };

    registerConfirmDialogHandler((request) => {
      queueRef.current.push(request);
      setActiveRequest((current) => current ?? queueRef.current.shift() ?? null);
    });

    return () => {
      registerConfirmDialogHandler(null);
      queueRef.current = [];
      setActiveRequest(null);
    };
  }, []);

  if (!activeRequest) return null;

  const handleClose = () => {
    activeRequest.resolve(false);
    setActiveRequest(null);
    setTimeout(() => {
      const next = queueRef.current.shift() ?? null;
      setActiveRequest(next);
    }, 0);
  };

  const handleConfirm = () => {
    activeRequest.resolve(true);
    setActiveRequest(null);
    setTimeout(() => {
      const next = queueRef.current.shift() ?? null;
      setActiveRequest(next);
    }, 0);
  };

  return (
    <ConfirmDeleteModal
      isOpen={!!activeRequest}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={activeRequest.title ?? 'Confirmar ação'}
      message={activeRequest.message}
      confirmText={activeRequest.confirmText ?? 'Confirmar'}
      cancelText={activeRequest.cancelText ?? 'Cancelar'}
    />
  );
}
