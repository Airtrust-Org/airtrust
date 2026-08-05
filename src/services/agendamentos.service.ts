import { Agendamento, AgendamentoCreate, AgendamentoUpdate, PaginacaoParams } from '@/types';
import { apiJson } from '@/react-app/lib/api-contract';

interface FiltrosAgendamentos {
  search?: string;
  simulador_id?: string;
  funcionario_id?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
}

function jsonMutation<T>(url: string, method: string, data?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

export const agendamentosService = {
  listar: async (
    filtros?: FiltrosAgendamentos,
    paginacao?: PaginacaoParams,
  ): Promise<Agendamento[]> => {
    const params = new URLSearchParams();
    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.simulador_id) params.append('simulador_id', filtros.simulador_id);
    if (filtros?.funcionario_id) params.append('funcionario_id', filtros.funcionario_id);
    if (filtros?.status) params.append('status', filtros.status);
    if (filtros?.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros?.data_fim) params.append('data_fim', filtros.data_fim);
    if (paginacao?.page) params.append('page', String(paginacao.page));
    if (paginacao?.limit) params.append('limit', String(paginacao.limit));
    const query = params.size > 0 ? `?${params.toString()}` : '';
    return apiJson<Agendamento[]>(`/api/agendamentos${query}`);
  },

  buscarPorId: (id: string): Promise<Agendamento> =>
    apiJson<Agendamento>(`/api/agendamentos/${id}`),

  criar: (data: AgendamentoCreate): Promise<Agendamento> =>
    jsonMutation('/api/agendamentos', 'POST', data),

  atualizar: (id: string, data: AgendamentoUpdate): Promise<Agendamento> =>
    jsonMutation(`/api/agendamentos/${id}`, 'PUT', data),

  excluir: async (id: string): Promise<void> => {
    await apiJson<unknown>(`/api/agendamentos/${id}`, { method: 'DELETE' });
  },

  iniciar: (id: string): Promise<Agendamento> =>
    jsonMutation(`/api/agendamentos/${id}/iniciar`, 'POST'),

  finalizar: (id: string, dados?: unknown): Promise<Agendamento> =>
    jsonMutation(`/api/agendamentos/${id}/finalizar`, 'POST', dados),

  cancelar: (id: string, motivo?: string): Promise<Agendamento> =>
    jsonMutation(`/api/agendamentos/${id}/cancelar`, 'POST', { motivo }),
};
