import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/react-app/services/apiClient';

export interface Funcionario {
  id?: number;
  nome: string;
  guerra?: string | null;
  email?: string | null;
  matricula?: string | null;
  cpf?: string | null;
  cargo?: string | null;
  funcao?: string | null;
  setor?: string | null;
  base?: string | null;
  aeronave?: string | null;
  escala?: string | null;
  status?: string;
  is_instrutor?: number;
  is_checador?: number;
  codigo_anac?: string | null;
  nivel_icao?: string | null;
  validade_icao?: string | null;
  cma?: string | null;
  validade_cma?: string | null;
  aso?: string | null;
  validade_aso?: string | null;
  sispat?: string | null;
  prestserv?: string | null;
  endereco?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  telefone_emergencia?: string | null;
  contato_emergencia_nome?: string | null;
  admissao?: string | null;
  foto_url?: string | null;
  observacoes?: string | null;
  qualificacoes?: unknown[];
  sessoes_simulador?: unknown[];
  hospedagens?: unknown[];
  registros_frms?: unknown[];
}

const API_BASE = '/funcionarios';

export function useFuncionariosRQ(filtros?: {
  status?: string;
  setor?: string;
  cargo?: string;
  base?: string;
  funcao?: string;
  search?: string;
  is_instrutor?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['funcionarios', filtros],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtros?.status) params.set('status', filtros.status);
      if (filtros?.setor) params.set('setor', filtros.setor);
      if (filtros?.cargo) params.set('cargo', filtros.cargo);
      if (filtros?.base) params.set('base', filtros.base);
      if (filtros?.funcao) params.set('funcao', filtros.funcao);
      if (filtros?.search?.trim()) params.set('search', filtros.search.trim());
      if (filtros?.is_instrutor) params.set('is_instrutor', 'true');
      if (filtros?.page) params.set('page', String(filtros.page));
      if (filtros?.limit) params.set('limit', String(filtros.limit));
      const response = await apiClient.get<unknown>(`${API_BASE}?${params.toString()}`);
      if (!response.success) {
        throw new Error(response.error || 'Erro ao buscar funcionários');
      }
      return response.data || response;
    },
    staleTime: 60_000,
  });
}

export function useFuncionarioRQ(id: number, includeAll = false) {
  return useQuery({
    queryKey: ['funcionario', id, includeAll],
    enabled: !!id,
    queryFn: async () => {
      const url = `${API_BASE}/${id}${includeAll ? '?include=all' : ''}`;
      const response = await apiClient.get<unknown>(url);
      if (!response.success) {
        throw new Error(response.error || 'Erro ao buscar funcionário');
      }
      return response.data || response;
    },
  });
}

export function useCriarFuncionario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<Funcionario, 'id'>) => {
      const response = await apiClient.post<unknown>(API_BASE, data);
      if (!response.success) {
        throw new Error(response.error || 'Erro ao criar funcionário');
      }
      return response.data || response;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funcionarios'] }),
  });
}

export function useAtualizarFuncionario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Funcionario> }) => {
      const response = await apiClient.put<unknown>(`${API_BASE}/${id}`, data);
      if (!response.success) {
        throw new Error(response.error || 'Erro ao atualizar funcionário');
      }
      return response.data || response;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['funcionario', vars.id] });
      qc.invalidateQueries({ queryKey: ['funcionarios'] });
      qc.invalidateQueries({ queryKey: ['qualificacoes-historico'] });
      qc.invalidateQueries({ queryKey: ['sessoes_simulador'] });
      qc.invalidateQueries({ queryKey: ['hospedagens'] });
      qc.invalidateQueries({ queryKey: ['frms'] });
      qc.invalidateQueries({ queryKey: ['auditoria'] });
    },
  });
}

export function useDeletarFuncionario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.delete<unknown>(`${API_BASE}/${id}`);
      if (!response.success) {
        throw new Error(response.error || 'Erro ao deletar funcionário');
      }
      return response.data || response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funcionarios'] });
      qc.invalidateQueries({ queryKey: ['qualificacoes-historico'] });
      qc.invalidateQueries({ queryKey: ['sessoes_simulador'] });
      qc.invalidateQueries({ queryKey: ['hospedagens'] });
      qc.invalidateQueries({ queryKey: ['frms'] });
    },
  });
}

export function useVerificarDependencias(id: number) {
  return useQuery({
    queryKey: ['funcionario-deps', id],
    enabled: !!id,
    queryFn: async () => {
      const response = await apiClient.get<unknown>(`${API_BASE}/${id}/dependencias`);
      if (!response.success) {
        throw new Error(response.error || 'Erro ao verificar dependências');
      }
      return response.data || response;
    },
  });
}

/**
 * Hook composto que expõe a interface esperada pelo FuncionariosWrapper
 * Combina useFuncionariosRQ com mutations para CRUD operations
 */
export function useFuncionarios() {
  const { data, isLoading, error } = useFuncionariosRQ();
  const criarMutation = useCriarFuncionario();
  const atualizarMutation = useAtualizarFuncionario();
  const deletarMutation = useDeletarFuncionario();
  const qc = useQueryClient();

  return {
    // Query results
    funcionarios:
      data && typeof data === 'object' && 'data' in data
        ? ((data as { data?: unknown }).data ?? [])
        : (data ?? []),
    loading: isLoading,
    error: error?.message || null,

    // Mutations
    criarFuncionario: async (dadosFuncionario: Omit<Funcionario, 'id'>) => {
      const result = await criarMutation.mutateAsync(dadosFuncionario);
      return result;
    },

    atualizarFuncionario: async (id: number, dados: Partial<Funcionario>) => {
      const result = await atualizarMutation.mutateAsync({ id, data: dados });
      return result;
    },

    deletarFuncionario: async (id: number) => {
      const result = await deletarMutation.mutateAsync(id);
      return result;
    },

    carregarFuncionarios: async () => {
      await qc.invalidateQueries({ queryKey: ['funcionarios'] });
    },
  };
}
