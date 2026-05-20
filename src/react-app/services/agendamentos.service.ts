import api from './api';
import { Agendamento, AgendamentoCreate, AgendamentoUpdate, PaginacaoParams } from '@/types';

interface FiltrosAgendamentos {
  search?: string;
  simulador_id?: string;
  funcionario_id?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
}

export const agendamentosService = {
  listar: async (filtros?: FiltrosAgendamentos, paginacao?: PaginacaoParams): Promise<Agendamento[]> => {
    const params = new URLSearchParams();

    if (filtros?.search) params.append('search', filtros.search);
    if (filtros?.simulador_id) params.append('simulador_id', filtros.simulador_id);
    if (filtros?.funcionario_id) params.append('funcionario_id', filtros.funcionario_id);
    if (filtros?.status) params.append('status', filtros.status);
    if (filtros?.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros?.data_fim) params.append('data_fim', filtros.data_fim);
    if (paginacao?.page) params.append('page', paginacao.page.toString());
    if (paginacao?.limit) params.append('limit', paginacao.limit.toString());

    return api.get(`/agendamentos?${params}`);
  },

  buscarPorId: async (id: string): Promise<Agendamento> => {
    return api.get(`/agendamentos/${id}`);
  },

  criar: async (data: AgendamentoCreate): Promise<Agendamento> => {
    return api.post('/agendamentos', data);
  },

  atualizar: async (id: string, data: AgendamentoUpdate): Promise<Agendamento> => {
    return api.put(`/agendamentos/${id}`, data);
  },

  excluir: async (id: string): Promise<void> => {
    return api.delete(`/agendamentos/${id}`);
  },

  iniciar: async (id: string): Promise<Agendamento> => {
    return api.post(`/agendamentos/${id}/iniciar`);
  },

  finalizar: async (id: string, dados?: any): Promise<Agendamento> => {
    return api.post(`/agendamentos/${id}/finalizar`, dados);
  },

  cancelar: async (id: string, motivo?: string): Promise<Agendamento> => {
    return api.post(`/agendamentos/${id}/cancelar`, { motivo });
  }
};
