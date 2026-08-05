import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/react-app/lib/api-contract';
import { useAuth } from '@/react-app/hooks/useAuth';
import { tenantQueryKey } from '@/react-app/lib/query-client';

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

const API_BASE = '/api/funcionarios';

function mutationInit(method: string, data?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  };
}

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
  const { empresaAtualId } = useAuth();
  return useQuery({
    queryKey: tenantQueryKey(empresaAtualId, 'funcionarios', 'list', filtros),
    enabled: Boolean(empresaAtualId),
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
      return apiJson<unknown>(`${API_BASE}?${params.toString()}`);
    },
    staleTime: 60_000,
  });
}

export function useFuncionarioRQ(id: number, includeAll = false) {
  const { empresaAtualId } = useAuth();
  return useQuery({
    queryKey: tenantQueryKey(empresaAtualId, 'funcionarios', 'detail', id, includeAll),
    enabled: Boolean(id && empresaAtualId),
    queryFn: () => apiJson<Funcionario>(`${API_BASE}/${id}${includeAll ? '?include=all' : ''}`),
  });
}

export function useCriarFuncionario() {
  const qc = useQueryClient();
  const { empresaAtualId } = useAuth();
  return useMutation({
    mutationFn: (data: Omit<Funcionario, 'id'>) =>
      apiJson<Funcionario>(API_BASE, mutationInit('POST', data)),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'funcionarios') }),
  });
}

export function useAtualizarFuncionario() {
  const qc = useQueryClient();
  const { empresaAtualId } = useAuth();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Funcionario> }) =>
      apiJson<Funcionario>(`${API_BASE}/${id}`, mutationInit('PUT', data)),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: tenantQueryKey(empresaAtualId, 'funcionarios', 'detail', vars.id),
      });
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'funcionarios') });
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'qualificacoes-historico') });
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'sessoes_simulador') });
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'hospedagens') });
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'frms') });
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'auditoria') });
    },
  });
}

export function useDeletarFuncionario() {
  const qc = useQueryClient();
  const { empresaAtualId } = useAuth();
  return useMutation({
    mutationFn: (id: number) => apiJson<unknown>(`${API_BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const key of [
        'funcionarios',
        'qualificacoes-historico',
        'sessoes_simulador',
        'hospedagens',
        'frms',
      ]) {
        qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, key) });
      }
    },
  });
}

export function useVerificarDependencias(id: number) {
  const { empresaAtualId } = useAuth();
  return useQuery({
    queryKey: tenantQueryKey(empresaAtualId, 'funcionarios', 'dependencies', id),
    enabled: Boolean(id && empresaAtualId),
    queryFn: () => apiJson<unknown>(`${API_BASE}/${id}/dependencias`),
  });
}

export function useFuncionarios() {
  const { empresaAtualId } = useAuth();
  const { data, isLoading, error } = useFuncionariosRQ();
  const criarMutation = useCriarFuncionario();
  const atualizarMutation = useAtualizarFuncionario();
  const deletarMutation = useDeletarFuncionario();
  const qc = useQueryClient();

  return {
    funcionarios:
      data && typeof data === 'object' && 'data' in data
        ? ((data as { data?: unknown }).data ?? [])
        : (data ?? []),
    loading: isLoading,
    error: error?.message || null,
    criarFuncionario: (dadosFuncionario: Omit<Funcionario, 'id'>) =>
      criarMutation.mutateAsync(dadosFuncionario),
    atualizarFuncionario: (id: number, dados: Partial<Funcionario>) =>
      atualizarMutation.mutateAsync({ id, data: dados }),
    deletarFuncionario: (id: number) => deletarMutation.mutateAsync(id),
    carregarFuncionarios: () =>
      qc.invalidateQueries({ queryKey: tenantQueryKey(empresaAtualId, 'funcionarios') }),
  };
}
