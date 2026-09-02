/**
 * useOperationalAccess — gestor operational-domain autonomy (frontend UX only)
 *
 * Thin React Query wrapper around GET /api/me/operational-access. This is
 * UX convenience for showing/hiding menus, routes and action buttons — the
 * backend (worker-airtrust/src/services/operational-domain-access.ts) is
 * the sole authority. A user who bypasses the UI still hits the same
 * backend guard on every mutating request.
 *
 * Query key includes empresaAtualId + user id so switching company (or
 * logging in as a different user) invalidates the cached access set
 * instead of leaking the previous tenant's domains/setores.
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/react-app/services/apiClient';
import { useAuth } from './useAuth';

export const OPERATIONAL_DOMAINS = [
  'OPERACOES',
  'MANUTENCAO',
  'SGSO',
  'FRMS',
  'CORPORATIVO',
] as const;

export type OperationalDomain = (typeof OPERATIONAL_DOMAINS)[number];

export type OperationalAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'complete'
  | 'reopen'
  | 'cancel'
  | 'publish'
  | 'unpublish'
  | 'issue'
  | 'reissue'
  | 'revoke'
  | 'import'
  | 'export';

interface OperationalAccessResponse {
  administrative_role: string | null;
  enabled: boolean;
  domains: OperationalDomain[];
  setor_ids: number[];
  actions: Partial<Record<OperationalDomain, OperationalAction[]>>;
}

const EMPTY_ACCESS: OperationalAccessResponse = {
  administrative_role: null,
  enabled: false,
  domains: [],
  setor_ids: [],
  actions: {},
};

export function useOperationalAccess() {
  const { user, empresaAtualId, isAuthenticated } = useAuth() as {
    user: { id?: number | string } | null;
    empresaAtualId: number | null;
    isAuthenticated?: boolean;
  };

  const enabledQuery = !!user?.id && !!empresaAtualId;

  const query = useQuery({
    queryKey: ['operational-access', empresaAtualId, user?.id],
    enabled: enabledQuery,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await apiClient.get<OperationalAccessResponse>('/me/operational-access');
      if (!response.success) {
        throw new Error(response.error || 'Erro ao carregar acesso operacional');
      }
      return (response.data as OperationalAccessResponse) ?? EMPTY_ACCESS;
    },
  });

  const access = query.data ?? EMPTY_ACCESS;

  /**
   * Whether the current user can perform `action` in `domain`. Always
   * false while the tenant hasn't enabled the new RBAC (access.enabled is
   * false) OR while the query hasn't resolved yet — callers that need a
   * legacy fallback (e.g. "show button unless we positively know it's
   * disallowed") should check `access.enabled` separately rather than
   * relying on canOperate() as a general-purpose permission check; this
   * hook only ever narrows, never widens, what usePermissions() already
   * allows.
   */
  function canOperate(params: { domain: OperationalDomain; action: OperationalAction }): boolean {
    if (!access.enabled) return false;
    const domainActions = access.actions[params.domain];
    return !!domainActions && domainActions.includes(params.action);
  }

  function hasDomain(domain: OperationalDomain): boolean {
    return access.domains.includes(domain);
  }

  return {
    ...access,
    canOperate,
    hasDomain,
    isLoading: query.isLoading,
    isReady: !query.isLoading && !query.isError,
    isAuthenticated: !!isAuthenticated,
  };
}

export type OperationalAccessHook = ReturnType<typeof useOperationalAccess>;
