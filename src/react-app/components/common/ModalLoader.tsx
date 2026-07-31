import { Suspense, ComponentType } from 'react';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';

interface ModalLoaderProps {
  isOpen: boolean;
  children?: React.ReactNode;
}

/**
 * Fallback enquanto o modal está carregando
 */
function ModalLoadingFallback({ isOpen }: { isOpen: boolean }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/50"
      role="presentation"
    >
      <div
        className="bg-white rounded-lg p-6 shadow-xl"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <div
            className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"
            aria-hidden="true"
          />
          <span className="text-gray-700">Carregando...</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper para lazy loading de modais
 * Usa Suspense com fallback enquanto o modal carrega
 */
export function ModalLoader({ isOpen, children }: ModalLoaderProps) {
  return <Suspense fallback={<ModalLoadingFallback isOpen={isOpen} />}>{children}</Suspense>;
}

/**
 * Helper para criar lazy modals
 * Uso: const MyModal = lazyModal(() => import('./MyModal'));
 */
export function lazyModal<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T } | { [key: string]: T }>,
  exportName?: string,
) {
  return lazyWithRetry(
    async () => {
      const module = await importFn();
      if (exportName && exportName in module) {
        return { default: (module as any)[exportName] };
      }
      return module as { default: T };
    },
    `ModalLoader_${exportName || 'default'}`,
  );
}
