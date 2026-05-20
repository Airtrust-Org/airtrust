import { useEffect } from 'react';
import { escutarEventosModulo, type ModuloEvento } from './moduloBus';

export function useEventosModulo(handler: (evento: ModuloEvento) => void) {
  useEffect(() => {
    return escutarEventosModulo(handler);
  }, [handler]);
}
