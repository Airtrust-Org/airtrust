import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { INVALIDACOES, escutarEventosModulo, type ModuloEvento } from './moduloBus';

export function useModuloBus(handler?: (evento: ModuloEvento) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return escutarEventosModulo((evento) => {
      const keys = INVALIDACOES[evento.tipo] || [];
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
      handler?.(evento);
    });
  }, [handler, queryClient]);
}
