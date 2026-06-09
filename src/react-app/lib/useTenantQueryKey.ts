import { useAuth } from '../hooks/useAuth';
import { tenantQueryKey } from './query-client';

/**
 * Hook that returns the current empresaId for tenant-scoped query keys.
 * Components should use this to construct cache keys that automatically
 * change when the tenant switches.
 *
 * Usage in a React Query hook:
 *   const { empresaId } = useTenantQueryKey();
 *   useQuery({
 *     queryKey: ['funcionarios', 'list', empresaId, filters],
 *     ...
 *   });
 *
 * Or with the query key factory:
 *   import { queryKeys } from '@/react-app/lib/query-client';
 *   useQuery({
 *     queryKey: queryKeys.funcionarios(empresaId),
 *     ...
 *   });
 */
export function useTenantQueryKey() {
  const { empresaAtualId } = useAuth();
  return {
    empresaId: empresaAtualId ?? undefined,
    tenantKey: (...parts: unknown[]) => tenantQueryKey(empresaAtualId, ...parts),
  };
}
