import { Suspense, ComponentType } from 'react';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';

interface LazyLoaderProps {
  loader: () => Promise<{ default: ComponentType<any> }>;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}

function DefaultFallback() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 w-8 h-8 border-2 border-transparent border-r-blue-400 rounded-full animate-spin animation-delay-75"></div>
        </div>
        <p className="text-sm text-gray-500 animate-pulse">Carregando...</p>
      </div>
    </div>
  );
}

export function LazyLoader({ loader, fallback = <DefaultFallback />, children }: LazyLoaderProps) {
  const LazyComponent = lazyWithRetry(loader, 'LazyLoaderComponent');

  return <Suspense fallback={fallback}>{children ? children : <LazyComponent />}</Suspense>;
}

export function createLazyComponent<T extends Record<string, any> = {}>(
  loader: () => Promise<{ default: ComponentType<T> }>,
  fallback?: React.ReactNode,
) {
  const LazyComponent = lazyWithRetry(loader, 'CreateLazyComponent');

  return function LazyWrapper(props: T) {
    return (
      <Suspense fallback={fallback || <DefaultFallback />}>
        <LazyComponent {...(props as T)} />
      </Suspense>
    );
  };
}

export default LazyLoader;
