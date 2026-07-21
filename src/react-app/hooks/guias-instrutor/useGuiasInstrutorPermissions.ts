/**
 * Fonte única de autorização da Biblioteca de Guias do Instrutor no
 * frontend. Nunca deriva acesso de texto de role/perfil (nem cacheado no
 * JWT) — sempre consulta o endpoint autenticado de capabilities
 * (`GET /simuladores/guias-instrutor/minhas-permissoes`), que por sua vez
 * usa a mesma lógica real do backend (DENY > GRANT > default de role,
 * com bypass incondicional de Platform Admin/Administrador Master).
 *
 * Enquanto `isLoading` for true, NENHUM componente deve exibir "Acesso
 * restrito" — mostrar skeleton/loading até a resposta real chegar.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth, API_BASE_URL } from '@/react-app/config/api';
import { useTenantQueryKey } from '@/react-app/lib/useTenantQueryKey';

export interface GuiasInstrutorPermissions {
  podeVisualizar: boolean;
  podeGerenciar: boolean;
  isPlatformAdmin: boolean;
}

const DEFAULT_PERMISSIONS: GuiasInstrutorPermissions = {
  podeVisualizar: false,
  podeGerenciar: false,
  isPlatformAdmin: false,
};

async function fetchPermissions(): Promise<GuiasInstrutorPermissions> {
  const res = await fetchWithAuth(`${API_BASE_URL}/simuladores/guias-instrutor/minhas-permissoes`);
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: GuiasInstrutorPermissions; error?: string }
    | null;
  if (!res.ok || !json?.success || !json.data) {
    throw new Error(json?.error || 'Falha ao carregar permissões dos Guias do Instrutor');
  }
  return json.data;
}

export function useGuiasInstrutorPermissions() {
  const { empresaId, tenantKey } = useTenantQueryKey();

  const query = useQuery({
    queryKey: tenantKey('guias-instrutor', 'minhas-permissoes'),
    queryFn: fetchPermissions,
    enabled: Boolean(empresaId),
    staleTime: 2 * 60 * 1000,
  });

  const data = query.data ?? DEFAULT_PERMISSIONS;

  return {
    podeVisualizar: data.podeVisualizar,
    podeGerenciar: data.podeGerenciar,
    isPlatformAdmin: data.isPlatformAdmin,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
