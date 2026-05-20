import { useEffect, useRef, useState } from 'react';
import AlertModal from '@/react-app/components/modals/AlertModal';
import { registerAlertDialogHandler } from '@/react-app/utils/confirmDialog';

type AlertRequest = {
  title?: string;
  confirmText?: string;
  message: string;
};

export default function GlobalAlertDialogHost() {
  const queueRef = useRef<AlertRequest[]>([]);
  const [activeRequest, setActiveRequest] = useState<AlertRequest | null>(null);

  useEffect(() => {
    registerAlertDialogHandler((request) => {
      queueRef.current.push(request);
      setActiveRequest((current) => current ?? queueRef.current.shift() ?? null);
    });

    return () => {
      registerAlertDialogHandler(null);
      queueRef.current = [];
      setActiveRequest(null);
    };
  }, []);

  if (!activeRequest) return null;

  const handleClose = () => {
    setActiveRequest(null);
    setTimeout(() => {
      const next = queueRef.current.shift() ?? null;
      setActiveRequest(next);
    }, 0);
  };

  return (
    <AlertModal
      isOpen={!!activeRequest}
      onClose={handleClose}
      title={activeRequest.title ?? 'Mensagem'}
      message={activeRequest.message}
      confirmText={activeRequest.confirmText ?? 'Entendi'}
    />
  );
}
