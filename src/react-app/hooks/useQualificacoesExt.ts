/**
 * Hooks para Histórico de Qualificações e Habilitações (Módulo 2)
 * Endpoints: /api/qualificacoes/historico, /api/qualificacoes/habilitacoes
 */

import { useApi } from './useApi';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { hasActiveCertificateFlag } from '@/react-app/utils/certificadoStatus';

export interface HistoricoQualificacao {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  status?: string;
  qualificacao_status?: string;
  validade?: string | number; // pode ser string (data) ou number (meses)
  data_registro: string;
  renovada?: number | boolean; // Flag de qualificação renovada (1 = renovada, 0 = não)
  funcionario_nome: string;
  funcionario_guerra?: string;
  funcionario_matricula?: string;
  funcionario_codigo_anac?: string;
  funcionario_cargo?: string;
  funcionario_funcao?: string;
  funcionario_setor?: string;
  funcionario_base?: string;
  funcionario_aeronave?: string;
  funcionario_admissao?: string;
  funcionario_is_instrutor?: number | boolean;
  funcionario_is_checador?: number | boolean;
  funcionario_status?: string;
  funcionario_ativo?: number | boolean;
  qualificacao_desc: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  qualificacao_categoria?: string;
  qualificacao_validade?: number; // agregado da view integrada (meses)
  validade_meses?: number; // validade em meses do tipo de qualificação
  vencimento_fim_mes?: number; // 0 = dia exato, 1 = fim do mês
  categoria?: string;
  tipo?: string;
  codigo?: string;
  data_realizacao?: string; // alias para data_conclusao (backend usa este nome)
  data_conclusao?: string;
  data_emissao?: string;
  data_vencimento?: string;
  data_validade?: string;
  vigente_operacional?: number | boolean;
  certificado_numero?: string;
  certificado_url?: string;
  tem_certificado?: number | boolean;
  certificado_arquivo_id?: number | null;
  certificado_nome?: string;
  observacoes?: string;
  tipo_treinamento?: string;
  nota?: number;
  resultado?: string;
  instrutor?: string;
  local?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Habilitacao {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string;
  validade: string;
  created_at: string;
}

// Novo tipo para Qualificação Tipo (tipos de qualificação)
export interface QualificacaoTipoDTO {
  id: string | number;
  nome: string;
  codigo?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  conteudo_programatico?: string | null;
  carga_horaria?: number | null;
  carga_horaria_inicial?: number | null;
  carga_horaria_recorrente?: number | null;
  validade?: number | null;
  observacoes?: string | null;
  ativo?: number | boolean | null;
  is_check?: number | boolean | null;
  vencimento_fim_mes?: number | null;
  created_at?: string;
  updated_at?: string | null;
  setores?: Array<{ id: number; nome: string }>;
  is_transversal?: boolean;
}

interface ApiResponse {
  success?: boolean;
  data?: HistoricoQualificacao[]; // payload principal
  meta?: {
    // espelha backend unificado
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    minimal?: boolean;
    has_data?: boolean;
  };
  stats?: {
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas?: number;
  };
}

/**
 * Hook para listar histórico de qualificações com estatísticas calculadas
 * @param funcionarioId Filtro opcional por funcionário
 * @param limit Quantidade máxima de resultados (padrão: 50, máx: 500)
 * @param page Página atual (padrão: 1)
 * @param includeStats Incluir estatísticas (padrão: true)
 * @param search Termo de busca para filtrar por nome, matrícula, qualificação
 * @param orderBy Coluna para ordenação
 * @param order Direção da ordenação (ASC ou DESC)
 */
export function useQualificacoesHistorico(
  funcionarioId?: number,
  limit = 50,
  page = 1,
  includeStats: boolean = true,
  search: string = '',
  orderBy: string = 'data_vencimento',
  order: 'ASC' | 'DESC' = 'ASC',
  aeronaveId?: string,
  categoria?: string,
  statusFilter?: string[], // Backend status filters
  setorIds?: string[],
  historicoId?: number,
  enabled: boolean = true,
  categoriaId?: number | null,
) {
  const [loadingExtra, setLoadingExtra] = useState(false);
  const safeLimit = Math.min(limit, 500); // Máximo 500 por página

  let endpoint = `/api/qualificacoes/historico?limit=${safeLimit}&page=${page}`;
  if (!includeStats) endpoint += `&stats=false`;
  if (funcionarioId) endpoint += `&funcionario_id=${funcionarioId}`;
  if (search.trim()) endpoint += `&search=${encodeURIComponent(search.trim())}`;
  if (orderBy) endpoint += `&orderBy=${encodeURIComponent(orderBy)}&order=${order}`;
  if (aeronaveId) endpoint += `&aeronave_id=${aeronaveId}`;
  if (categoria) endpoint += `&categoria=${encodeURIComponent(categoria)}`;
  if (statusFilter && statusFilter.length > 0) {
    endpoint += `&statuses=${encodeURIComponent(statusFilter.join(','))}`;
  }
  if (setorIds && setorIds.length > 0) {
    endpoint += `&setor_ids=${encodeURIComponent(setorIds.join(','))}`;
  }
  if (historicoId) endpoint += `&id=${historicoId}`;
  if (categoriaId) endpoint += `&categoria_id=${categoriaId}`;

  const { data, loading, error, refetch } = useApi<ApiResponse>(endpoint, {
    enabled,
    requireAuth: true,
    staleTime: 30_000,
  });

  const carregarHistorico = useCallback(() => refetch(), [refetch]);

  const renovarQualificacao = useCallback(
    async (idAntiga: number, novaDataVencimento: string): Promise<HistoricoQualificacao | null> => {
      try {
        setLoadingExtra(true);
        const resp = await apiFetch(`/api/qualificacoes/historico/${idAntiga}/renovar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nova_data_vencimento: novaDataVencimento }),
        });
        const json = await resp.json();
        if (!resp.ok || !json.success) {
          throw new Error(json.error || 'Falha na renovação');
        }
        toast.success('Qualificação renovada com sucesso');
        await carregarHistorico();
        return json.data?.novo || null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        toast.error(msg);
        return null;
      } finally {
        setLoadingExtra(false);
      }
    },
    [carregarHistorico],
  );

  // Extrai e normaliza o array de histórico apenas quando o payload muda. Sem
  // isso, a página recria listas a cada render e efeitos dependentes entram em
  // cascata em bases grandes.
  const historicoRaw: HistoricoQualificacao[] = useMemo(() => {
    if (Array.isArray(data)) {
      return data as unknown as HistoricoQualificacao[];
    }
    if (Array.isArray(data?.data)) {
      return data.data as HistoricoQualificacao[];
    }
    return [];
  }, [data]);

  const historico: HistoricoQualificacao[] = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    const today30 = d30.toISOString().split('T')[0];
    const statusNormalizados = new Set([
      'VALIDA',
      'VENCIDA',
      'VENCENDO_30',
      'RENOVADA',
      'PLANEJADA',
      'CANCELADA',
      'INDEFINIDA',
      'INDETERMINADA',
    ]);

    return historicoRaw.map((h) => {
      const temCertificadoAtivo =
        Boolean(h.certificado_url) && hasActiveCertificateFlag(h.tem_certificado);

      const statusPersistidoRaw = String(h.status || h.qualificacao_status || '')
        .trim()
        .toUpperCase();
      const statusPersistido =
        statusPersistidoRaw === 'PROXIMA_VENCIMENTO' ? 'VENCENDO_30' : statusPersistidoRaw;

      // Fonte de verdade: se backend já classificou status conhecido, preservar.
      // RENOVADA: backend só envia se tem_renovacao_posterior=1 (sucessora real).
      if (statusNormalizados.has(statusPersistido)) {
        return {
          ...h,
          qualificacao_status: statusPersistido || null,
          tem_certificado: temCertificadoAtivo ? 1 : 0,
          certificado_url: temCertificadoAtivo ? h.certificado_url : null,
          status: statusPersistido,
        };
      }

      // Fallback para bases antigas sem status derivado no backend.
      // NUNCA derivar RENOVADA de renovada=1 — legado informativo apenas.
      if (statusPersistido === 'RENOVADA' || statusPersistido === 'RENOVADO') {
        // status=RENOVADA/RENOVADO sem reconhecimento do backend → reclassificar por data
        // (não retornar RENOVADA sem sucessora real)
      }

      // PRIORIDADE 2: Calcular status baseado em vencimento
      if (!h.data_vencimento) {
        const isCompletionStatus =
          statusPersistido === 'CONCLUIDA' || statusPersistido === 'CONCLUIDO';
        return {
          ...h,
          qualificacao_status: isCompletionStatus ? statusPersistido : statusPersistido || null,
          tem_certificado: temCertificadoAtivo ? 1 : 0,
          certificado_url: temCertificadoAtivo ? h.certificado_url : null,
          status: isCompletionStatus ? statusPersistido : 'INDETERMINADA',
        };
      }
      const dataVenc = String(h.data_vencimento || '')
        .trim()
        .slice(0, 10);
      if (!dataVenc || dataVenc.length !== 10) {
        return {
          ...h,
          qualificacao_status: statusPersistido || null,
          tem_certificado: temCertificadoAtivo ? 1 : 0,
          certificado_url: temCertificadoAtivo ? h.certificado_url : null,
          status: 'INDETERMINADA',
        };
      }
      let status: string;
      if (dataVenc < today) status = 'VENCIDA';
      else if (dataVenc <= today30) status = 'VENCENDO_30';
      else status = 'VALIDA';

      return {
        ...h,
        qualificacao_status: statusPersistido || null,
        tem_certificado: temCertificadoAtivo ? 1 : 0,
        certificado_url: temCertificadoAtivo ? h.certificado_url : null,
        status,
      };
    });
  }, [historicoRaw]);

  const meta = data?.meta;
  const apiStats = data?.stats;

  // Calcular stats localmente (mais rápido que chamada extra à API)
  const statsLocal = useMemo(
    () =>
      historico.reduce(
        (acc, q) => {
          acc.total += 1;
          if (q.status === 'VALIDA') acc.validas += 1;
          if (q.status === 'VENCENDO_30') acc.vencendo += 1;
          if (q.status === 'VENCIDA') acc.vencidas += 1;
          if (q.status === 'RENOVADA') acc.renovadas += 1;
          return acc;
        },
        { total: 0, validas: 0, vencendo: 0, vencidas: 0, renovadas: 0 },
      ),
    [historico],
  );

  const stats = useMemo(
    () =>
      apiStats && typeof apiStats.total === 'number'
        ? {
            total: Number(apiStats.total || 0),
            validas: Number(apiStats.validas || 0),
            vencendo: Number(apiStats.vencendo || 0),
            vencidas: Number(apiStats.vencidas || 0),
            renovadas:
              typeof apiStats.renovadas === 'number'
                ? Number(apiStats.renovadas || 0)
                : statsLocal.renovadas,
            planejadas:
              typeof (apiStats as { planejadas?: unknown }).planejadas === 'number'
                ? Number((apiStats as { planejadas?: number }).planejadas || 0)
                : 0,
          }
        : { ...statsLocal, planejadas: 0 },
    [apiStats, statsLocal],
  );

  return {
    historico,
    stats,
    meta,
    loading: loading || loadingExtra,
    error,
    refetch,
    carregarHistorico,
    renovarQualificacao,
  };
}

/**
 * Hook para listar habilitações (CPL, INVA, etc)
 * @param limit Quantidade máxima de resultados (padrão: 50)
 */
export function useHabilitacoes(limit = 50) {
  const { data, loading, error, refetch } = useApi<Habilitacao[]>(
    `/api/qualificacoes/habilitacoes?limit=${limit}`,
    { enabled: true },
  );

  return {
    habilitacoes: data || [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook para listar tipos de qualificações
 * Normaliza campo obrigatoria para boolean e garante array segura
 */
export function useQualificacaoTipos(
  enabled: boolean = true,
  limit = 200,
  filters?: {
    categoria?: string;
    categoriaId?: number;
    setorIds?: string[];
    search?: string;
  },
) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (filters?.categoriaId && filters.categoriaId > 0) {
    query.set('categoria_id', String(filters.categoriaId));
  } else if (filters?.categoria?.trim()) {
    query.set('categoria', filters.categoria.trim());
  }
  if (filters?.setorIds?.length) {
    query.set('setor_ids', filters.setorIds.join(','));
  }
  if (filters?.search?.trim()) {
    query.set('search', filters.search.trim());
  }

  const { data, loading, error, refetch } = useApi<{ data?: QualificacaoTipoDTO[] }>(
    `/api/qualificacoes/tipos?${query.toString()}`,
    {
      enabled,
      requireAuth: true,
    },
  );

  // A API pode retornar { success: true, data: [...] } ou apenas [...]
  const tipos: QualificacaoTipoDTO[] = Array.isArray(data)
    ? data
    : data?.data && Array.isArray(data.data)
      ? data.data
      : [];

  return {
    tipos,
    loading,
    error,
    refetch,
  };
}
