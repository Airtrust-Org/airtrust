/**
 * Performance Optimization Hooks & Patterns
 *
 * Padrões reutilizáveis para otimizar componentes e evitar re-renders desnecessários
 */

import React, { memo, useCallback, useMemo, ReactNode, useContext, PropsWithChildren } from 'react';

/**
 * Higher Order Component para memoizar componentes com custom comparison
 *
 * @example
 * ```tsx
 * const FuncionarioCard = withMemo(FuncionarioCardComponent, (prev, next) => {
 *   return prev.funcionario.id === next.funcionario.id &&
 *          prev.funcionario.updated_at === next.funcionario.updated_at;
 * });
 * ```
 */
export function withMemo<P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean,
) {
  const Memoized = memo(Component, propsAreEqual);
  Memoized.displayName = `withMemo(${Component.displayName || Component.name})`;
  return Memoized;
}

/**
 * Hook para criar stable callbacks com dependências
 * Similar a useCallback mas com melhor DX
 *
 * @example
 * ```tsx
 * const handleDelete = useStableCallback((id: string) => {
 *   deleteMutation.mutate(id);
 * }, [deleteMutation]);
 * ```
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList,
): T {
  return useCallback(callback, deps) as T;
}

/**
 * Hook para listar changes de props
 * Útil para debugging de re-renders
 *
 * @example
 * ```tsx
 * useWhyDidYouUpdate('MyComponent', { prop1, prop2, prop3 });
 * ```
 */
export function useWhyDidYouUpdate(name: string, props: Record<string, any>) {
  const previousProps = useMemo(() => props, []);

  useMemo(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const allKeys = Object.keys({ ...previousProps, ...props });
    const changedProps = allKeys.reduce((acc, key) => {
      if (previousProps[key] !== props[key]) {
        acc[key] = {
          from: previousProps[key],
          to: props[key],
        };
      }
      return acc;
    }, {} as Record<string, any>);

    if (Object.keys(changedProps).length) {
      console.log(`[${name}] Changed props:`, changedProps);
    }
  }, [name, previousProps, props]);
}

/**
 * Provider wrapper com memoização de context value
 *
 * @example
 * ```tsx
 * <MemoizedProvider value={{ user, setUser }} dependencies={[user]}>
 *   <App />
 * </MemoizedProvider>
 * ```
 */
export function MemoizedProvider<T>({
  context: ContextComponent,
  value,
  dependencies,
  children,
}: {
  context: React.Context<T>;
  value: T;
  dependencies: React.DependencyList;
  children: ReactNode;
}) {
  const memoizedValue = useMemo(() => value, dependencies);

  return React.createElement(ContextComponent.Provider, { value: memoizedValue }, children);
}

/**
 * Padrão para memoizar lista com dependências
 *
 * @example
 * ```tsx
 * const funcionarios = useMemoList(data, [data]);
 * ```
 */
export function useMemoList<T>(items: T[], deps: React.DependencyList): T[] {
  return useMemo(() => items, deps);
}

/**
 * Padrão para comparação eficiente de objetos
 * Compara apenas fields específicos, ignorando outros
 *
 * @example
 * ```tsx
 * const handleMemoize = (prev, next) =>
 *   simpleCompare(prev.funcionario, next.funcionario, ['id', 'updated_at']);
 * ```
 */
export function simpleCompare<T extends object>(prev: T, next: T, fields: (keyof T)[]): boolean {
  return fields.every((field) => prev[field] === next[field]);
}

/**
 * Hook para selector otimizado de Context
 * Reduz re-renders ao extrair apenas field necessário
 *
 * @example
 * ```tsx
 * const theme = useContextSelector(ThemeContext, ctx => ctx.theme);
 * ```
 */
export function useContextSelector<T, R>(context: React.Context<T>, selector: (ctx: T) => R): R {
  const ctx = useContext(context);
  return useMemo(() => selector(ctx), [ctx, selector]);
}

export default {
  withMemo,
  useStableCallback,
  useWhyDidYouUpdate,
  MemoizedProvider,
  useMemoList,
  simpleCompare,
  useContextSelector,
};
