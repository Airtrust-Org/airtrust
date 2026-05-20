import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';

export interface QualificacaoHistoricoItem {
  id: number;
  funcionario_id: number;
  tipo_id: number;
  data_realizacao: string;
  data_vencimento: string;
  renovada?: number | boolean;
  numero_certificado?: string | null;
  observacao?: string | null;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  funcionario_codigo_anac?: string;
  funcionario_funcao?: string;
  tipo_nome?: string;
  tipo_codigo?: string;
  tipo_categoria?: string;
  validade_meses?: number | null;
  status?: string; // derivado (VALIDA, VENCIDA, VENCENDO_30, RENOVADA)
}

interface HistoricoResponse {
  success: boolean;
  data: QualificacaoHistoricoItem[];
  meta: { page: number; limit: number; total: number };
}

export interface UseQualificacoesHistoricoParams {
  page?: number;
  limit?: number;
  status?: string; // VALIDA | VENCIDA | VENCENDO_30 | RENOVADA | TODAS
  search?: string;
  funcionarioId?: number;
  tipoId?: number;
  enabled?: boolean;
}

export function useQualificacoesHistorico({
  page = 1,
  limit = 20,
  status = 'TODAS',
  search = '',
  funcionarioId,
  tipoId,
  enabled = true,
}: UseQualificacoesHistoricoParams) {
  const { token } = useAuth();
  const [data, setData] = useState<QualificacaoHistoricoItem[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (status && status !== 'TODAS') params.set('status', status);
      if (search) params.set('search', search);
      if (funcionarioId) params.set('funcionario_id', String(funcionarioId));
      if (tipoId) params.set('tipo_id', String(tipoId));

      const url = `${API_BASE_URL.replace(/\/$/, '')}/qualificacoes/historico?${params.toString()}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      const json: Partial<HistoricoResponse & { error?: string }> = await res.json();
      if (!res.ok || !json.success) {
        const msg =
          typeof json.error === 'string' && json.error.trim() !== ''
            ? json.error
            : 'Falha ao carregar histórico';
        throw new Error(msg);
      }
      const items = Array.isArray(json.data) ? json.data : [];

      // Derivar status caso backend não tenha retornado (garantia)
      const today = new Date().toISOString().split('T')[0];
      const d30 = new Date();
      d30.setDate(d30.getDate() + 30);
      const today30 = d30.toISOString().split('T')[0];
      const enriched = items.map((r) => {
        if (r.status) return r; // já veio
        if (!r.data_vencimento) return { ...r, status: 'INDEFINIDA' };
        const dataVenc = String(r.data_vencimento || '')
          .trim()
          .slice(0, 10);
        if (!dataVenc || dataVenc.length !== 10) {
          return { ...r, status: 'INDEFINIDA' };
        }
        let s: string;
        if (r.renovada) s = 'RENOVADA';
        else if (dataVenc < today) s = 'VENCIDA';
        else if (dataVenc <= today30) s = 'VENCENDO_30';
        else s = 'VALIDA';
        return { ...r, status: s };
      });

      setData(enriched);
      setMeta(json.meta || { page, limit, total: enriched.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, search, funcionarioId, tipoId, token, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    meta,
    loading,
    error,
    refetch: fetchData,
  };
}

export function deriveHistoricoStats(rows: QualificacaoHistoricoItem[]) {
  const total = rows.length;
  const validas = rows.filter((r) => r.status === 'VALIDA').length;
  const vencidas = rows.filter((r) => r.status === 'VENCIDA').length;
  const vencendo = rows.filter((r) => r.status === 'VENCENDO_30').length;
  const renovadas = rows.filter((r) => r.status === 'RENOVADA').length;
  return { total, validas, vencendo, vencidas, renovadas };
}
