/**
 * withLoading HOC - Elimina duplicação de loading states
 *
 * Padrão: Wraps componente para mostrar loading fallback
 * Uso: const ComponentWithLoading = withLoading(Component, LoadingFallback)
 */

import { ComponentType } from 'react';
import { Spinner } from '@/react-app/components/UI/Spinner';

export interface WithLoadingProps {
  isLoading: boolean;
}

/**
 * HOC que adiciona loading state condicional
 * @param Component Componente a ser renderizado
 * @param LoadingComponent Componente de loading (default: Spinner)
 * @returns Novo componente com loading support
 */
export function withLoading<P extends object>(
  Component: ComponentType<P>,
  LoadingComponent: ComponentType = Spinner,
) {
  return function WithLoadingWrapper(props: P & WithLoadingProps) {
    const { isLoading, ...restProps } = props;

    if (isLoading) {
      return <LoadingComponent />;
    }

    return <Component {...(restProps as P)} />;
  };
}

/**
 * HOC com error handling
 * @param Component Componente a ser renderizado
 * @param LoadingComponent Componente de loading
 * @param ErrorComponent Componente de erro
 * @returns Novo componente com loading e error support
 */
export function withLoadingAndError<P extends object>(
  Component: ComponentType<P>,
  LoadingComponent: ComponentType = Spinner,
  ErrorComponent: ComponentType<{ error: Error | null }> = ({ error }) => (
    <div className="flex items-center justify-center p-4">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">Erro ao carregar dados</p>
        <p className="mt-1 text-sm text-red-600">{error?.message}</p>
      </div>
    </div>
  ),
) {
  return function WithLoadingAndErrorWrapper(
    props: P & WithLoadingProps & { error?: Error | null },
  ) {
    const { isLoading, error, ...restProps } = props;

    if (error) {
      return <ErrorComponent error={error} />;
    }

    if (isLoading) {
      return <LoadingComponent />;
    }

    return <Component {...(restProps as P)} />;
  };
}

/**
 * HOC com skeleton loading
 * @param Component Componente a ser renderizado
 * @param SkeletonComponent Componente skeleton
 * @returns Novo componente com skeleton loading
 */
export function withSkeletonLoading<P extends object>(
  Component: ComponentType<P>,
  SkeletonComponent: ComponentType,
) {
  return function WithSkeletonLoadingWrapper(props: P & WithLoadingProps) {
    const { isLoading, ...restProps } = props;

    if (isLoading) {
      return <SkeletonComponent />;
    }

    return <Component {...(restProps as P)} />;
  };
}

/**
 * HOC com dados vazios
 * @param Component Componente a ser renderizado
 * @param EmptyComponent Componente para estado vazio
 * @returns Novo componente com empty state support
 */
export function withEmptyState<P extends object & { items?: unknown[] }>(
  Component: ComponentType<P>,
  EmptyComponent: ComponentType,
) {
  return function WithEmptyStateWrapper(props: P) {
    const items = props.items || [];

    if (items.length === 0) {
      return <EmptyComponent />;
    }

    return <Component {...props} />;
  };
}

/**
 * HOC combinado: loading, error, empty
 * @param Component Componente principal
 * @param options Opções de customização
 * @returns Novo componente com todo suporte
 */
export function withDataStates<P extends object & { items?: unknown[] }>(
  Component: ComponentType<P>,
  options?: {
    LoadingComponent?: ComponentType;
    ErrorComponent?: ComponentType<{ error: Error | null }>;
    EmptyComponent?: ComponentType;
  },
) {
  const {
    LoadingComponent = Spinner,
    ErrorComponent = ({ error }: { error: Error | null }) => (
      <div className="flex items-center justify-center p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Erro ao carregar</p>
          <p className="mt-1 text-sm text-red-600">{error?.message}</p>
        </div>
      </div>
    ),
    EmptyComponent = () => (
      <div className="flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Nenhum item encontrado</p>
      </div>
    ),
  } = options || {};

  return function WithDataStatesWrapper(props: P & WithLoadingProps & { error?: Error | null }) {
    const { isLoading, error, items = [], ...restProps } = props;

    if (error) {
      return <ErrorComponent error={error} />;
    }

    if (isLoading) {
      return <LoadingComponent />;
    }

    if (items.length === 0) {
      return <EmptyComponent />;
    }

    return <Component {...(restProps as P)} items={items} />;
  };
}

export default withLoading;
