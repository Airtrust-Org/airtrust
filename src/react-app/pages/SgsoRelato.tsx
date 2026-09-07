/**
 * SGSO — Detalhe do Relato
 * Painel completo: resumo, contexto operacional, matriz de risco,
 * fatores HFACS, ações CAPA, histórico de status, comentários GSO
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL, getAccessToken } from '../config/api';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AvaliacaoRisco {
  id: number;
  tipo_avaliacao: 'INICIAL' | 'RESIDUAL';
  probabilidade: string;
  severidade: number;
  nivel_risco: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  elevado_por_fadiga: number;
  justificativa_elevacao: string | null;
  justificativa: string | null;
  avaliador_nome: string | null;
  data_avaliacao: string;
}

interface AcaoMitigacao {
  id: number;
  tipo: 'CORRETIVA' | 'PREVENTIVA';
  descricao: string;
  categoria: string | null;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  percentual_conclusao: number;
  responsavel_nome: string | null;
  prazo: string;
  data_conclusao: string | null;
}

interface FatorHumano {
  id: number;
  nivel_hfacs: string;
  categoria: string;
  subcategoria: string | null;
  descricao: string | null;
  efetividade_cognitiva_capturada: number | null;
  fonte_automatica: number;
}

interface HistoricoStatus {
  id: number;
  status_anterior: string | null;
  status_novo: string;
  motivo: string | null;
  alterado_por_nome: string | null;
  alterado_em: string;
}

interface Relato {
  id: string;
  numero_protocolo: string;
  tipo: string;
  status: string;
  anonimo: number;
  relator_nome: string | null;
  relator_cargo: string | null;
  gso_nome: string | null;
  data_ocorrencia: string;
  local_icao: string | null;
  local_descricao: string | null;
  fase_voo: string | null;
  condicao_meteorologica: string | null;
  descricao: string;
  consequencia: string | null;
  accao_imediata: string | null;
  categoria_adrep: string | null;
  aeronave_matricula: string | null;
  aeronave_modelo: string | null;
  efetividade_cognitiva: number | null;
  horas_acumuladas_7d: number | null;
  horas_acumuladas_28d: number | null;
  dias_embarcado: number | null;
  escala_quinzena: number | null;
  created_at: string;
  avaliacoes_risco: AvaliacaoRisco[];
  acoes_mitigacao: AcaoMitigacao[];
  fatores_humanos: FatorHumano[];
}

interface Funcionario {
  id: number;
  nome: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers visuais
// ─────────────────────────────────────────────────────────────

const NIVEL_RISCO_COLOR: Record<string, string> = {
  BAIXO: 'bg-green-100 text-green-800 border-green-200',
  MEDIO: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ALTO: 'bg-orange-100 text-orange-800 border-orange-200',
  CRITICO: 'bg-red-100 text-red-800 border-red-200',
};

const NIVEL_RISCO_BG: Record<string, string> = {
  BAIXO: 'bg-green-50',
  MEDIO: 'bg-yellow-50',
  ALTO: 'bg-orange-50',
  CRITICO: 'bg-red-50',
};

const MATRIZ_NIVEL: Record<string, Record<number, string>> = {
  A: { 1: 'MEDIO', 2: 'ALTO', 3: 'ALTO', 4: 'CRITICO', 5: 'CRITICO' },
  B: { 1: 'MEDIO', 2: 'MEDIO', 3: 'ALTO', 4: 'ALTO', 5: 'CRITICO' },
  C: { 1: 'BAIXO', 2: 'MEDIO', 3: 'MEDIO', 4: 'ALTO', 5: 'ALTO' },
  D: { 1: 'BAIXO', 2: 'BAIXO', 3: 'MEDIO', 4: 'MEDIO', 5: 'ALTO' },
  E: { 1: 'BAIXO', 2: 'BAIXO', 3: 'BAIXO', 4: 'MEDIO', 5: 'MEDIO' },
};

const MATRIZ_CELL_COLOR: Record<string, string> = {
  BAIXO: 'bg-green-100 text-green-700 text-xs',
  MEDIO: 'bg-yellow-100 text-yellow-700 text-xs',
  ALTO: 'bg-orange-100 text-orange-700 text-xs font-medium',
  CRITICO: 'bg-red-100 text-red-700 text-xs font-bold',
};

const STATUS_ACAO_COLOR: Record<string, string> = {
  PENDENTE: 'bg-slate-100 text-slate-700',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700',
};

function formatDatetime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function resolveSgsoRelatoLoadError(response: {
  success?: boolean;
  error?: string | null;
  code?: string;
  http_status?: number;
}): string | null {
  if (response.success) return null;
  if (response.code === 'SGSO_RELATO_NOT_FOUND' || response.http_status === 404) {
    return 'Relato não encontrado';
  }
  if (response.error) return response.error;
  return response.http_status
    ? `Erro ao carregar relato (HTTP ${response.http_status})`
    : 'Erro ao carregar relato';
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function SgsoRelato() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, refreshToken, logout } = useAuth();

  const [relato, setRelato] = useState<Relato | null>(null);
  const [historico, setHistorico] = useState<HistoricoStatus[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Seção ativa
  type Secao = 'resumo' | 'risco' | 'hfacs' | 'acoes' | 'historico' | 'comentarios';
  const [secao, setSecao] = useState<Secao>('resumo');

  // Formulários inline
  const [showFormRisco, setShowFormRisco] = useState(false);
  const [showFormHfacs, setShowFormHfacs] = useState(false);
  const [showFormAcao, setShowFormAcao] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [comentario, setComentario] = useState('');

  const [formRisco, setFormRisco] = useState({
    tipo_avaliacao: 'INICIAL',
    probabilidade: 'C',
    severidade: 3,
    justificativa: '',
  });

  const [formHfacs, setFormHfacs] = useState({
    nivel_hfacs: 'ACOES_INSEGURAS',
    categoria: '',
    subcategoria: '',
    descricao: '',
  });

  const [formAcao, setFormAcao] = useState({
    tipo: 'CORRETIVA',
    descricao: '',
    categoria: '',
    responsavel_id: '',
    prazo: '',
  });

  const [novoStatus, setNovoStatus] = useState('');
  const [motivoStatus, setMotivoStatus] = useState('');

  // ── API helper ────────────────────────────────────────────

  const apiCall = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const base = API_BASE_URL;
      let t = token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      if (t) headers['Authorization'] = `Bearer ${t}`;
      let res = await fetch(`${base}${path}`, { ...options, headers });
      if (res.status === 401) {
        try {
          await refreshToken();
          t = getAccessToken() || token;
          if (t) headers['Authorization'] = `Bearer ${t}`;
          res = await fetch(`${base}${path}`, { ...options, headers });
        } catch {
          logout();
          throw new Error('Sessão expirada');
        }
      }
      const text = await res.text();
      if (!text) {
        return {
          success: res.ok,
          error: res.ok ? null : `Erro HTTP ${res.status}`,
          code: res.ok ? undefined : 'SGSO_API_EMPTY_RESPONSE',
          http_status: res.status,
        };
      }
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...parsed, http_status: res.status };
        }
        return { success: res.ok, data: parsed, http_status: res.status };
      } catch {
        return {
          success: false,
          error: `Resposta inválida da API (HTTP ${res.status})`,
          code: 'SGSO_API_INVALID_JSON',
          http_status: res.status,
        };
      }
    },
    [token, refreshToken, logout],
  );

  // ── Carregamento ──────────────────────────────────────────

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErro(null);
    try {
      const [relatoData, histData, funcsData] = await Promise.all([
        apiCall(`/sgso/relatos/${id}`),
        apiCall(`/sgso/relatos/${id}/historico`),
        apiCall('/funcionarios?limit=200'),
      ]);
      if (relatoData.success) {
        setRelato(relatoData.data);
      } else {
        setRelato(null);
        setErro(resolveSgsoRelatoLoadError(relatoData));
      }
      if (histData.success) setHistorico(histData.data ?? []);
      if (funcsData.success) setFuncionarios(funcsData.data ?? []);
    } catch {
      setErro('Erro ao carregar relato');
    } finally {
      setLoading(false);
    }
  }, [id, apiCall]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ── Submissões ────────────────────────────────────────────

  const submitStatus = async () => {
    if (!novoStatus) return;
    setSubmitting(true);
    try {
      const data = await apiCall(`/sgso/relatos/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: novoStatus, motivo: motivoStatus }),
      });
      if (data.success) {
        setNovoStatus('');
        setMotivoStatus('');
        await carregar();
      } else setErro(data.error ?? 'Erro');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRisco = async () => {
    setSubmitting(true);
    setErro(null);
    try {
      const data = await apiCall(`/sgso/relatos/${id}/avaliacao-risco`, {
        method: 'POST',
        body: JSON.stringify({ ...formRisco, severidade: Number(formRisco.severidade) }),
      });
      if (data.success) {
        setShowFormRisco(false);
        await carregar();
      } else setErro(data.error ?? 'Erro');
    } finally {
      setSubmitting(false);
    }
  };

  const submitHfacs = async () => {
    if (!formHfacs.categoria) {
      setErro('Selecione uma categoria');
      return;
    }
    setSubmitting(true);
    setErro(null);
    try {
      const data = await apiCall(`/sgso/relatos/${id}/fatores-humanos`, {
        method: 'POST',
        body: JSON.stringify(formHfacs),
      });
      if (data.success) {
        setShowFormHfacs(false);
        setFormHfacs({
          nivel_hfacs: 'ACOES_INSEGURAS',
          categoria: '',
          subcategoria: '',
          descricao: '',
        });
        await carregar();
      } else setErro(data.error ?? 'Erro');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAcao = async () => {
    if (!formAcao.descricao || !formAcao.responsavel_id || !formAcao.prazo) {
      setErro('Preencha descrição, responsável e prazo');
      return;
    }
    setSubmitting(true);
    setErro(null);
    try {
      const body: Record<string, unknown> = {
        tipo: formAcao.tipo,
        descricao: formAcao.descricao,
        responsavel_id: parseInt(formAcao.responsavel_id),
        prazo: formAcao.prazo,
      };
      if (formAcao.categoria) body.categoria = formAcao.categoria;
      const data = await apiCall(`/sgso/relatos/${id}/acoes`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (data.success) {
        setShowFormAcao(false);
        setFormAcao({
          tipo: 'CORRETIVA',
          descricao: '',
          categoria: '',
          responsavel_id: '',
          prazo: '',
        });
        await carregar();
      } else setErro(data.error ?? 'Erro');
    } finally {
      setSubmitting(false);
    }
  };

  const submitComentario = async () => {
    if (!comentario.trim()) return;
    setSubmitting(true);
    try {
      const data = await apiCall(`/sgso/relatos/${id}/comentarios`, {
        method: 'POST',
        body: JSON.stringify({ texto: comentario.trim() }),
      });
      if (data.success) {
        setComentario('');
      } else setErro(data.error ?? 'Erro');
    } finally {
      setSubmitting(false);
    }
  };

  const atualizarAcao = async (acaoId: number, campo: string, valor: string | number) => {
    await apiCall(`/sgso/acoes/${acaoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ [campo]: valor }),
    });
    await carregar();
  };

  // ─────────────────────────────────────────────────────────
  // HFACS categorias por nível
  // ─────────────────────────────────────────────────────────

  const HFACS_CATEGORIAS: Record<string, { codigo: string; nome: string }[]> = {
    ACOES_INSEGURAS: [
      { codigo: 'ERRO_HABILIDADE', nome: 'Erro de Habilidade' },
      { codigo: 'ERRO_DECISAO', nome: 'Erro de Decisão' },
      { codigo: 'ERRO_PERCEPTIVO', nome: 'Erro Perceptivo' },
      { codigo: 'VIOLACAO_ROTINEIRA', nome: 'Violação Rotineira' },
      { codigo: 'VIOLACAO_EXCEPCIONAL', nome: 'Violação Excepcional' },
    ],
    PRECONDICOES: [
      { codigo: 'FATOR_AMBIENTAL_FISICO', nome: 'Fator Ambiental Físico' },
      { codigo: 'FATOR_AMBIENTAL_TECNOLOGICO', nome: 'Fator Ambiental Tecnológico' },
      { codigo: 'FADIGA', nome: 'Fadiga' },
      { codigo: 'DOENCA', nome: 'Doença' },
      { codigo: 'ESTRESSE', nome: 'Estresse' },
      { codigo: 'REDUCAO_ATENCAO', nome: 'Redução de Atenção' },
      { codigo: 'PRATICA_EQUIPE_CRM', nome: 'CRM / Trabalho em Equipe' },
      { codigo: 'PRATICA_BRIEFING', nome: 'Briefing / Planejamento' },
    ],
    SUPERVISAO: [
      { codigo: 'SUPERVISAO_INADEQUADA', nome: 'Supervisão Inadequada' },
      { codigo: 'FALHA_PLANEJAMENTO', nome: 'Falha no Planejamento' },
      { codigo: 'NAO_CORRECAO_PROBLEMA', nome: 'Não Correção de Problema Conhecido' },
      { codigo: 'VIOLACAO_SUPERVISORA', nome: 'Violação Supervisora' },
    ],
    INFLUENCIAS_ORGANIZACIONAIS: [
      { codigo: 'GESTAO_RECURSOS', nome: 'Gestão de Recursos' },
      { codigo: 'CLIMA_ORGANIZACIONAL', nome: 'Clima Organizacional' },
      { codigo: 'PROCESSO_ORGANIZACIONAL', nome: 'Processo Organizacional' },
    ],
  };

  const HFACS_NIVEIS: { id: string; nome: string }[] = [
    { id: 'ACOES_INSEGURAS', nome: 'Ações Inseguras' },
    { id: 'PRECONDICOES', nome: 'Precondições' },
    { id: 'SUPERVISAO', nome: 'Supervisão' },
    { id: 'INFLUENCIAS_ORGANIZACIONAIS', nome: 'Influências Organizacionais' },
  ];

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center min-h-96">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!relato || erro) {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <p className="text-red-600 font-medium">{erro ?? 'Relato não encontrado'}</p>
          <button
            onClick={() => navigate('/sgso')}
            className="mt-4 text-blue-600 text-sm underline"
          >
            Voltar para SGSO
          </button>
        </div>
      </AppLayout>
    );
  }

  const avaliacaoInicial = relato.avaliacoes_risco.find((a) => a.tipo_avaliacao === 'INICIAL');
  const avaliacaoResidual = relato.avaliacoes_risco.find((a) => a.tipo_avaliacao === 'RESIDUAL');

  return (
    <AppLayout>
      <PageHeader
        title={`Relato ${relato.numero_protocolo}`}
        subtitle={`Ocorrido em ${formatDatetime(relato.data_ocorrencia)}${relato.local_icao ? ` · ${relato.local_icao}` : ''}${relato.aeronave_matricula ? ` · ${relato.aeronave_matricula}` : ''}`}
        className="mb-4"
        actions={
          <button
            onClick={() => navigate('/sgso')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
          >
            Voltar ao SGSO
          </button>
        }
      />

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm font-semibold px-3 py-1 rounded-full border ${
              relato.tipo === 'ACIDENTE'
                ? 'bg-red-100 text-red-800 border-red-200'
                : relato.tipo === 'INCIDENTE'
                  ? 'bg-orange-100 text-orange-800 border-orange-200'
                  : relato.tipo === 'PERIGO'
                    ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                    : 'bg-blue-100 text-blue-800 border-blue-200'
            }`}
          >
            {relato.tipo}
          </span>
          {avaliacaoInicial && (
            <span
              className={`text-sm font-semibold px-3 py-1 rounded-full border ${NIVEL_RISCO_COLOR[avaliacaoInicial.nivel_risco]}`}
            >
              Risco {avaliacaoInicial.nivel_risco}
            </span>
          )}
          <span className="text-xs font-mono text-slate-500">{relato.numero_protocolo}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={novoStatus}
            onChange={(e) => setNovoStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Alterar status...</option>
            <option value="EM_ANALISE">Em Análise</option>
            <option value="AGUARDANDO_ACAO">Aguardando Ação</option>
            <option value="FECHADO">Fechado</option>
          </select>
          {novoStatus && (
            <button
              onClick={submitStatus}
              disabled={submitting}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              Confirmar
            </button>
          )}
        </div>

        {novoStatus && (
          <div className="mt-3">
            <input
              type="text"
              placeholder="Motivo da mudança de status (opcional)"
              value={motivoStatus}
              onChange={(e) => setMotivoStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex overflow-x-auto" role="tablist">
          {(
            [
              { id: 'resumo', label: 'Resumo' },
              { id: 'risco', label: `Risco${avaliacaoInicial ? ' ✓' : ''}` },
              {
                id: 'hfacs',
                label: `HFACS${relato.fatores_humanos.length > 0 ? ` (${relato.fatores_humanos.length})` : ''}`,
              },
              {
                id: 'acoes',
                label: `Ações${relato.acoes_mitigacao.length > 0 ? ` (${relato.acoes_mitigacao.length})` : ''}`,
              },
              { id: 'historico', label: 'Histórico' },
              { id: 'comentarios', label: 'GSO Notes' },
            ] as { id: Secao; label: string }[]
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSecao(s.id)}
              className={`min-w-fit border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                secao === s.id
                  ? 'border-primary text-blue-600'
                  : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
          {erro}
        </div>
      )}

      {/* ── SEÇÃO: RESUMO ─────────────────────────────────── */}
      {secao === 'resumo' && (
        <div className="space-y-4">
          {/* Narrativa */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Narrativa</h3>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {relato.descricao}
            </p>
            {relato.consequencia && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1">Consequência</p>
                <p className="text-sm text-slate-700">{relato.consequencia}</p>
              </div>
            )}
            {relato.accao_imediata && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1">Ação Imediata</p>
                <p className="text-sm text-slate-700">{relato.accao_imediata}</p>
              </div>
            )}
          </div>

          {/* Contexto Operacional */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contexto Operacional</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500">Relator</p>
                <p className="text-sm font-medium text-slate-800">
                  {relato.anonimo ? 'Anônimo' : (relato.relator_nome ?? '—')}
                </p>
                {!relato.anonimo && relato.relator_cargo && (
                  <p className="text-xs text-slate-400">{relato.relator_cargo}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Aeronave</p>
                <p className="text-sm font-medium text-slate-800">
                  {relato.aeronave_matricula ?? '—'}
                </p>
                {relato.aeronave_modelo && (
                  <p className="text-xs text-slate-400">{relato.aeronave_modelo}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Fase do Voo</p>
                <p className="text-sm font-medium text-slate-800">
                  {relato.fase_voo?.replace('_', ' ') ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Condição MET</p>
                <p className="text-sm font-medium text-slate-800">
                  {relato.condicao_meteorologica?.replace('_', ' ') ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Categoria ADREP</p>
                <p className="text-sm font-medium text-slate-800">
                  {relato.categoria_adrep?.replace(/_/g, ' ') ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Quinzena</p>
                <p className="text-sm font-medium text-slate-800">
                  {relato.escala_quinzena ? `Q${relato.escala_quinzena}` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Dados FRMS (se disponível) */}
          {relato.efetividade_cognitiva !== null && (
            <div
              className={`border rounded-xl p-5 ${relato.efetividade_cognitiva < 70 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}
            >
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Contexto FRMS informativo
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Índice FRMS estimado</p>
                  <p
                    className={`text-xl font-bold ${relato.efetividade_cognitiva < 65 ? 'text-red-700' : relato.efetividade_cognitiva < 80 ? 'text-amber-700' : 'text-green-700'}`}
                  >
                    {relato.efetividade_cognitiva.toFixed(1)}%
                  </p>
                  {relato.efetividade_cognitiva < 70 && (
                    <p className="text-xs text-orange-600 font-medium mt-0.5">
                      Faixa informativa abaixo de 70%; não altera probabilidade automaticamente.
                    </p>
                  )}
                </div>
                {relato.horas_acumuladas_7d !== null && (
                  <div>
                    <p className="text-xs text-slate-500">Horas (7 dias)</p>
                    <p className="text-xl font-bold text-slate-800">
                      {relato.horas_acumuladas_7d.toFixed(1)}h
                    </p>
                  </div>
                )}
                {relato.horas_acumuladas_28d !== null && (
                  <div>
                    <p className="text-xs text-slate-500">Horas (28 dias)</p>
                    <p className="text-xl font-bold text-slate-800">
                      {relato.horas_acumuladas_28d.toFixed(1)}h
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SEÇÃO: MATRIZ DE RISCO ────────────────────────── */}
      {secao === 'risco' && (
        <div className="space-y-4">
          {/* Avaliações existentes */}
          {relato.avaliacoes_risco.length > 0 && (
            <div className="space-y-3">
              {relato.avaliacoes_risco.map((av) => (
                <div
                  key={av.id}
                  className={`border rounded-xl p-5 ${NIVEL_RISCO_BG[av.nivel_risco]}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">
                      Avaliação{' '}
                      {av.tipo_avaliacao === 'INICIAL' ? 'Inicial' : 'Residual (Pós-Mitigação)'}
                    </h3>
                    <span
                      className={`text-sm font-bold px-3 py-1 rounded-full border ${NIVEL_RISCO_COLOR[av.nivel_risco]}`}
                    >
                      {av.nivel_risco}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Probabilidade</p>
                      <p className="text-2xl font-bold text-slate-800">{av.probabilidade}</p>
                      {av.elevado_por_fadiga === 1 && (
                        <p className="text-xs text-orange-600 mt-0.5">
                          Ajuste legado por contexto FRMS
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Severidade</p>
                      <p className="text-2xl font-bold text-slate-800">{av.severidade}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Avaliador</p>
                      <p className="text-sm font-medium text-slate-800">
                        {av.avaliador_nome ?? '—'}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(av.data_avaliacao)}</p>
                    </div>
                  </div>
                  {av.justificativa_elevacao && (
                    <div className="mt-3 p-3 bg-orange-100 rounded-lg">
                      <p className="text-xs text-orange-800">{av.justificativa_elevacao}</p>
                    </div>
                  )}
                  {av.justificativa && (
                    <p className="text-sm text-slate-600 mt-2 italic">"{av.justificativa}"</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Matriz visual 5×5 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Matriz de Risco 5×5 (ICAO)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-slate-500 font-normal">Prob ↓ / Sev →</th>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <th key={s} className="p-2 font-semibold text-slate-600">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {['A', 'B', 'C', 'D', 'E'].map((prob) => (
                    <tr key={prob}>
                      <td className="p-2 font-semibold text-slate-600">{prob}</td>
                      {[1, 2, 3, 4, 5].map((sev) => {
                        const nivel = MATRIZ_NIVEL[prob][sev];
                        const isSelected =
                          avaliacaoInicial &&
                          avaliacaoInicial.probabilidade === prob &&
                          avaliacaoInicial.severidade === sev;
                        return (
                          <td
                            key={sev}
                            className={`p-2 rounded ${MATRIZ_CELL_COLOR[nivel]} ${
                              isSelected ? 'ring-2 ring-blue-500 ring-offset-1 font-bold' : ''
                            }`}
                          >
                            {nivel.slice(0, 3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formulário nova avaliação */}
          {!showFormRisco ? (
            <button
              onClick={() => setShowFormRisco(true)}
              className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Registrar Avaliação de Risco
            </button>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Nova Avaliação de Risco</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                  <select
                    value={formRisco.tipo_avaliacao}
                    onChange={(e) => setFormRisco({ ...formRisco, tipo_avaliacao: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="INICIAL">Inicial</option>
                    <option value="RESIDUAL">Residual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Probabilidade
                  </label>
                  <select
                    value={formRisco.probabilidade}
                    onChange={(e) => setFormRisco({ ...formRisco, probabilidade: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="A">A — Frequente</option>
                    <option value="B">B — Provável</option>
                    <option value="C">C — Ocasional</option>
                    <option value="D">D — Remoto</option>
                    <option value="E">E — Improvável</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Severidade
                  </label>
                  <select
                    value={formRisco.severidade}
                    onChange={(e) =>
                      setFormRisco({ ...formRisco, severidade: parseInt(e.target.value) })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={1}>1 — Insignificante</option>
                    <option value={2}>2 — Menor</option>
                    <option value={3}>3 — Moderado</option>
                    <option value={4}>4 — Maior</option>
                    <option value={5}>5 — Catastrófico</option>
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificativa (opcional)
                </label>
                <textarea
                  rows={2}
                  value={formRisco.justificativa}
                  onChange={(e) => setFormRisco({ ...formRisco, justificativa: e.target.value })}
                  placeholder="Fundamente os valores escolhidos..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={submitRisco}
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar Avaliação'}
                </button>
                <button
                  onClick={() => setShowFormRisco(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancelar
                </button>
              </div>
              {relato.efetividade_cognitiva !== null && relato.efetividade_cognitiva < 70 && (
                <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-xs text-orange-700">
                    <strong>FRMS:</strong> índice estimado registrado em{' '}
                    {relato.efetividade_cognitiva.toFixed(1)}% (&lt;70%). Este dado é contexto
                    informativo; a probabilidade SGSO deve ser definida pelo avaliador.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SEÇÃO: HFACS ──────────────────────────────────── */}
      {secao === 'hfacs' && (
        <div className="space-y-3">
          {/* Fatores existentes agrupados por nível */}
          {HFACS_NIVEIS.map((nivel) => {
            const fatoresNivel = relato.fatores_humanos.filter((f) => f.nivel_hfacs === nivel.id);
            return (
              <div key={nivel.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">{nivel.nome}</h3>
                {fatoresNivel.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum fator registrado</p>
                ) : (
                  <div className="space-y-2">
                    {fatoresNivel.map((f) => (
                      <div key={f.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-700">
                              {f.categoria.replace(/_/g, ' ')}
                            </span>
                            {f.fonte_automatica === 1 && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                Auto
                              </span>
                            )}
                          </div>
                          {f.subcategoria && (
                            <p className="text-xs text-slate-500">{f.subcategoria}</p>
                          )}
                          {f.descricao && (
                            <p className="text-xs text-slate-600 mt-0.5">{f.descricao}</p>
                          )}
                          {f.efetividade_cognitiva_capturada !== null && (
                            <p className="text-xs text-orange-600 mt-0.5">
                              Índice FRMS estimado:{' '}
                              {f.efetividade_cognitiva_capturada.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Formulário novo fator */}
          {!showFormHfacs ? (
            <button
              onClick={() => setShowFormHfacs(true)}
              className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Registrar Fator Humano (HFACS)
            </button>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Novo Fator Humano</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nível HFACS
                  </label>
                  <select
                    value={formHfacs.nivel_hfacs}
                    onChange={(e) =>
                      setFormHfacs({ ...formHfacs, nivel_hfacs: e.target.value, categoria: '' })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {HFACS_NIVEIS.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Categoria</label>
                  <select
                    value={formHfacs.categoria}
                    onChange={(e) => setFormHfacs({ ...formHfacs, categoria: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    {(HFACS_CATEGORIAS[formHfacs.nivel_hfacs] ?? []).map((cat) => (
                      <option key={cat.codigo} value={cat.codigo}>
                        {cat.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Observação</label>
                <textarea
                  rows={2}
                  value={formHfacs.descricao}
                  onChange={(e) => setFormHfacs({ ...formHfacs, descricao: e.target.value })}
                  placeholder="Descrição do fator identificado..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
              {formHfacs.nivel_hfacs === 'PRECONDICOES' &&
                formHfacs.categoria === 'FADIGA' &&
                relato.efetividade_cognitiva !== null && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-700">
                      ✓ Efetividade cognitiva ({relato.efetividade_cognitiva.toFixed(1)}%) será
                      capturada automaticamente do FRMS.
                    </p>
                  </div>
                )}
              <div className="flex gap-2">
                <button
                  onClick={submitHfacs}
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => setShowFormHfacs(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SEÇÃO: AÇÕES CAPA ─────────────────────────────── */}
      {secao === 'acoes' && (
        <div className="space-y-3">
          {relato.acoes_mitigacao.map((acao) => (
            <div key={acao.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_ACAO_COLOR[acao.status]}`}
                    >
                      {acao.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {acao.tipo}
                    </span>
                    {acao.categoria && (
                      <span className="text-xs text-slate-400">
                        {acao.categoria.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800">{acao.descricao}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    {acao.responsavel_nome && <span>Resp: {acao.responsavel_nome}</span>}
                    <span
                      className={
                        new Date(acao.prazo) < new Date() && acao.status !== 'CONCLUIDA'
                          ? 'text-red-500 font-medium'
                          : ''
                      }
                    >
                      Prazo: {formatDate(acao.prazo)}
                    </span>
                    <span>{acao.percentual_conclusao}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        acao.status === 'CONCLUIDA'
                          ? 'bg-green-500'
                          : acao.status === 'CANCELADA'
                            ? 'bg-slate-400'
                            : 'bg-blue-500'
                      }`}
                      style={{ width: `${acao.percentual_conclusao}%` }}
                    />
                  </div>
                </div>
                {/* Controles de status */}
                <div className="flex gap-1">
                  {acao.status !== 'CONCLUIDA' && acao.status !== 'CANCELADA' && (
                    <>
                      {acao.status === 'PENDENTE' && (
                        <button
                          onClick={() => atualizarAcao(acao.id, 'status', 'EM_ANDAMENTO')}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Iniciar
                        </button>
                      )}
                      <button
                        onClick={() => atualizarAcao(acao.id, 'status', 'CONCLUIDA')}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        Concluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {relato.acoes_mitigacao.length === 0 && !showFormAcao && (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">Nenhuma ação de mitigação registrada</p>
            </div>
          )}

          {/* Formulário nova ação */}
          {!showFormAcao ? (
            <button
              onClick={() => setShowFormAcao(true)}
              className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Nova Ação CAPA
            </button>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Nova Ação de Mitigação</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                  <select
                    value={formAcao.tipo}
                    onChange={(e) => setFormAcao({ ...formAcao, tipo: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="CORRETIVA">Corretiva</option>
                    <option value="PREVENTIVA">Preventiva</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Categoria</label>
                  <select
                    value={formAcao.categoria}
                    onChange={(e) => setFormAcao({ ...formAcao, categoria: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    <option value="TREINAMENTO">Treinamento</option>
                    <option value="PROCEDIMENTO">Procedimento</option>
                    <option value="EQUIPAMENTO">Equipamento</option>
                    <option value="SUPERVISAO">Supervisão</option>
                    <option value="COMUNICACAO">Comunicação</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Descrição *</label>
                <textarea
                  rows={2}
                  value={formAcao.descricao}
                  onChange={(e) => setFormAcao({ ...formAcao, descricao: e.target.value })}
                  placeholder="Descreva a ação a ser tomada..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Responsável *
                  </label>
                  <select
                    value={formAcao.responsavel_id}
                    onChange={(e) => setFormAcao({ ...formAcao, responsavel_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Prazo *</label>
                  <input
                    type="date"
                    value={formAcao.prazo}
                    onChange={(e) => setFormAcao({ ...formAcao, prazo: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={submitAcao}
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Criar Ação'}
                </button>
                <button
                  onClick={() => setShowFormAcao(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SEÇÃO: HISTÓRICO ──────────────────────────────── */}
      {secao === 'historico' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {historico.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum histórico disponível</p>
          ) : (
            <div className="space-y-0">
              {historico.map((h, i) => (
                <div key={h.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 bg-primary rounded-full mt-1 flex-shrink-0" />
                    {i < historico.length - 1 && <div className="w-0.5 bg-slate-200 flex-1 mt-1" />}
                  </div>
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {h.status_anterior && (
                        <>
                          <span className="text-xs text-slate-500">
                            {h.status_anterior.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-slate-400">→</span>
                        </>
                      )}
                      <span className="text-xs font-medium text-slate-800">
                        {h.status_novo.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {h.alterado_por_nome ?? 'Sistema'} • {formatDatetime(h.alterado_em)}
                    </p>
                    {h.motivo && <p className="text-xs text-slate-600 mt-1 italic">"{h.motivo}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SEÇÃO: COMENTÁRIOS GSO ────────────────────────── */}
      {secao === 'comentarios' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-700 font-medium">
              🔒 Notas internas — visíveis apenas para GSO e administradores. Não mostradas ao
              relator.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <textarea
              rows={3}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Adicionar nota interna ao relato..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={submitComentario}
                disabled={submitting || !comentario.trim()}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Adicionar Nota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
