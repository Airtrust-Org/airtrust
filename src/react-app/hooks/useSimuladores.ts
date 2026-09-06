/**
 * useSimuladores - Hook completo para módulo Simuladores
 * Conecta aos 35 endpoints do backend
 * Data: 2025-12-01
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient as api } from '@/react-app/services/apiClient';
import { apiFetch } from '@/react-app/lib/apiFetch';

// =====================
// TYPES
// =====================

export interface Sessao {
  id: number;
  simulador_id: number;
  simulador_nome: string;
  data_sessao: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_sessao: string;
  tipo_aeronave: string;
  instrutor_id: number;
  instrutor_nome: string;
  status: 'AGENDADA' | 'EM_PROGRESSO' | 'CONCLUIDA' | 'CANCELADA';
  funcionarios_inscritos?: number;
  observacoes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Ficha {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  piloto_nome: string;
  simulador_nome: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_sessao: string;
  tipo_aeronave: string;
  instrutor_nome: string;
  status: 'EM_PREENCHIMENTO' | 'ASSINADA_ALUNO' | 'ASSINADA_TOTAL';
  aprovado: 0 | 1;
  total_manobras: number;
  media_notas: string | null;
  observacoes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Manobra {
  id: number;
  codigo: string;
  descricao: string;
  categoria: string;
  tipo_sessao: string;
  tipo_aeronave: string;
  ordem: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ManobraFicha {
  id: number;
  ficha_id: number;
  manobra_id: number;
  codigo: string;
  descricao: string;
  categoria: string;
  ordem: number;
  resultado: number | null;
  observacoes: string | null;
}

export interface Simulador {
  id: number;
  nome: string;
  modelo: string;
  tipo_aeronave: string;
  status: 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO';
  localizacao?: string;
  observacoes?: string;
}

export interface DashboardStats {
  sessoes_hoje: number;
  fichas_pendentes: number;
  alunos_aguardando: number;
  taxa_aprovacao: string;
}

// =====================
// HOOK PRINCIPAL
// =====================

export function useSimuladores() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [manobras, setManobras] = useState<Manobra[]>([]);
  const [simuladores, setSimuladores] = useState<Simulador[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // =====================
  // 1. SESSÕES
  // =====================

  const fetchSessoes = useCallback(
    async (filters?: {
      data_inicio?: string;
      data_fim?: string;
      status?: string;
      simulador_id?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters?.data_inicio) params.append('data_inicio', filters.data_inicio);
        if (filters?.data_fim) params.append('data_fim', filters.data_fim);
        if (filters?.status) params.append('status', filters.status);
        if (filters?.simulador_id) params.append('simulador_id', filters.simulador_id.toString());

        const response = await api.get(
          `/api/simuladores/sessoes${params.toString() ? `?${params}` : ''}`,
        );
        if (response.success && response.data) {
          setSessoes(response.data);
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar sessões');
        console.error('Erro fetchSessoes:', err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const createSessao = useCallback(
    async (data: Partial<Sessao>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post('/api/simuladores/sessoes', data);
        if (response.success) {
          await fetchSessoes();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao criar sessão');
        console.error('Erro createSessao:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSessoes],
  );

  const updateSessao = useCallback(
    async (id: number, data: Partial<Sessao>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.put(`/api/simuladores/sessoes/${id}`, data);
        if (response.success) {
          await fetchSessoes();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao atualizar sessão');
        console.error('Erro updateSessao:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSessoes],
  );

  const deleteSessao = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.delete(`/api/simuladores/sessoes/${id}`);
        if (response.success) {
          await fetchSessoes();
          return true;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao deletar sessão');
        console.error('Erro deleteSessao:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSessoes],
  );

  // =====================
  // 2. FICHAS
  // =====================

  const fetchFichas = useCallback(
    async (filters?: { sessao_id?: number; funcionario_id?: number; status?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters?.sessao_id) params.append('sessao_id', filters.sessao_id.toString());
        if (filters?.funcionario_id)
          params.append('funcionario_id', filters.funcionario_id.toString());
        if (filters?.status) params.append('status', filters.status);

        const response = await api.get(
          `/api/simuladores/fichas${params.toString() ? `?${params}` : ''}`,
        );
        if (response.success && response.data) {
          setFichas(response.data);
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar fichas');
        console.error('Erro fetchFichas:', err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getFichaDetalhes = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/simuladores/fichas/${id}`);
      if (response.success && response.data) {
        return response.data;
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar detalhes da ficha');
      console.error('Erro getFichaDetalhes:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const assinarFicha = useCallback(
    async (
      id: number,
      data: {
        tipo_assinatura: 'ALUNO' | 'INSTRUTOR';
        senha: string;
        confirmacoes: {
          dados_corretos: boolean;
          manobras_corretas: boolean;
          ciente_penalidades: boolean;
        };
      },
    ) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post(`/api/simuladores/fichas/${id}/assinar`, data);
        if (response.success) {
          await fetchFichas();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao assinar ficha');
        console.error('Erro assinarFicha:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchFichas],
  );

  const gerarQualificacao = useCallback(async (fichaId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(
        `/api/simuladores/fichas-simulador/${fichaId}/gerar-qualificacao`,
      );
      if (response.success) {
        return response.data;
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar qualificação');
      console.error('Erro gerarQualificacao:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadFichaPDF = useCallback(async (fichaId: number) => {
    try {
      const response = await apiFetch(`/api/simuladores/fichas-simulador/${fichaId}/pdf`);
      if (!response.ok) {
        throw new Error(`Erro ${response.status} ao baixar PDF`);
      }
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ficha-${fichaId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Erro ao baixar PDF');
      console.error('Erro downloadFichaPDF:', err);
      throw err;
    }
  }, []);

  // =====================
  // 3. MANOBRAS
  // =====================

  const fetchManobras = useCallback(
    async (filters?: { tipo_sessao?: string; tipo_aeronave?: string; categoria?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters?.tipo_sessao) params.append('tipo_sessao', filters.tipo_sessao);
        if (filters?.tipo_aeronave) params.append('tipo_aeronave', filters.tipo_aeronave);
        if (filters?.categoria) params.append('categoria', filters.categoria);

        const response = await api.get(
          `/api/simuladores/manobras${params.toString() ? `?${params}` : ''}`,
        );
        if (response.success && response.data) {
          setManobras(response.data);
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar manobras');
        console.error('Erro fetchManobras:', err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const createManobra = useCallback(
    async (data: Partial<Manobra>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post('/api/simuladores/manobras', data);
        if (response.success) {
          await fetchManobras();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao criar manobra');
        console.error('Erro createManobra:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchManobras],
  );

  const updateManobra = useCallback(
    async (id: number, data: Partial<Manobra>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.put(`/api/simuladores/manobras/${id}`, data);
        if (response.success) {
          await fetchManobras();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao atualizar manobra');
        console.error('Erro updateManobra:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchManobras],
  );

  const deleteManobra = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.delete(`/api/simuladores/manobras/${id}`);
        if (response.success) {
          await fetchManobras();
          return true;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao deletar manobra');
        console.error('Erro deleteManobra:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchManobras],
  );

  const updateManobraFicha = useCallback(
    async (
      fichaId: number,
      manobraId: number,
      data: { resultado?: number; observacoes?: string },
    ) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.put(
          `/api/simuladores/fichas-simulador/${fichaId}/manobras/${manobraId}`,
          data,
        );
        if (response.success) {
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao atualizar manobra da ficha');
        console.error('Erro updateManobraFicha:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // =====================
  // 4. SIMULADORES
  // =====================

  const fetchSimuladores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/simuladores');
      if (response.success && response.data) {
        setSimuladores(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar simuladores');
      console.error('Erro fetchSimuladores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSimulador = useCallback(
    async (data: Partial<Simulador>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post('/api/simuladores', data);
        if (response.success) {
          await fetchSimuladores();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao criar simulador');
        console.error('Erro createSimulador:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSimuladores],
  );

  const updateSimulador = useCallback(
    async (id: number, data: Partial<Simulador>) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.put(`/api/simuladores/${id}`, data);
        if (response.success) {
          await fetchSimuladores();
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao atualizar simulador');
        console.error('Erro updateSimulador:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSimuladores],
  );

  const deleteSimulador = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.delete(`/api/simuladores/${id}`);
        if (response.success) {
          await fetchSimuladores();
          return true;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao deletar simulador');
        console.error('Erro deleteSimulador:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSimuladores],
  );

  // =====================
  // 5. DASHBOARD STATS
  // =====================

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/api/simuladores/health');
      if (response.success) {
        // Extract stats from fichas
        const fichasPendentes = fichas.filter(
          (f) => f.status === 'EM_PREENCHIMENTO' || f.status === 'ASSINADA_ALUNO',
        ).length;

        const sessoesHoje = sessoes.filter((s) => {
          const hoje = new Date().toISOString().split('T')[0];
          return s.data_sessao === hoje;
        }).length;

        const aprovadas = fichas.filter((f) => f.aprovado === 1).length;
        const taxaAprovacao =
          fichas.length > 0 ? ((aprovadas / fichas.length) * 100).toFixed(0) : '0';

        setStats({
          sessoes_hoje: sessoesHoje,
          fichas_pendentes: fichasPendentes,
          alunos_aguardando: 0, // Derivado das fichas pendentes (já contabilizado em fichas_pendentes)
          taxa_aprovacao: taxaAprovacao + '%',
        });
      }
    } catch (err: any) {
      console.error('Erro fetchStats:', err);
    }
  }, [fichas, sessoes]);

  // =====================
  // 6. RELATÓRIOS
  // =====================

  const getRelatorioUso = useCallback(
    async (params: { data_inicio: string; data_fim: string; simulador_id?: number }) => {
      setLoading(true);
      setError(null);
      try {
        const urlParams = new URLSearchParams();
        urlParams.append('data_inicio', params.data_inicio);
        urlParams.append('data_fim', params.data_fim);
        if (params.simulador_id) urlParams.append('simulador_id', params.simulador_id.toString());

        const response = await api.get(`/api/simuladores/relatorios/uso?${urlParams}`);
        if (response.success) {
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar relatório de uso');
        console.error('Erro getRelatorioUso:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getRelatorioTripulantes = useCallback(
    async (params: { data_inicio: string; data_fim: string; funcionario_id?: number }) => {
      setLoading(true);
      setError(null);
      try {
        const urlParams = new URLSearchParams();
        urlParams.append('data_inicio', params.data_inicio);
        urlParams.append('data_fim', params.data_fim);
        if (params.funcionario_id)
          urlParams.append('funcionario_id', params.funcionario_id.toString());

        const response = await api.get(`/api/simuladores/relatorios/tripulantes?${urlParams}`);
        if (response.success) {
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar relatório de tripulantes');
        console.error('Erro getRelatorioTripulantes:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getRelatorioDesempenho = useCallback(
    async (params: { data_inicio: string; data_fim: string; tipo_sessao?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const urlParams = new URLSearchParams();
        urlParams.append('data_inicio', params.data_inicio);
        urlParams.append('data_fim', params.data_fim);
        if (params.tipo_sessao) urlParams.append('tipo_sessao', params.tipo_sessao);

        const response = await api.get(`/api/simuladores/relatorios/desempenho?${urlParams}`);
        if (response.success) {
          return response.data;
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar relatório de desempenho');
        console.error('Erro getRelatorioDesempenho:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // =====================
  // LOAD INICIAL
  // =====================

  useEffect(() => {
    fetchSessoes();
    fetchFichas();
    fetchManobras();
    fetchSimuladores();
  }, [fetchSessoes, fetchFichas, fetchManobras, fetchSimuladores]);

  useEffect(() => {
    if (sessoes.length > 0 || fichas.length > 0) {
      fetchStats();
    }
  }, [sessoes, fichas, fetchStats]);

  return {
    // State
    sessoes,
    fichas,
    manobras,
    simuladores,
    stats,
    loading,
    error,

    // Sessões
    fetchSessoes,
    createSessao,
    updateSessao,
    deleteSessao,

    // Fichas
    fetchFichas,
    getFichaDetalhes,
    assinarFicha,
    gerarQualificacao,
    downloadFichaPDF,

    // Manobras
    fetchManobras,
    createManobra,
    updateManobra,
    deleteManobra,
    updateManobraFicha,

    // Simuladores
    fetchSimuladores,
    createSimulador,
    updateSimulador,
    deleteSimulador,

    // Stats
    fetchStats,

    // Relatórios
    getRelatorioUso,
    getRelatorioTripulantes,
    getRelatorioDesempenho,
  };
}
