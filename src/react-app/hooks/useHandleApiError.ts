import { useToast } from '@/react-app/hooks/useToast';

// Hook que retorna função padronizada para exibir erros de API
export function useHandleApiError() {
  const { error: toastError } = useToast();
  return (message?: string) => {
    if (!message) return;
    toastError(message);
  };
}
