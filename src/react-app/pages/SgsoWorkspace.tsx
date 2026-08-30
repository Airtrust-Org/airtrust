/**
 * SGSO — Sistema de Gerenciamento de Segurança Operacional
 * Página principal com 4 abas: Relatos, Dashboard KPIs, Auditorias, Não Conformidades
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL, getAccessToken } from '../config/api';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Tab = 'relatos' | 'dashboard' | 'auditorias' | 'ncs';
const SGSO_ACTIVE_TAB_KEY = 'airtrust.sgso.activeTab';
const SGSO_FILTER_STATUS_KEY = 'airtrust.sgso.filtroStatus';
const SGSO_FILTER_TIPO_KEY = 'airtrust.sgso.filtroTipo';
const SGSO_SEARCH_KEY = 'airtrust.sgso.buscaRelatos';

interface Relato {
  id: string;
  numero_protocolo: string;
  tipo: 'OCORRENCIA' | 'PERIGO' | 'INCIDENTE' | 'ACIDENTE';
  status:
    | 'ABERTO'
    | 'EM_ANALISE'
    | 'AGUARDANDO_ACAO'
    | 'FECHADO'
    | 'EM_TRIAGEM'
    | 'EM_INVESTIGACAO'
    | 'CONCLUIDO';
  anonimo: number;
  data_ocorrencia: string;
  local_icao: string | null;
  categoria_adrep: string | null;
  aeronave_matricula: string | null;
  aeronave_modelo: string | null;
  efetividade_cognitiva: number | null;
  relator_nome: string | null;
  created_at: string;
}

interface Auditoria {
  id: string;
  tipo: string;
  titulo: string;
  status: string;
  data_programada: string | null;
  data_realizada: string | null;
  percentual_conformidade: number | null;
  total_itens: number;
  itens_nc_major: number;
  itens_nc_minor: number;
  auditor_nome: string | null;
}

interface NC {
  id: number;
  tipo: 'MAJOR' | 'MINOR' | 'OBSERVACAO';
  status: string;
  descricao: string;
  rbac_referencia: string | null;
  prazo_resolucao: string | null;
  responsavel_nome: string | null;
  auditoria_titulo: string | null;
  created_at: string;
}

interface SpiItem {
  codigo: string;
  nome: string;
  descricao: string;
  unidade: string;
  meta_valor: number;
  meta_operador: string;
  alerta_valor: number;
  alerta_operador: string;
  valor_atual: number | null;
  status: 'ok' | 'atencao' | 'critico' | 'info';
}

interface LeadingIndicator {
  codigo: string;
  nome: string;
  valor_atual: number;
  unidade: string;
  status: 'ok' | 'atencao' | 'critico';
}

interface TendenciaCurta {
  codigo: string;
  nome: string;
  valor_atual: number;
  valor_periodo_anterior: number;
  delta_absoluto: number;
  delta_percentual: number | null;
  direcao: 'SUBIU' | 'CAIU' | 'ESTAVEL';
  favoravel: boolean;
}

interface KpiSpi {
  spis: SpiItem[];
  leading_indicators?: LeadingIndicator[];
  tendencia_curta?: TendenciaCurta[];
  resumo: {
    total_relatos_90d: number;
    horas_voo_90d: number;
    ncs_abertas: number;
    efetividade_media: number | null;
    backlog_triagem_24h?: number;
    frat_alto_sem_aprovacao?: number;
    barreiras_degradadas?: number;
  };
}

interface CategoriaAdrep {
  id: number;
  codigo: string;
  nome_pt: string;
  nome_en: string;
}

interface Funcionario {
  id: number;
  nome: string;
  cargo: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers visuais
// ─────────────────────────────────────────────────────────────

const TIPO_RELATO_LABEL: Record<string, string> = {
  OCORRENCIA: 'Ocorrência',
  PERIGO: 'Perigo',
  INCIDENTE: 'Incidente',
  ACIDENTE: 'Acidente',
};

const STATUS_RELATO_LABEL: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em Análise',
  AGUARDANDO_ACAO: 'Aguardando Ação',
  FECHADO: 'Fechado',
  EM_TRIAGEM: 'Em Triagem',
  EM_INVESTIGACAO: 'Em Investigação',
  CONCLUIDO: 'Concluído',
};

const TIPO_RELATO_COLOR: Record<string, string> = {
  OCORRENCIA: 'bg-blue-100 text-blue-800',
  PERIGO: 'bg-yellow-100 text-yellow-800',
  INCIDENTE: 'bg-orange-100 text-orange-800',
  ACIDENTE: 'bg-red-100 text-red-800',
};

const STATUS_RELATO_COLOR: Record<string, string> = {
  ABERTO: 'bg-slate-100 text-slate-700',
  EM_ANALISE: 'bg-blue-100 text-blue-700',
  AGUARDANDO_ACAO: 'bg-amber-100 text-amber-700',
  FECHADO: 'bg-green-100 text-green-700',
  EM_TRIAGEM: 'bg-purple-100 text-purple-700',
  EM_INVESTIGACAO: 'bg-indigo-100 text-indigo-700',
  CONCLUIDO: 'bg-emerald-100 text-emerald-700',
};

const STATUS_AUDITORIA_COLOR: Record<string, string> = {
  PROGRAMADA: 'bg-blue-100 text-blue-700',
  EM_ANDAMENTO: 'bg-amber-100 text-amber-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700',
};

const NC_TIPO_COLOR: Record<string, string> = {
  MAJOR: 'bg-red-100 text-red-800',
  MINOR: 'bg-yellow-100 text-yellow-800',
  OBSERVACAO: 'bg-slate-100 text-slate-700',
};

const SPI_STATUS_COLOR: Record<string, string> = {
  ok: 'border-green-200 bg-green-50',
  atencao: 'border-amber-200 bg-amber-50',
  critico: 'border-red-200 bg-red-50',
  info: 'border-slate-200 bg-slate-50',
};

const SPI_VALUE_COLOR: Record<string, string> = {
  ok: 'text-green-700',
  atencao: 'text-amber-700',
  critico: 'text-red-700',
  info: 'text-slate-700',
};

const SGSO_TABS: { id: Tab; label: string; description: string }[] = [
  {
    id: 'relatos',
    label: 'Relatos',
    description: 'Registro, triagem e acompanhamento operacional',
  },
  {
    id: 'dashboard',
    label: 'Dashboard KPIs',
    description: 'SPIs, tendências e alertas de segurança',
  },
  {
    id: 'auditorias',
    label: 'Auditorias',
    description: 'Planejamento e execução de auditorias SGSO',
  },
  {
    id: 'ncs',
    label: 'Não Conformidades',
    description: 'Backlog de NCs e prazos de resolução',
  },
];

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

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

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function Sgso() {
  const navigate = useNavigate();
  const { token, refreshToken, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const stored = window.localStorage.getItem(SGSO_ACTIVE_TAB_KEY);
    if (
      stored === 'relatos' ||
      stored === 'dashboard' ||
      stored === 'auditorias' ||
      stored === 'ncs'
    ) {
      return stored;
    }
    return 'relatos';
  });

  // Estado de dados
  const [relatos, setRelatos] = useState<Relato[]>([]);
  const [relatosTotal, setRelatosTotal] = useState(0);
  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [ncs, setNcs] = useState<NC[]>([]);
  const [kpiSpi, setKpiSpi] = useState<KpiSpi | null>(null);
  const [categorias, setCategorias] = useState<CategoriaAdrep[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  // Estado de loading
  const [loadingRelatos, setLoadingRelatos] = useState(false);
  const [loadingAuditorias, setLoadingAuditorias] = useState(false);
  const [loadingNcs, setLoadingNcs] = useState(false);
  const [loadingKpi, setLoadingKpi] = useState(false);

  // Filtros relatos
  const [filtroStatus, setFiltroStatus] = useState(
    () => window.localStorage.getItem(SGSO_FILTER_STATUS_KEY) ?? '',
  );
  const [filtroTipo, setFiltroTipo] = useState(
    () => window.localStorage.getItem(SGSO_FILTER_TIPO_KEY) ?? '',
  );
  const [buscaRelatos, setBuscaRelatos] = useState(
    () => window.localStorage.getItem(SGSO_SEARCH_KEY) ?? '',
  );

  // Modal novo relato
  const [showModalRelato, setShowModalRelato] = useState(false);
  const [showModalAuditoria, setShowModalAuditoria] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingRelatoId, setUpdatingRelatoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário novo relato
  const [formRelato, setFormRelato] = useState({
    tipo: 'OCORRENCIA',
    anonimo: false,
    data_ocorrencia: new Date().toISOString().slice(0, 16),
    descricao: '',
    categoria_adrep: '',
    fase_voo: '',
    condicao_meteorologica: '',
    local_icao: '',
    aeronave_id: '',
  });

  // Formulário nova auditoria
  const [formAuditoria, setFormAuditoria] = useState({
    tipo: 'INTERNA',
    titulo: '',
    descricao: '',
    data_programada: '',
    auditor_id: '',
  });

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
        };
      }
      try {
        return JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Resposta inválida da API (HTTP ${res.status})`,
          code: 'SGSO_API_INVALID_JSON',
        };
      }
    },
    [token, refreshToken, logout],
  );

  // ── Carregamento de dados ─────────────────────────────────

  const carregarRelatos = useCallback(async () => {
    setLoadingRelatos(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filtroStatus) params.set('status', filtroStatus);
      if (filtroTipo) params.set('tipo', filtroTipo);
      const data = await apiCall(`/sgso/relatos?${params}`);
      if (data.success) {
        setRelatos(data.data ?? []);
        setRelatosTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoadingRelatos(false);
    }
  }, [apiCall, filtroStatus, filtroTipo]);

  const carregarAuditorias = useCallback(async () => {
    setLoadingAuditorias(true);
    try {
      const data = await apiCall('/sgso/auditorias?limit=50');
      if (data.success) setAuditorias(data.data ?? []);
    } finally {
      setLoadingAuditorias(false);
    }
  }, [apiCall]);

  const carregarNcs = useCallback(async () => {
    setLoadingNcs(true);
    try {
      const data = await apiCall('/sgso/nao-conformidades?limit=50');
      if (data.success) setNcs(data.data ?? []);
    } finally {
      setLoadingNcs(false);
    }
  }, [apiCall]);

  const carregarKpi = useCallback(async () => {
    setLoadingKpi(true);
    try {
      const data = await apiCall('/sgso/kpi/spi');
      if (data.success) setKpiSpi(data.data);
    } finally {
      setLoadingKpi(false);
    }
  }, [apiCall]);

  const carregarCategorias = useCallback(async () => {
    const data = await apiCall('/sgso/categorias-adrep');
    if (data.success) setCategorias(data.data ?? []);
  }, [apiCall]);

  const carregarFuncionarios = useCallback(async () => {
    const data = await apiCall('/funcionarios?limit=200&deleted_at=null');
    if (data.success) setFuncionarios(data.data ?? []);
  }, [apiCall]);

  useEffect(() => {
    carregarCategorias();
    carregarFuncionarios();
  }, []);

  useEffect(() => {
    if (activeTab === 'relatos') carregarRelatos();
    if (activeTab === 'auditorias') carregarAuditorias();
    if (activeTab === 'ncs') carregarNcs();
    if (activeTab === 'dashboard') carregarKpi();
  }, [activeTab, filtroStatus, filtroTipo]);

  useEffect(() => {
    window.localStorage.setItem(SGSO_ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    window.localStorage.setItem(SGSO_FILTER_STATUS_KEY, filtroStatus);
  }, [filtroStatus]);

  useEffect(() => {
    window.localStorage.setItem(SGSO_FILTER_TIPO_KEY, filtroTipo);
  }, [filtroTipo]);

  useEffect(() => {
    window.localStorage.setItem(SGSO_SEARCH_KEY, buscaRelatos);
  }, [buscaRelatos]);

  const relatosResumo = useMemo(() => {
    const total = relatos.length;
    const abertos = relatos.filter(
      (item) => item.status !== 'FECHADO' && item.status !== 'CONCLUIDO',
    ).length;
    const criticos = relatos.filter(
      (item) => item.tipo === 'ACIDENTE' || item.tipo === 'INCIDENTE',
    ).length;
    const frmsContexto = relatos.filter(
      (item) => item.efetividade_cognitiva !== null && item.efetividade_cognitiva < 70,
    ).length;
    return { total, abertos, criticos, frmsContexto };
  }, [relatos]);

  const relatosFiltrados = useMemo(() => {
    const term = buscaRelatos.trim().toLowerCase();
    if (!term) return relatos;
    return relatos.filter((item) => {
      const source = [
        item.numero_protocolo,
        item.relator_nome,
        item.local_icao,
        item.categoria_adrep,
        item.aeronave_matricula,
        item.aeronave_modelo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return source.includes(term);
    });
  }, [relatos, buscaRelatos]);

  // ── Submissões ────────────────────────────────────────────

  const submitRelato = async () => {
    if (formRelato.descricao.trim().length < 10) {
      setErro('Descrição muito curta (mínimo 10 caracteres)');
      return;
    }
    setSubmitting(true);
    setErro(null);
    try {
      const body: Record<string, unknown> = {
        tipo: formRelato.tipo,
        anonimo: formRelato.anonimo,
        data_ocorrencia: new Date(formRelato.data_ocorrencia).toISOString(),
        descricao: formRelato.descricao,
      };
      if (formRelato.categoria_adrep) body.categoria_adrep = formRelato.categoria_adrep;
      if (formRelato.fase_voo) body.fase_voo = formRelato.fase_voo;
      if (formRelato.condicao_meteorologica)
        body.condicao_meteorologica = formRelato.condicao_meteorologica;
      if (formRelato.local_icao) body.local_icao = formRelato.local_icao.toUpperCase();
      if (formRelato.aeronave_id) body.aeronave_id = parseInt(formRelato.aeronave_id);

      const data = await apiCall('/sgso/relatos', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (data.success) {
        setShowModalRelato(false);
        setFormRelato({
          tipo: 'OCORRENCIA',
          anonimo: false,
          data_ocorrencia: new Date().toISOString().slice(0, 16),
          descricao: '',
          categoria_adrep: '',
          fase_voo: '',
          condicao_meteorologica: '',
          local_icao: '',
          aeronave_id: '',
        });
        await carregarRelatos();
      } else {
        setErro(data.error ?? 'Erro ao criar relato');
      }
    } catch {
      setErro('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAuditoria = async () => {
    if (!formAuditoria.titulo.trim()) {
      setErro('Título obrigatório');
      return;
    }
    setSubmitting(true);
    setErro(null);
    try {
      const body: Record<string, unknown> = {
        tipo: formAuditoria.tipo,
        titulo: formAuditoria.titulo,
      };
      if (formAuditoria.descricao) body.descricao = formAuditoria.descricao;
      if (formAuditoria.data_programada) body.data_programada = formAuditoria.data_programada;
      if (formAuditoria.auditor_id) body.auditor_id = parseInt(formAuditoria.auditor_id);

      const data = await apiCall('/sgso/auditorias', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (data.success) {
        setShowModalAuditoria(false);
        setFormAuditoria({
          tipo: 'INTERNA',
          titulo: '',
          descricao: '',
          data_programada: '',
          auditor_id: '',
        });
        await carregarAuditorias();
      } else {
        setErro(data.error ?? 'Erro ao criar auditoria');
      }
    } catch {
      setErro('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  };

  const atualizarStatusRapido = async (relatoId: string, status: string) => {
    setUpdatingRelatoId(relatoId);
    setErro(null);
    try {
      const data = await apiCall(`/sgso/relatos/${relatoId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, motivo: 'Atualização rápida pela listagem SGSO' }),
      });
      if (!data.success) {
        setErro(data.error ?? 'Erro ao atualizar status');
      } else {
        await carregarRelatos();
      }
    } catch {
      setErro('Erro ao atualizar status');
    } finally {
      setUpdatingRelatoId(null);
    }
  };

  const copiarProtocolo = async (protocolo: string) => {
    try {
      await navigator.clipboard.writeText(protocolo);
    } catch {
      setErro('Não foi possível copiar o protocolo');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <PageHeader
        title="SGSO"
        subtitle="Safety cockpit com triagem, tendências e governança operacional em tempo real"
        className="mb-4"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/sgso/relprev')}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              RELPREV
            </button>
            <button
              onClick={() => navigate('/sgso/bowtie')}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Bowtie
            </button>
            <button
              onClick={() => navigate('/sgso/frat')}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              FRAT
            </button>
          </div>
        }
      />

      <p className="text-xs text-red-600 font-medium -mt-2 mb-4">(em desenvolvimento com dados de teste)</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Relatos abertos</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{relatosResumo.abertos}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-red-700">Eventos críticos</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{relatosResumo.criticos}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-700">NCs abertas</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">
            {kpiSpi?.resumo.ncs_abertas ?? ncs.length}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-blue-700">Auditorias</p>
          <p className="mt-1 text-2xl font-bold text-blue-800">{auditorias.length}</p>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white">
          <div className="flex gap-1 overflow-x-auto p-2" role="tablist">
            {SGSO_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-w-fit rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-slate-100 bg-white px-4 py-3 text-sm text-slate-500">
          {SGSO_TABS.find((tab) => tab.id === activeTab)?.description}
        </div>

        <div className="p-4">
          {/* ── ABA: RELATOS ─────────────────────────────────── */}
          {activeTab === 'relatos' && (
            <div>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Relatos no filtro
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {relatosResumo.total}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-blue-700">Em andamento</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-900">
                    {relatosResumo.abertos}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-amber-700">
                    Incidente/Acidente
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-amber-900">
                    {relatosResumo.criticos}
                  </p>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-orange-700">
                    FRMS contexto &lt; 70%
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-orange-900">
                    {relatosResumo.frmsContexto}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                      Filtros avançados
                    </h3>
                    {(filtroStatus || filtroTipo || buscaRelatos.trim()) && (
                      <button
                        onClick={() => {
                          setFiltroStatus('');
                          setFiltroTipo('');
                          setBuscaRelatos('');
                        }}
                        className="text-xs font-semibold text-blue-700"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Busca geral
                      </label>
                      <input
                        value={buscaRelatos}
                        onChange={(event) => setBuscaRelatos(event.target.value)}
                        placeholder="Protocolo, local, relator..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </label>
                      <select
                        value={filtroStatus}
                        onChange={(e) => setFiltroStatus(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Todos os status</option>
                        <option value="ABERTO">Aberto</option>
                        <option value="EM_TRIAGEM">Em Triagem</option>
                        <option value="EM_INVESTIGACAO">Em Investigação</option>
                        <option value="EM_ANALISE">Em Análise</option>
                        <option value="AGUARDANDO_ACAO">Aguardando Ação</option>
                        <option value="CONCLUIDO">Concluído</option>
                        <option value="FECHADO">Fechado</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Tipo de relato
                      </label>
                      <select
                        value={filtroTipo}
                        onChange={(e) => setFiltroTipo(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Todos os tipos</option>
                        <option value="PERIGO">Perigo</option>
                        <option value="OCORRENCIA">Ocorrência</option>
                        <option value="INCIDENTE">Incidente</option>
                        <option value="ACIDENTE">Acidente</option>
                      </select>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Relatos encontrados
                      </div>
                      <div className="mt-1 text-2xl font-bold text-slate-900">{relatosTotal}</div>
                    </div>
                  </div>
                </aside>

                <section>
                  <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-sm text-slate-600">
                      Mostrando {relatosFiltrados.length} de {relatosTotal} relatos
                    </span>
                    <button
                      onClick={() => {
                        setShowModalRelato(true);
                        setErro(null);
                      }}
                      className="ml-auto rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                    >
                      + Novo Relato
                    </button>
                  </div>

                  {/* Lista de relatos */}
                  {loadingRelatos ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <div
                          key={`relato-skeleton-${idx}`}
                          className="animate-pulse rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div className="h-3 w-48 rounded bg-slate-200" />
                          <div className="mt-3 h-3 w-64 rounded bg-slate-200" />
                          <div className="mt-3 h-3 w-40 rounded bg-slate-200" />
                        </div>
                      ))}
                    </div>
                  ) : relatosFiltrados.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <p className="text-lg font-medium">Nenhum relato encontrado</p>
                      <p className="text-sm mt-1">
                        {buscaRelatos.trim()
                          ? 'Ajuste o termo de busca ou limpe os filtros.'
                          : 'Crie o primeiro relato de segurança'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {relatosFiltrados.map((r) => (
                        <div
                          key={r.id}
                          onClick={() => navigate(`/sgso/relatos/${r.id}`)}
                          className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                        >
                          <div className="mb-3 h-1.5 w-24 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500" />
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-slate-500">
                                  {r.numero_protocolo}
                                </span>
                                <span
                                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_RELATO_COLOR[r.tipo]}`}
                                >
                                  {TIPO_RELATO_LABEL[r.tipo]}
                                </span>
                                <span
                                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_RELATO_COLOR[r.status]}`}
                                >
                                  {STATUS_RELATO_LABEL[r.status]}
                                </span>
                                {r.efetividade_cognitiva !== null &&
                                  r.efetividade_cognitiva < 70 && (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                                      FRMS contexto {r.efetividade_cognitiva.toFixed(0)}%
                                    </span>
                                  )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-sm text-slate-600 flex-wrap">
                                <span>{formatDatetime(r.data_ocorrencia)}</span>
                                {r.local_icao && <span>• {r.local_icao}</span>}
                                {r.aeronave_matricula && (
                                  <span>
                                    • {r.aeronave_matricula} ({r.aeronave_modelo})
                                  </span>
                                )}
                                {r.categoria_adrep && (
                                  <span>• {r.categoria_adrep.replace(/_/g, ' ')}</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                {r.anonimo ? 'Anônimo' : (r.relator_nome ?? '—')} •{' '}
                                {formatDate(r.created_at)}
                              </div>
                            </div>
                            <svg
                              className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>
                          <div
                            className="mt-3 flex flex-wrap items-center gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              onClick={() => navigate(`/sgso/relatos/${r.id}`)}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                            >
                              Abrir
                            </button>
                            <button
                              onClick={() => void copiarProtocolo(r.numero_protocolo)}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                            >
                              Copiar protocolo
                            </button>
                            <select
                              value={r.status}
                              disabled={updatingRelatoId === r.id}
                              onChange={(event) =>
                                void atualizarStatusRapido(r.id, event.target.value)
                              }
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                            >
                              <option value="ABERTO">Aberto</option>
                              <option value="EM_ANALISE">Em Análise</option>
                              <option value="AGUARDANDO_ACAO">Aguardando Ação</option>
                              <option value="FECHADO">Fechado</option>
                            </select>
                            {updatingRelatoId === r.id && (
                              <span className="text-xs text-slate-500">Atualizando...</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ── ABA: DASHBOARD KPIs ──────────────────────────── */}
          {activeTab === 'dashboard' && (
            <div>
              {loadingKpi ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !kpiSpi ? (
                <p className="text-slate-500 text-center py-12">Carregando indicadores...</p>
              ) : (
                <>
                  {/* Cards de resumo */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <p className="text-xs text-slate-500">Relatos (90 dias)</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">
                        {kpiSpi.resumo.total_relatos_90d}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <p className="text-xs text-slate-500">Horas de Voo (90d)</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">
                        {kpiSpi.resumo.horas_voo_90d.toFixed(0)}h
                      </p>
                    </div>
                    <div
                      className={`border rounded-xl p-4 ${kpiSpi.resumo.ncs_abertas > 5 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}
                    >
                      <p className="text-xs text-slate-500">NCs Abertas &gt;30d</p>
                      <p
                        className={`text-2xl font-bold mt-1 ${kpiSpi.resumo.ncs_abertas > 5 ? 'text-red-700' : 'text-slate-900'}`}
                      >
                        {kpiSpi.resumo.ncs_abertas}
                      </p>
                    </div>
                    <div
                      className={`border rounded-xl p-4 ${(kpiSpi.resumo.efetividade_media ?? 100) < 65 ? 'bg-red-50 border-red-200' : (kpiSpi.resumo.efetividade_media ?? 100) < 75 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}
                    >
                      <p className="text-xs text-slate-500">Índice FRMS estimado</p>
                      <p
                        className={`text-2xl font-bold mt-1 ${(kpiSpi.resumo.efetividade_media ?? 100) < 65 ? 'text-red-700' : 'text-slate-900'}`}
                      >
                        {kpiSpi.resumo.efetividade_media !== null
                          ? `${kpiSpi.resumo.efetividade_media.toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {/* SPIs */}
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    Safety Performance Indicators (SPI)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {kpiSpi.spis.map((spi) => (
                      <div
                        key={spi.codigo}
                        className={`border rounded-xl p-4 ${SPI_STATUS_COLOR[spi.status]}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-xs font-medium text-slate-600">{spi.nome}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{spi.descricao}</p>
                          </div>
                          <span className={`text-lg font-bold ml-2 ${SPI_VALUE_COLOR[spi.status]}`}>
                            {spi.status === 'ok'
                              ? '✓'
                              : spi.status === 'critico'
                                ? '✗'
                                : spi.status === 'atencao'
                                  ? '⚠'
                                  : '—'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <div>
                            <span className={`text-xl font-bold ${SPI_VALUE_COLOR[spi.status]}`}>
                              {spi.valor_atual !== null ? spi.valor_atual.toFixed(1) : '—'}
                            </span>
                            <span className="text-xs text-slate-500 ml-1">{spi.unidade}</span>
                          </div>
                          <span className="text-xs text-slate-400">
                            Meta: {spi.meta_operador}
                            {spi.meta_valor}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Alertas operacionais (backlog, FRAT, barreiras) */}
                  {(kpiSpi.resumo.backlog_triagem_24h ?? 0) > 0 ||
                  (kpiSpi.resumo.frat_alto_sem_aprovacao ?? 0) > 0 ||
                  (kpiSpi.resumo.barreiras_degradadas ?? 0) > 0 ? (
                    <>
                      <h3 className="text-sm font-semibold text-red-700 mb-3 mt-6 flex items-center gap-2">
                        <span>⚠️</span> Alertas Operacionais
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                        {(kpiSpi.resumo.backlog_triagem_24h ?? 0) > 0 && (
                          <div className="border border-red-200 bg-red-50 rounded-xl p-4">
                            <p className="text-xs text-slate-500">Backlog Triagem +24h</p>
                            <p className="text-2xl font-bold text-red-700 mt-1">
                              {kpiSpi.resumo.backlog_triagem_24h}
                            </p>
                            <p className="text-xs text-red-500 mt-1">
                              Relatos sem triagem iniciada
                            </p>
                          </div>
                        )}
                        {(kpiSpi.resumo.frat_alto_sem_aprovacao ?? 0) > 0 && (
                          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                            <p className="text-xs text-slate-500">FRAT Alto sem Aprovação</p>
                            <p className="text-2xl font-bold text-amber-700 mt-1">
                              {kpiSpi.resumo.frat_alto_sem_aprovacao}
                            </p>
                            <p className="text-xs text-amber-500 mt-1">Despachos bloqueados</p>
                          </div>
                        )}
                        {(kpiSpi.resumo.barreiras_degradadas ?? 0) > 0 && (
                          <div className="border border-orange-200 bg-orange-50 rounded-xl p-4">
                            <p className="text-xs text-slate-500">Barreiras Degradadas</p>
                            <p className="text-2xl font-bold text-orange-700 mt-1">
                              {kpiSpi.resumo.barreiras_degradadas}
                            </p>
                            <p className="text-xs text-orange-500 mt-1">DEGRADADA ou INOPERANTE</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}

                  {/* Indicadores Antecipados (Leading) */}
                  {(kpiSpi.leading_indicators ?? []).length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-6">
                        Indicadores Antecipados
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                        {(kpiSpi.leading_indicators ?? []).map((li) => (
                          <div
                            key={li.codigo}
                            className={`border rounded-xl p-4 ${
                              li.status === 'critico'
                                ? 'bg-red-50 border-red-200'
                                : li.status === 'atencao'
                                  ? 'bg-amber-50 border-amber-200'
                                  : 'bg-green-50 border-green-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-slate-600">{li.nome}</p>
                              <span
                                className={`text-base font-bold ${
                                  li.status === 'critico'
                                    ? 'text-red-600'
                                    : li.status === 'atencao'
                                      ? 'text-amber-600'
                                      : 'text-green-600'
                                }`}
                              >
                                {li.status === 'ok' ? '✓' : li.status === 'critico' ? '⛔' : '⚠️'}
                              </span>
                            </div>
                            <div className="mt-2">
                              <span
                                className={`text-xl font-bold ${
                                  li.status === 'critico'
                                    ? 'text-red-700'
                                    : li.status === 'atencao'
                                      ? 'text-amber-700'
                                      : 'text-green-700'
                                }`}
                              >
                                {li.valor_atual}
                              </span>
                              <span className="text-xs text-slate-500 ml-1">{li.unidade}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Tendências 28 dias */}
                  {(kpiSpi.tendencia_curta ?? []).length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 mt-2">
                        Tendências 28 dias
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(kpiSpi.tendencia_curta ?? []).map((tc) => (
                          <div
                            key={tc.codigo}
                            className={`border rounded-xl p-4 ${
                              tc.favoravel
                                ? 'bg-white border-slate-200'
                                : tc.direcao !== 'ESTAVEL'
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-amber-50 border-amber-200'
                            }`}
                          >
                            <p className="text-xs font-medium text-slate-600">{tc.nome}</p>
                            <div className="flex items-end justify-between mt-2">
                              <span
                                className={`text-xl font-bold ${
                                  tc.favoravel ? 'text-green-700' : 'text-red-700'
                                }`}
                              >
                                {tc.valor_atual.toFixed(1)}
                              </span>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-sm font-semibold ${
                                    tc.direcao === 'SUBIU'
                                      ? tc.favoravel
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                      : tc.direcao === 'CAIU'
                                        ? tc.favoravel
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {tc.direcao === 'SUBIU' ? '↑' : tc.direcao === 'CAIU' ? '↓' : '→'}
                                  {tc.delta_percentual !== null
                                    ? ` ${Math.abs(tc.delta_percentual).toFixed(1)}%`
                                    : ''}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              período anterior: {tc.valor_periodo_anterior.toFixed(1)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── ABA: AUDITORIAS ──────────────────────────────── */}
          {activeTab === 'auditorias' && (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => {
                    setShowModalAuditoria(true);
                    setErro(null);
                  }}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                >
                  + Nova Auditoria
                </button>
              </div>

              {loadingAuditorias ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : auditorias.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-lg font-medium">Nenhuma auditoria</p>
                  <p className="text-sm mt-1">Crie a primeira auditoria de segurança</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {auditorias.map((a) => (
                    <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900">{a.titulo}</span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_AUDITORIA_COLOR[a.status]}`}
                            >
                              {a.status.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {a.tipo.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
                            {a.data_programada && <span>📅 {formatDate(a.data_programada)}</span>}
                            {a.auditor_nome && <span>👤 {a.auditor_nome}</span>}
                            {a.total_itens > 0 && (
                              <span>
                                {a.itens_nc_major > 0 && (
                                  <span className="text-red-600 font-medium">
                                    {a.itens_nc_major} MAJOR{' '}
                                  </span>
                                )}
                                {a.itens_nc_minor > 0 && (
                                  <span className="text-amber-600 font-medium">
                                    {a.itens_nc_minor} MINOR{' '}
                                  </span>
                                )}
                              </span>
                            )}
                            {a.percentual_conformidade !== null && (
                              <span
                                className={
                                  a.percentual_conformidade >= 80
                                    ? 'text-green-600 font-medium'
                                    : 'text-amber-600 font-medium'
                                }
                              >
                                {a.percentual_conformidade.toFixed(1)}% conformidade
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ABA: NÃO CONFORMIDADES ───────────────────────── */}
          {activeTab === 'ncs' && (
            <div>
              {loadingNcs ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : ncs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-lg font-medium">Nenhuma não conformidade</p>
                  <p className="text-sm mt-1">
                    NCs são geradas automaticamente ao responder auditorias
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ncs.map((nc) => (
                    <div key={nc.id} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${NC_TIPO_COLOR[nc.tipo]}`}
                            >
                              {nc.tipo}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                nc.status === 'FECHADA'
                                  ? 'bg-green-100 text-green-700'
                                  : nc.status === 'ABERTA'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {nc.status.replace('_', ' ')}
                            </span>
                            {nc.rbac_referencia && (
                              <span className="text-xs text-slate-500 font-mono">
                                {nc.rbac_referencia}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-800 mt-1">{nc.descricao}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                            {nc.auditoria_titulo && <span>Auditoria: {nc.auditoria_titulo}</span>}
                            {nc.responsavel_nome && <span>Resp: {nc.responsavel_nome}</span>}
                            {nc.prazo_resolucao && (
                              <span
                                className={
                                  new Date(nc.prazo_resolucao) < new Date() &&
                                  nc.status !== 'FECHADA'
                                    ? 'text-red-500 font-medium'
                                    : ''
                                }
                              >
                                Prazo: {formatDate(nc.prazo_resolucao)}
                              </span>
                            )}
                            <span>{formatDate(nc.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────── */}
      {/* Modal: Novo Relato */}
      {/* ─────────────────────────────────────────────────── */}
      {showModalRelato && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Novo Relato de Segurança</h2>
              <button
                onClick={() => setShowModalRelato(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {erro && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {erro}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo *</label>
                  <select
                    value={formRelato.tipo}
                    onChange={(e) => setFormRelato({ ...formRelato, tipo: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="OCORRENCIA">Ocorrência</option>
                    <option value="PERIGO">Perigo</option>
                    <option value="INCIDENTE">Incidente</option>
                    <option value="ACIDENTE">Acidente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data e Hora *
                  </label>
                  <input
                    type="datetime-local"
                    value={formRelato.data_ocorrencia}
                    onChange={(e) =>
                      setFormRelato({ ...formRelato, data_ocorrencia: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fase do Voo
                  </label>
                  <select
                    value={formRelato.fase_voo}
                    onChange={(e) => setFormRelato({ ...formRelato, fase_voo: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    <option value="PREFLIGHT">Pré-voo</option>
                    <option value="TAXI">Táxi</option>
                    <option value="DECOLAGEM">Decolagem</option>
                    <option value="SUBIDA">Subida</option>
                    <option value="CRUZEIRO">Cruzeiro</option>
                    <option value="DESCIDA">Descida</option>
                    <option value="APROXIMACAO">Aproximação</option>
                    <option value="POUSO">Pouso</option>
                    <option value="POS_VOO">Pós-voo</option>
                    <option value="SOLO">Solo</option>
                    <option value="MANUTENCAO">Manutenção</option>
                    <option value="NAO_APLICAVEL">Não Aplicável</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Condição MET
                  </label>
                  <select
                    value={formRelato.condicao_meteorologica}
                    onChange={(e) =>
                      setFormRelato({ ...formRelato, condicao_meteorologica: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    <option value="VMC">VMC</option>
                    <option value="IMC">IMC</option>
                    <option value="NOITE_VMC">Noite VMC</option>
                    <option value="NOITE_IMC">Noite IMC</option>
                    <option value="DEGRADADA">Degradada</option>
                    <option value="NAO_APLICAVEL">N/A</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Local (ICAO)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: SBRJ, PLAT01"
                    value={formRelato.local_icao}
                    onChange={(e) => setFormRelato({ ...formRelato, local_icao: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm uppercase"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Categoria ADREP
                  </label>
                  <select
                    value={formRelato.categoria_adrep}
                    onChange={(e) =>
                      setFormRelato({ ...formRelato, categoria_adrep: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    {categorias.map((cat) => (
                      <option key={cat.codigo} value={cat.codigo}>
                        {cat.nome_pt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Descrição Narrativa *
                </label>
                <textarea
                  rows={4}
                  placeholder="Descreva detalhadamente o que ocorreu, incluindo contexto, ações tomadas e consequências observadas..."
                  value={formRelato.descricao}
                  onChange={(e) => setFormRelato({ ...formRelato, descricao: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {formRelato.descricao.length} caracteres (mínimo 10)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formRelato.anonimo}
                    onChange={(e) => setFormRelato({ ...formRelato, anonimo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
                <span className="text-sm text-slate-700">Relato Anônimo</span>
                {formRelato.anonimo && (
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                    Sua identidade não será registrada
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowModalRelato(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                onClick={submitRelato}
                disabled={submitting}
                className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Enviando...' : 'Enviar Relato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/* Modal: Nova Auditoria */}
      {/* ─────────────────────────────────────────────────── */}
      {showModalAuditoria && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Nova Auditoria</h2>
              <button
                onClick={() => setShowModalAuditoria(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {erro && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {erro}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo *</label>
                <select
                  value={formAuditoria.tipo}
                  onChange={(e) => setFormAuditoria({ ...formAuditoria, tipo: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="INTERNA">Auditoria Interna</option>
                  <option value="EXTERNA">Auditoria Externa</option>
                  <option value="RAMP_CHECK">Ramp Check</option>
                  <option value="OPERACIONAL">Auditoria Operacional</option>
                  <option value="MANUTENCAO">Auditoria de Manutenção</option>
                  <option value="REVISAO_SGO">Revisão de Desempenho SGO</option>
                  <option value="FORNECEDORES">Auditoria de Fornecedores</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Título *</label>
                <input
                  type="text"
                  placeholder="Ex: Auditoria Interna SGSO Q1 2026"
                  value={formAuditoria.titulo}
                  onChange={(e) => setFormAuditoria({ ...formAuditoria, titulo: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data Programada
                  </label>
                  <input
                    type="date"
                    value={formAuditoria.data_programada}
                    onChange={(e) =>
                      setFormAuditoria({ ...formAuditoria, data_programada: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Auditor</label>
                  <select
                    value={formAuditoria.auditor_id}
                    onChange={(e) =>
                      setFormAuditoria({ ...formAuditoria, auditor_id: e.target.value })
                    }
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
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={formAuditoria.descricao}
                  onChange={(e) =>
                    setFormAuditoria({ ...formAuditoria, descricao: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowModalAuditoria(false)}
                className="px-4 py-2 text-sm text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={submitAuditoria}
                disabled={submitting}
                className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Salvando...' : 'Criar Auditoria'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
