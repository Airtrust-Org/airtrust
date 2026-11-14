import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/react-app/config/api';
import { baixarCertificadoCanonico } from '@/react-app/utils/certificadoDownload';
import { notifyDataChanged, onDataChanged } from '@/react-app/utils/data-sync';

export interface Certificado {
  id: number;
  documento_id?: number;
  pasta_virtual_id?: number | null;
  historico_id?: number;
  nome_arquivo: string;
  arquivo_nome?: string;
  url?: string;
  arquivo_url?: string;
  tamanho: number;
  arquivo_tamanho?: number;
  tipo: string;
  numero_certificado?: string;
  created_at: string;
  updated_at?: string;
}

export interface UseCertificadosReturn {
  certificados: Certificado[];
  loading: boolean;
  error: string | null;
  gerar: () => Promise<{ id: number; url: string; filename: string } | null>;
  download: (id: number) => Promise<void>;
  carregar: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useCertificados(qualificacao_id: number | null): UseCertificadosReturn {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega certificados da API
   */
  const carregar = useCallback(async () => {
    if (!qualificacao_id) {
      setCertificados([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Endpoint único para listar certificados de uma qualificação
      const response = await fetchWithAuth(
        `/api/certificados/historico/${qualificacao_id}/certificados`,
      );

      if (!response.ok) {
        throw new Error(`Erro ao carregar certificados: ${response.statusText}`);
      }

      const data = await response.json();
      const certs = data.data || data || [];

      // Normalizar nomes de propriedades
      const normalized = certs.map((c: any) => ({
        id: c.id,
        documento_id: c.documento_id ?? c.id,
        pasta_virtual_id: c.pasta_virtual_id ?? null,
        historico_id: c.historico_id ?? qualificacao_id,
        nome_arquivo: c.nome_arquivo || c.arquivo_nome || 'CERTIFICADO.pdf',
        arquivo_nome: c.nome_arquivo || c.arquivo_nome || 'CERTIFICADO.pdf',
        url: c.r2_key || c.url || '',
        arquivo_url: c.r2_key || c.arquivo_url || '',
        tamanho: c.tamanho || c.arquivo_tamanho || 0,
        arquivo_tamanho: c.tamanho || c.arquivo_tamanho || 0,
        tipo: c.tipo || 'application/pdf',
        numero_certificado: c.numero_certificado || '',
        created_at: c.created_at || new Date().toISOString(),
        updated_at: c.updated_at,
      }));

      setCertificados(normalized);
      setError(null);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(mensagem);
      console.error('❌ [useCertificados] Erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [qualificacao_id]);

  /**
   * Gera novo certificado PDF
   * Endpoint: POST /api/certificados/historico/:qualificacao_id/certificados/gerar
   */
  const gerar = async () => {
    if (!qualificacao_id) {
      setError('ID de qualificação não informado');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithAuth(
        `/api/certificados/historico/${qualificacao_id}/certificados/gerar`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ao gerar certificado: ${response.statusText}`);
      }

      const resultado = await response.json();
      console.log('✅ [useCertificados] Certificado gerado:', resultado.data);

      // Recarregar lista de certificados e sincronizar módulos relacionados
      await carregar();
      notifyDataChanged('qualificacoes');

      return resultado.data;
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Erro ao gerar certificado';
      setError(mensagem);
      console.error('❌ [useCertificados] Erro ao gerar:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Faz download de um certificado
   * Usa SEMPRE o endpoint centralizado: GET /api/pasta-virtual/stream/:id
   */
  const download = async (id: number) => {
    try {
      const cert = certificados.find((c) => c.id === id);
      if (!cert) {
        setError('Certificado não encontrado');
        return;
      }

      console.log(
        `📥 [useCertificados] Iniciando download: cert_id=${id}, nome=${cert.nome_arquivo}`,
      );

      // Usar SEMPRE endpoint centralizado de pasta-virtual
      await baixarCertificadoCanonico(cert);

      console.log('✅ [useCertificados] Download concluído');
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Erro ao baixar certificado';
      setError(mensagem);
      console.error('❌ [useCertificados] Erro ao baixar:', err);
    }
  };

  /**
   * Carrega certificados ao mudar qualificacao_id
   */
  useEffect(() => {
    if (qualificacao_id) {
      carregar();
    }
    return onDataChanged(
      () => {
        if (qualificacao_id) void carregar();
      },
      ['qualificacoes', 'lms'],
    );
  }, [qualificacao_id, carregar]);

  return {
    certificados,
    loading,
    error,
    gerar,
    download,
    carregar,
    refetch: carregar,
  };
}

/**
 * Hook para estatísticas de certificados (global) - DEPRECATED
 * Manter por compatibilidade, mas não adicionar novas funcionalidades
 */
export interface EstatisticasCertificados {
  total: number;
  ativos: number;
  vencidos: number;
  substituidos: number;
}

export function useEstatisticasCertificados() {
  const [stats, setStats] = useState<EstatisticasCertificados>({
    total: 0,
    ativos: 0,
    vencidos: 0,
    substituidos: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setLoading(true);
      setError(null);
      // Este hook não é mais usado, manter para retrocompatibilidade
      setStats({ total: 0, ativos: 0, vencidos: 0, substituidos: 0 });
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(mensagem);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  return { stats, loading, error, refetch: carregar };
}
