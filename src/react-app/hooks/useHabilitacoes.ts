/**
 * 🎯 useHabilitacoes.ts - Hook para Habilitações
 * ⚠️ DEPRECATED: Este hook está sendo substituído por useQualificacoesHistorico
 * Mantido para compatibilidade retroativa
 * Interface compatível com Habilitacoes.tsx original
 */

import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { getAccessToken } from '@/react-app/config/api';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

export interface Habilitacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  data_conclusao: string;
  data_vencimento: string;
  resultado: string;
  observacoes?: string;
  certificado_url?: string;
  nota_final?: number;
  status: string;
  eh_renovada: boolean;
  renovada_em?: string | null;
  habilitacao_anterior_id?: number | null;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  categoria_nome?: string;
  validade_meses?: number;
  carga_horaria?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  dias_para_vencimento?: number;
}

interface ListResponse {
  success: boolean;
  data: Habilitacao[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  timestamp?: string;
}

interface StatsResponse {
  success: boolean;
  data: {
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
  };
  timestamp?: string;
}

function getToken(): string | null {
  try {
    return (
      getAccessToken() ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('auth_token')
    );
  } catch {
    return null;
  }
}

/**
 * Hook principal para listar e gerenciar habilitações
 * ⚠️ DEPRECATED: Use useQualificacoesHistorico() em novos componentes
 * Interface compatível com a página original
 */
export function useHabilitacoes() {
  // Deprecation warning in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '⚠️ DEPRECATED: useHabilitacoes() será removido em versões futuras. Use useQualificacoesHistorico() em novos componentes.',
      );
    }
  }, []);

  const [habilitacoes, setHabilitacoes] = useState<Habilitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10000, total: 0, pages: 0 });

  const carregar = useCallback(
    async (
      page: number = 1,
      limit: number = 10000,
      filters?: {
        status?: string;
        funcionario_id?: number;
        qualificacao_id?: number;
        search?: string;
      },
    ) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append('page', String(page));
        params.append('limit', String(limit));
        if (filters?.status) params.append('status', filters.status);
        if (filters?.funcionario_id)
          params.append('funcionario_id', String(filters.funcionario_id));
        if (filters?.qualificacao_id)
          params.append('qualificacao_id', String(filters.qualificacao_id));
        if (filters?.search) params.append('search', filters.search);

        // Atualizado para usar endpoint correto (qualificacoes-historico)
        const token = getToken();
        const response = await fetch(
          `${API_BASE_URL}/qualificacoes/historico?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
        }

        const json = (await response.json()) as ListResponse;

        if (!json.success) {
          throw new Error(
            json.data?.length === 0 ? 'Nenhuma habilitação encontrada' : 'Erro ao carregar',
          );
        }

        setHabilitacoes(json.data || []);
        if (json.pagination) {
          setPagination(json.pagination);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
        console.error('❌ Erro ao carregar habilitações:', err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * 🔄 MUTAÇÃO LOCAL: Atualizar uma habilitação específica no estado
   * Sem fazer requisição ao servidor - apenas atualiza o React state
   * Útil para: upload de certificados, edições rápidas, etc.
   */
  const mutarHabilitacao = useCallback(
    (habilitacaoId: number, atualizacoes: Partial<Habilitacao>) => {
      setHabilitacoes((prev) =>
        prev.map((hab) => (hab.id === habilitacaoId ? { ...hab, ...atualizacoes } : hab)),
      );
    },
    [],
  );

  /**
   * 🔄 MUTAÇÃO LOCAL: Adicionar uma nova habilitação ao estado
   */
  const adicionarHabilitacao = useCallback((novaHab: Habilitacao) => {
    setHabilitacoes((prev) => [novaHab, ...prev]);
  }, []);

  /**
   * 🔄 MUTAÇÃO LOCAL: Remover uma habilitação do estado
   */
  const removerHabilitacao = useCallback((habilitacaoId: number) => {
    setHabilitacoes((prev) => prev.filter((hab) => hab.id !== habilitacaoId));
  }, []);

  // Carregar na montagem
  useEffect(() => {
    carregar(1, 10000);
  }, [carregar]);

  return {
    habilitacoes,
    loading,
    error,
    pagination,
    carregar,
    mutarHabilitacao,
    adicionarHabilitacao,
    removerHabilitacao,
    // Helpers adicionados para certificados usando endpoints v2-old
    async uploadCertificado(habilitacaoId: number, file: File): Promise<string | null> {
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error('Arquivo muito grande (máx. 100MB)');
        if (!file.type.includes('pdf')) throw new Error('Apenas arquivos PDF são permitidos');

        const hab = habilitacoes.find((h) => h.id === habilitacaoId);
        if (!hab) throw new Error('Habilitação não encontrada na lista');

        const formData = new FormData();
        formData.append('arquivo', file);
        formData.append('habilitacao_id', String(habilitacaoId));
        formData.append('funcionario_id', String(hab.funcionario_id));
        formData.append('qualificacao_id', String(hab.qualificacao_id));

        const uploadToken = getToken();
        const resp = await fetch(`${API_BASE_URL}/certificados-v2-old/upload`, {
          method: 'POST',
          headers: uploadToken ? { Authorization: `Bearer ${uploadToken}` } : {},
          body: formData,
        });

        const json = await resp.json();
        if (!resp.ok) {
          if (resp.status === 413) throw new Error('Arquivo muito grande');
          if (resp.status === 415) throw new Error('Formato de arquivo não suportado');
          throw new Error(json?.error || 'Erro ao fazer upload');
        }

        // Recarregar lista do funcionário
        await carregar(1, pagination.limit, { funcionario_id: hab.funcionario_id });
        return json?.data?.id ? String(json.data.id) : null;
      } catch (e: unknown) {
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
    async downloadCertificado(habilitacaoId: number): Promise<void> {
      const hab = habilitacoes.find((h) => h.id === habilitacaoId);
      if (!hab) throw new Error('Habilitação não encontrada na lista');

      // Buscar certificados por funcionário/qualificação e baixar o mais recente
      const listResp = await fetch(
        `${API_BASE_URL}/certificados-v2-old/funcionario/${hab.funcionario_id}/qualificacao/${hab.qualificacao_id}`,
      );
      if (!listResp.ok) throw new Error('Erro ao localizar certificados');
      const listJson = await listResp.json();
      const items = Array.isArray(listJson.data) ? listJson.data : [];
      if (items.length === 0) throw new Error('Nenhum certificado encontrado');

      const cert = items[0];
      let filename = 'certificado.pdf';
      await previewPdfBeforeDownload({
        fileName: filename,
        title: 'Certificado',
        fetcher: async () => {
          const dlResp = await fetch(`${API_BASE_URL}/certificados-v2-old/download/${cert.id}`);
          if (!dlResp.ok) throw new Error('Erro ao baixar certificado');

          const contentDisposition = dlResp.headers.get('Content-Disposition');
          if (contentDisposition) {
            const match = contentDisposition.match(/filename=\"(.+)\"/);
            if (match) filename = match[1];
          }

          return dlResp;
        },
      });
    },
  };
}

/**
 * Hook para obter estatísticas
 */
export function useHabilitacoesStats() {
  const [stats, setStats] = useState<{
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch_stats = async () => {
      try {
        setLoading(true);
        setError(null);

        const statsToken = getToken();
        const response = await fetch(`${API_BASE_URL}/qualificacoes/historico/stats`, {
          method: 'GET',
          headers: {
            ...(statsToken ? { Authorization: `Bearer ${statsToken}` } : {}),
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error('Erro ao carregar stats');

        const json = (await response.json()) as StatsResponse;
        if (json.success && json.data) {
          setStats(json.data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetch_stats();
  }, []);

  return { stats, loading, error };
}

/**
 * Hook para obter qualificações disponíveis
 */
export function useQualificacoesDisponiveis() {
  const [qualificacoes, setQualificacoes] = useState<
    Array<{ id: number; nome: string; total: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE_URL}/habilitacoes/qualificacoes`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
            // X-Dev-Auth-Bypass removido para evitar CORS em produção
          },
        });

        if (!response.ok) throw new Error('Erro ao carregar qualificações');

        const json = (await response.json()) as {
          success: boolean;
          data: Array<{ id: number; nome: string; total: number }>;
        };
        if (json.success && Array.isArray(json.data)) {
          setQualificacoes(json.data);
        }
      } catch (err) {
        console.error('❌ Erro ao carregar qualificações:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { qualificacoes, loading, error };
}

/**
 * Hook para obter funcionários com habilitações
 */
export function useFuncionariosDisponiveis() {
  const [funcionarios, setFuncionarios] = useState<
    Array<{ id: number; nome: string; total: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE_URL}/habilitacoes/funcionarios`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
            // X-Dev-Auth-Bypass removido para evitar CORS em produção
          },
        });

        if (!response.ok) throw new Error('Erro ao carregar funcionários');

        const json = (await response.json()) as {
          success: boolean;
          data: Array<{ id: number; nome: string; total: number }>;
        };
        if (json.success && Array.isArray(json.data)) {
          setFuncionarios(json.data);
        }
      } catch (err) {
        console.error('❌ Erro ao carregar funcionários:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { funcionarios, loading, error };
}

/**
 * Hook para criar habilitação
 */
export function useCreateHabilitacao() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const criar = useCallback(
    async (
      dados: Omit<Habilitacao, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<Habilitacao | null> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE_URL}/habilitacoes`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
            // X-Dev-Auth-Bypass removido para evitar CORS em produção
          },
          body: JSON.stringify(dados),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }

        const json = (await response.json()) as { success: boolean; data: Habilitacao };
        if (json.success && json.data) {
          return json.data;
        }
        throw new Error('Resposta inválida');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
        console.error('❌ Erro ao criar habilitação:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { criar, loading, error };
}

