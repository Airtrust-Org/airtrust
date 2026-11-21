/**
 * useConfirmDialog — confirmação assíncrona acessível no lugar de `window.confirm`.
 *
 * Uso:
 *   const { confirm, confirmDialog } = useConfirmDialog();
 *   if (!(await confirm({ title: 'Remover acesso?', tone: 'danger' }))) return;
 *   return <>{...}{confirmDialog}</>;
 */
import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmOptions } from '@/react-app/components/modals/ConfirmDialog';

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Renderize `confirmDialog` uma vez no componente.
 * Chamadas simultâneas resolvem a anterior como `false`.
 */
export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current?.resolve(false);
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const confirmDialog = pending ? (
    <ConfirmDialog
      key={pending.options.title}
      isOpen
      {...pending.options}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