/**
 * Hook para atualizar habilitação
 */
export function useUpdateHabilitacao() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atualizar = useCallback(
    async (id: number, dados: Partial<Habilitacao>): Promise<boolean> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE_URL}/habilitacoes/${id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
            'X-Dev-Auth-Bypass': '1',
          },
          body: JSON.stringify(dados),
        });

        if (!response.ok) {
          throw new Error(`Erro ao atualizar: ${response.statusText}`);
        }

        const json = (await response.json()) as { success: boolean };
        return json.success;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
        console.error('❌ Erro ao atualizar habilitação:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { atualizar, loading, error };
}

/**
 * Hook para deletar habilitação
 */
export function useDeleteHabilitacao() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deletar = useCallback(async (id: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/habilitacoes/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
          // X-Dev-Auth-Bypass removido para evitar CORS em produção
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao deletar: ${response.statusText}`);
      }

      const json = (await response.json()) as { success: boolean };
      return json.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('❌ Erro ao deletar habilitação:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deletar, loading, error };
}

/**
 * Hook para obter histórico de renovações
 */
export function useHistoricoRenovacoes(funcionarioId: number, qualificacaoId: number) {
  const [historico, setHistorico] = useState<Habilitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/habilitacoes/${funcionarioId}/${qualificacaoId}/renovacoes`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${getToken()}`,
              'Content-Type': 'application/json',
              // X-Dev-Auth-Bypass removido para evitar CORS em produção
            },
          },
        );

        if (!response.ok) throw new Error('Erro ao carregar histórico');

        const json = (await response.json()) as { success: boolean; data: Habilitacao[] };
        if (json.success && Array.isArray(json.data)) {
          setHistorico(json.data);
        }
      } catch (err) {
        console.error('❌ Erro ao carregar histórico:', err);
      } finally {
        setLoading(false);
      }
    };

    if (funcionarioId && qualificacaoId) {
      fetchData();
    }
  }, [funcionarioId, qualificacaoId]);

  return { historico, loading, error };
}
