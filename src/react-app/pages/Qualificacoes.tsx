import { useState, useEffect, useMemo, Suspense, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Check,
  Pencil,
  Edit2,
  Trash2,
  RefreshCw,
  Award,
  BellRing,
  Mail,
  Plus,
  History,
  Info,
  Bookmark,
  FolderOpen,
  Search,
  ListFilter,
  Columns2,
  AlertCircle,
  RotateCcw,
  BadgeCheck,
  ShieldCheck,
  Tag,
  CalendarDays,
  Grid3x3,
  ClipboardList,
  Users,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import {
  useQualificacoesHistorico,
  useQualificacaoTipos,
} from '@/react-app/hooks/useQualificacoesExt';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';
import {
  useEnviarConvocacaoTreinamento,
  usePreviewConvocacaoTreinamento,
  useReenviarConvocacaoTreinamento,
  useTreinamentosPlanejados,
  type TreinamentoPlanejado,
  type TreinamentoPlanejadoConvocacaoPreview,
} from '@/react-app/hooks/useTreinamentosPlanejados';
import { lmsKeys } from '@/react-app/hooks/useLms';
import { useAeronavesConfig } from '@/react-app/hooks/useAeronavesConfig';
import { API_BASE_URL, getAccessToken, fetchWithAuth } from '@/react-app/config/api';
import { clearApiCacheByPattern, useApi } from '@/react-app/hooks/useApi';
import { DataTable, Column, SortConfig } from '@/components/ui/DataTable';
import { RowActionsMenu, type RowAction } from '@/react-app/components/UI/RowActionsMenu';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { Modal } from '@/components/ui/Modal';
import { ModalAlertaEAD } from '@/react-app/components/modals/ModalAlertaEAD';
import PageHeader from '@/react-app/components/PageHeader';
import TimeInput from '@/react-app/components/TimeInput';
import { MultiSelect, type MultiSelectOption } from '@/react-app/components/UI/MultiSelect';
import { useTablePreferences } from '@/react-app/hooks/useTablePreferences';
import { useAuth } from '@/react-app/hooks/useAuth';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import { CertificadoModalLoader } from '@/react-app/components/qualificacoes/CertificadoModalLoader';
// 🚀 LAZY LOADING: Modais carregados apenas quando necessário
const ModalAtribuirQualificacao = lazyWithRetry(
  () =>
    import('@/react-app/components/modals/ModalAtribuirQualificacao').then((m) => ({
      default: m.ModalAtribuirQualificacao,
    })),
  'ModalAtribuirQualificacao',
);
const ModalRenovarQualificacao = lazyWithRetry(
  () =>
    import('@/react-app/components/modals/ModalRenovarQualificacao').then((m) => ({
      default: m.ModalRenovarQualificacao,
    })),
  'ModalRenovarQualificacao',
);
import { FormField, TextInput, Select, TextArea, FormActions } from '@/components/ui/Form';
import ModernCheckbox from '@/react-app/components/shared/ModernCheckbox';
import { showToast } from '@/react-app/utils/toast';
import { safeDelete } from '@/react-app/utils/safeDelete';
import { logger } from '@/react-app/utils/logger';
import { apiFetch } from '@/react-app/lib/apiFetch';
const TreinamentosPlanejadosPage = lazyWithRetry(
  () => import('./TreinamentosPlanejadosPage'),
  'TreinamentosPlanejadosPage',
);
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';
import {
  buildPlanejadasRelacionadasMap,
  computeHistoricoHeaderStats,
  findPlanejadaRelacionada,
  getHistoricoDisplayStatus,
  getPlanejamentoRelacionamentoKey as getPlanejamentoRelacionamentoKeyBase,
} from '@/react-app/pages/qualificacoes/historicoStatusUtils';
import { resolveClassificationTagAppearance } from '@/react-app/pages/qualificacoes/classificacaoColors';
import { buildTipoUpdatePayload } from '@/react-app/pages/qualificacoes/buildTipoUpdatePayload';
import {
  buildTipoPayload,
  buildTipoSaveSuccessMessage,
  getTipoRelatedCachePatterns,
  type TipoUpdateResponseData,
} from '@/react-app/pages/qualificacoes/tipoSaveFeedback';
import { readUserPreference, writeUserPreference } from '@/react-app/utils/userPreferences';

import {
  ALL_STATUS_VALUES,
  historicoActionButtonClass,
  QUALIFICACOES_PREFS_KEY,
} from './qualificacoes/qualificacoes.constants';
import { useQualificacoesFiltros } from './qualificacoes/hooks/useQualificacoesFiltros';
import { useQualificacoesMutations } from './qualificacoes/hooks/useQualificacoesMutations';
import {
  normalizeCategoriaKey,
  getCategoriaCorDisplay,
  parseDateLocal,
  getStatusColor,
  getStatusDotColor,
  getStatusLabel,
} from './qualificacoes/qualificacoes.helpers';
import { QualificacaoStatusBadge } from './qualificacoes/components/QualificacaoStatusBadge';
import { QualificacaoInfoCard } from './qualificacoes/components/QualificacaoInfoCard';
import { QualificacaoSectionBox } from './qualificacoes/components/QualificacaoSectionBox';
import { QualificacaoDataPoint } from './qualificacoes/components/QualificacaoDataPoint';
import { QualificacaoEmptyState } from './qualificacoes/components/QualificacaoEmptyState';
import { QualificacaoChip } from './qualificacoes/components/QualificacaoChip';
import { QualificacaoAlert } from './qualificacoes/components/QualificacaoAlert';
import type {
  QualificacoesPrefs,
  QualificacoesModelosPrefs,
} from './qualificacoes/qualificacoes.types';

export default function Qualificacoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const highlightedHistoricoId = useMemo(() => {
    const rawId = searchParams.get('id');
    if (!rawId) return null;
    const parsedId = Number(rawId);
    return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  }, [searchParams]);

  const { aeronaves: aeronavesConfig } = useAeronavesConfig();

  const {
    activeTab,
    setActiveTab,
    plannedView,
    setPlannedView,
    limit,
    setLimit,
    page,
    setPage,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    setDebouncedSearch,
    sortConfig,
    setSortConfig,
    aeronaveFilter,
    setAeronaveFilter,
    categoriaFilter,
    setCategoriaFilter,
    setorFilter,
    setSetorFilter,
    categoriasSetorFilter,
    setCategoriasSetorFilter,
    statusFiltro,
    setStatusFiltro,
    getDefaultHistoricoStatusSet,
    applySingleStatusFromChip,
    resetStatusFromChip,
    isOnlyStatusSelected,
    isHistoricoTab,
    isPlanejadosTab,
    usesHistoricoDataset,
    historicoCategoriaId,
    setHistoricoCategoriaId,
    effectiveHistoricoStatusFiltro,
    isDefaultStatusFilter,
  } = useQualificacoesFiltros(highlightedHistoricoId);

  const [autoOpenTurmasModal, setAutoOpenTurmasModal] = useState(false);

  const {
    historico,
    stats: historicoStats,
    loading,
    error: historicoError,
    carregarHistorico,
    meta: historicoMeta, // Meta da paginação para contagem correta após filtro
  } = useQualificacoesHistorico(
    undefined,
    limit,
    page,
    true,
    debouncedSearch,
    sortConfig.column || 'data_vencimento',
    (sortConfig.direction?.toUpperCase() as 'ASC' | 'DESC') || 'ASC',
    aeronaveFilter,
    categoriaFilter,
    effectiveHistoricoStatusFiltro,
    setorFilter.length > 0 ? setorFilter : undefined,
    highlightedHistoricoId || undefined,
    true,
    historicoCategoriaId,
  );

  const shouldLoadPlannedRelatedHistorico = useMemo(
    () =>
      isHistoricoTab &&
      (historico as HistoricoItem[]).some((item) => getHistoricoDisplayStatus(item) === 'VENCIDA'),
    [historico, isHistoricoTab],
  );

  // Planejadas query: uses clean params — must NOT inherit Histórico tab filters
  // (search, aeronave, categoria) to avoid items disappearing when those filters are active.
  // Só é necessária quando a página atual contém vencidas que podem exibir o badge "Já planejada".
  const { historico: historicoPlanejadoRelacionado } = useQualificacoesHistorico(
    undefined,
    500,
    1,
    false,
    '',
    'data_conclusao',
    'ASC',
    undefined,
    undefined,
    ['PLANEJADA'],
    undefined,
    undefined,
    shouldLoadPlannedRelatedHistorico,
  );

  // Query without status filter so we can count operational turmas for the Planejadas chip
  // (PLANEJADO + CONFIRMADO + EM_ANDAMENTO). Existing consumers filter by status internally.
  const treinamentosPlanejadosConvocacaoQuery = useTreinamentosPlanejados({});
  const previewConvocacaoPlanejada = usePreviewConvocacaoTreinamento();
  const enviarConvocacaoPlanejada = useEnviarConvocacaoTreinamento();
  const reenviarConvocacaoPlanejada = useReenviarConvocacaoTreinamento();

  const historicoTotal = historicoMeta?.total ?? 0;

  // 🎯 Stats corretos do endpoint de dashboard
  const [dashboardStats, setDashboardStats] = useState({
    total: 0,
    validas: 0,
    vencendo: 0,
    vencidas: 0,
    renovadas: 0,
    planejadas: 0,
  });

  // 🔍 Aplicar filtros da URL ao montar componente
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const viewParam = searchParams.get('view');

    if (tabParam === 'turmas') {
      // Legacy URL: /qualificacoes?tab=turmas → Planejados > Turmas subview
      setActiveTab('planejados');
      setPlannedView('turmas');
    } else if (tabParam === 'planejados') {
      setActiveTab('planejados');
      if (viewParam === 'lista' || viewParam === 'calendario' || viewParam === 'turmas') {
        setPlannedView(viewParam);
      }
    }

    if (highlightedHistoricoId) {
      setActiveTab('historico');
      setPage(1);
      setSearchTerm('');
      setDebouncedSearch('');
      setStatusFiltro(new Set(ALL_STATUS_VALUES));
      return;
    }

    const statusParam = searchParams.get('status');
    if (statusParam) {
      // Mapear parâmetros da URL para valores do Set
      const statusMap: Record<string, string[]> = {
        vencida: ['VENCIDA'],
        vencendo: ['VENCENDO_30'],
        valida: ['VALIDA'],
        planejada: ['PLANEJADA'],
        cancelada: ['CANCELADA'],
      };

      const statusValues = statusMap[statusParam.toLowerCase()];
      if (statusValues) {
        setStatusFiltro(new Set(statusValues));
      }
    }
  }, [highlightedHistoricoId, searchParams]);

  // Modal de alerta EAD
  const [alertaEADModal, setAlertaEADModal] = useState<{
    isOpen: boolean;
    qualificacao: any;
  }>({ isOpen: false, qualificacao: null });

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);

  const carregarStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      // Cache busting
      const response = await fetchWithAuth(
        `${API_BASE_URL}/dashboard/qualificacoes?t=${new Date().getTime()}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        },
      );
      if (!response.ok) throw new Error('Erro ao carregar stats');
      const json = await response.json();
      const data = json.data || json;
      setDashboardStats({
        total: data.total_ativas || 0,
        validas: data.validas || 0,
        vencendo: data.a_vencer_30_dias || 0,
        vencidas: data.vencidas || 0,
        renovadas: data.renovadas || 0,
        planejadas: data.planejadas || 0,
      });
    } catch (error) {
      console.error('Erro ao carregar stats do dashboard:', error);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Buscar stats do dashboard
  useEffect(() => {
    void carregarStats();
  }, [carregarStats]);

  const stats = historicoStats;

  const [showModal, setShowModal] = useState(false);
  const canManageTipos = ['ADMINISTRADOR', 'ADMIN'].includes(
    String(user?.role || '').toUpperCase(),
  );
  const defaultModelosPrefs = useMemo<QualificacoesModelosPrefs>(
    () => ({
      searchTerm: '',
      categoriaFilter: '',
      setorFilter: [],
    }),
    [],
  );
  const {
    preferences: modelosPrefs,
    setPreferences: setModelosPrefs,
    ready: modelosPrefsReady,
  } = useTablePreferences<QualificacoesModelosPrefs>(
    'table.qualificacoes.modelos',
    defaultModelosPrefs,
  );
  // Tipos agora são fornecidos pelo hook dedicado useQualificacaoTipos
  type TipoQualificacao = {
    id: string | number;
    tipo?: string | null;
    nome: string;
    codigo?: string | null;
    categoria?: string | null;
    categoria_id?: number | null;
    validade?: number | null;
    observacoes?: string | null;
    ativo?: boolean | number;
    descricao?: string | null;
    conteudo_programatico?: string | null;
    carga_horaria?: number | null;
    carga_horaria_inicial?: number | null;
    carga_horaria_recorrente?: number | null;
    vencimento_fim_mes?: number; // 0 = dia exato, 1 = fim do mês
    is_check?: number | boolean | null;
    created_at?: string;
    updated_at?: string | null;
    setores?: Array<{ id: number; nome: string }>;
    is_transversal?: boolean;
    setor_ids?: number[];
  };
  type QualificacaoTipoDTO = TipoQualificacao;

  type Categoria = {
    id?: number;
    nome: string;
    descricao?: string | null;
    cor?: string | null;
  };

  const [editingQualificacao, setEditingQualificacao] = useState<HistoricoItem | null>(null);

  // Estado para modal de renovação
  const [showRenovarModal, setShowRenovarModal] = useState(false);
  const [qualificacaoParaRenovar, setQualificacaoParaRenovar] = useState<HistoricoItem | null>(
    null,
  );
  const [showPlanejadaModal, setShowPlanejadaModal] = useState(false);
  const [planejadaSelecionada, setPlanejadaSelecionada] = useState<HistoricoItem | null>(null);
  const [novaDataPlanejada, setNovaDataPlanejada] = useState('');
  const [salvandoPlanejadaId, setSalvandoPlanejadaId] = useState<number | null>(null);
  const [showConvocacaoPlanejadaModal, setShowConvocacaoPlanejadaModal] = useState(false);
  const [planejadaConvocacaoSelecionada, setPlanejadaConvocacaoSelecionada] =
    useState<HistoricoItem | null>(null);
  const [turmaConvocacaoSelecionadaId, setTurmaConvocacaoSelecionadaId] = useState<number | null>(
    null,
  );
  const [convocacaoPlanejadaPreview, setConvocacaoPlanejadaPreview] =
    useState<TreinamentoPlanejadoConvocacaoPreview | null>(null);
  const [confirmarReenvioConvocacaoPlanejada, setConfirmarReenvioConvocacaoPlanejada] =
    useState(false);
  const [ignorarSemEmailConvocacaoPlanejada, setIgnorarSemEmailConvocacaoPlanejada] =
    useState(false);
  const [escopoEnvioConvocacaoPlanejada, setEscopoEnvioConvocacaoPlanejada] = useState<
    'turma' | 'funcionario'
  >('turma');
  const [enviandoConvocacaoPlanejadaFallback, setEnviandoConvocacaoPlanejadaFallback] =
    useState(false);
  const [gestoresCcDisponiveis, setGestoresCcDisponiveis] = useState<
    Array<{
      id: number;
      nome: string;
      email: string;
      cargo?: string | null;
      empresa?: string | null;
      ativo: boolean;
    }>
  >([]);
  const [carregandoGestoresCc, setCarregandoGestoresCc] = useState(false);
  const [gestoresCcSelecionadosIds, setGestoresCcSelecionadosIds] = useState<number[]>([]);
  const [showTurmaPlanejadaModal, setShowTurmaPlanejadaModal] = useState(false);
  const [turmaPlanejadaQualificacaoCodigo, setTurmaPlanejadaQualificacaoCodigo] = useState('');
  const [turmaPlanejadaData, setTurmaPlanejadaData] = useState('');
  const [turmaPlanejadaHorario, setTurmaPlanejadaHorario] = useState('');
  const [turmaPlanejadaLocal, setTurmaPlanejadaLocal] = useState('');
  const [turmaPlanejadaInstrutor, setTurmaPlanejadaInstrutor] = useState('');
  const [turmaPlanejadaObservacoes, setTurmaPlanejadaObservacoes] = useState('');
  const [turmaPlanejadaTipoTreinamento, setTurmaPlanejadaTipoTreinamento] = useState<
    'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO'
  >('INICIAL');
  const [turmaPlanejadaParticipantesSelecionados, setTurmaPlanejadaParticipantesSelecionados] =
    useState<number[]>([]);
  const [buscaParticipanteTurmaPlanejada, setBuscaParticipanteTurmaPlanejada] = useState('');
  const [salvandoTurmaPlanejada, setSalvandoTurmaPlanejada] = useState(false);
  const [searchTipos, setSearchTipos] = useState(''); // Campo de busca para tipos

  // Estados para modais de qualificação (showModal já existe acima)
  const [modalEditarAberto, setModalEditarAberto] = useState(false); // Modal de editar simplificado
  const [registroSelecionado, setRegistroSelecionado] = useState<HistoricoItem | null>(null);

  // Estado para tipos de qualificação
  // Hook de tipos (carrega quando aba 'tipos' ativa)
  const {
    tipos,
    loading: loadingTipos,
    refetch: refetchTipos,
    error: tiposError,
  } = useQualificacaoTipos(activeTab === 'tipos' || showTurmaPlanejadaModal, 500, {
    categoriaId:
      activeTab === 'tipos' && categoriaFilter
        ? parseInt(categoriaFilter, 10) || undefined
        : undefined,
    setorIds: activeTab === 'tipos' ? modelosPrefs.setorFilter : undefined,
    search: activeTab === 'tipos' ? searchTipos : undefined,
  });

  const { data: funcionariosAtivosData = [], isLoading: loadingFuncionariosAtivos } =
    useFuncionariosAtivos();
  // Remover estados locais desnecessários
  const [showTipoModal, setShowTipoModal] = useState(false);
  const [editingTipo, setEditingTipo] = useState<QualificacaoTipoDTO | null>(null);

  // Cache de atualizações otimistas de tipos — garante que a tabela mostre
  // o valor salvo IMEDIATAMENTE, antes mesmo do refetch completar.
  // Chave: String(id do tipo), Valor: campos atualizados.
  const [tipoUpdates, setTipoUpdates] = useState<Record<string, Partial<QualificacaoTipoDTO>>>({});

  const modelosPrefsHydratedRef = useRef(false);

  useEffect(() => {
    if (!modelosPrefsReady || modelosPrefsHydratedRef.current) return;
    modelosPrefsHydratedRef.current = true;
    setSearchTipos(modelosPrefs.searchTerm || '');
    if (modelosPrefs.categoriaFilter) {
      setCategoriaFilter(modelosPrefs.categoriaFilter);
    }
  }, [modelosPrefs, modelosPrefsReady]);

  useEffect(() => {
    if (!modelosPrefsReady) return;
    setModelosPrefs((prev) => ({
      ...prev,
      searchTerm: searchTipos,
      categoriaFilter,
    }));
  }, [categoriaFilter, modelosPrefsReady, searchTipos, setModelosPrefs]);

  // Estado para categorias
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [novaCategoriaDesc, setNovaCategoriaDesc] = useState('');

  const getTipoTreinamentoDisplay = (value?: string | null, validadeMeses?: number | null) => {
    const tipo = String(value || '')
      .trim()
      .toUpperCase();

    if (tipo === 'SEMESTRAL' || Number(validadeMeses || 0) === 6) {
      return {
        value: 'SEMESTRAL',
        label: 'Semestral',
        className: 'bg-emerald-100 text-emerald-800',
      };
    }

    if (tipo === 'INICIAL') {
      return {
        value: 'INICIAL',
        label: 'Inicial',
        className: 'bg-amber-100 text-amber-800',
      };
    }

    return {
      value: 'RECORRENTE',
      label: 'Periódico',
      className: 'bg-sky-100 text-sky-800',
    };
  };

  const [showCertModal, setShowCertModal] = useState(false);
  const [historicoSelecionado, setHistoricoSelecionado] = useState<HistoricoItem | null>(null);
  const [certificadoOverrides, setCertificadoOverrides] = useState<Record<number, boolean>>({});
  const historicoSelecionadoId = historicoSelecionado?.id;

  // Estados para confirmação de exclusão
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  // Paginação agora é server-side (gerenciada por limit/page no hook)

  // Estado para painel de configuração de colunas por aba
  const [columnConfigOpen, setColumnConfigOpen] = useState<'historico' | 'tipos' | null>(null);
  const [savingTipo, setSavingTipo] = useState(false);
  const { data: setoresTiposData } = useApi<{ data?: Array<{ id: number; nome: string }> }>(
    '/setores',
    {
      enabled:
        activeTab === 'tipos' ||
        activeTab === 'historico' ||
        activeTab === 'planejados' ||
        activeTab === 'categorias' ||
        showTipoModal,
      requireAuth: true,
      bypassGetCache: true,
    },
  );

  const setoresTipos = useMemo(() => {
    const payload = Array.isArray(setoresTiposData)
      ? setoresTiposData
      : Array.isArray(setoresTiposData?.data)
        ? setoresTiposData.data
        : [];

    return [...payload].sort((a, b) =>
      String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
    );
  }, [setoresTiposData]);

  const setorOptionsTipos = useMemo<MultiSelectOption[]>(
    () => setoresTipos.map((setor) => ({ value: String(setor.id), label: setor.nome })),
    [setoresTipos],
  );

  // Sector options for historico/planejados (same data source, separate const for clarity)
  const setorOptionsHistorico = setorOptionsTipos;

  useEffect(() => {
    if (!modelosPrefsReady) return;
    if (setoresTipos.length !== 1) return;
    const onlySetorId = String(setoresTipos[0].id);
    if (modelosPrefs.setorFilter.length === 1 && modelosPrefs.setorFilter[0] === onlySetorId)
      return;
    setModelosPrefs((prev) => ({ ...prev, setorFilter: [onlySetorId] }));
  }, [modelosPrefs.setorFilter, modelosPrefsReady, setModelosPrefs, setoresTipos]);

  // Auto-select single sector for historico/planejados when user has only one available
  useEffect(() => {
    if (setoresTipos.length !== 1) return;
    const onlySetorId = String(setoresTipos[0].id);
    if (setorFilter.length === 1 && setorFilter[0] === onlySetorId) return;
    setSetorFilter([onlySetorId]);
  }, [setoresTipos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select single sector for categorias tab
  useEffect(() => {
    if (setoresTipos.length !== 1) return;
    const onlySetorId = String(setoresTipos[0].id);
    if (categoriasSetorFilter.length === 1 && categoriasSetorFilter[0] === onlySetorId) return;
    setCategoriasSetorFilter([onlySetorId]);
  }, [setoresTipos]); // eslint-disable-line react-hooks/exhaustive-deps

  const funcionariosAtivos = useMemo(
    () =>
      [...funcionariosAtivosData].sort((a, b) =>
        String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
      ),
    [funcionariosAtivosData],
  );

  const funcionariosAtivosMap = useMemo(
    () =>
      new Map(
        funcionariosAtivos.map((funcionario) => [Number(funcionario.id || 0), funcionario.nome]),
      ),
    [funcionariosAtivos],
  );

  const participantesTurmaPlanejadaFiltrados = useMemo(() => {
    const termo = buscaParticipanteTurmaPlanejada.trim().toLowerCase();
    if (!termo) return funcionariosAtivos;
    return funcionariosAtivos.filter((funcionario) => {
      const nome = String(funcionario.nome || '').toLowerCase();
      const matricula = String(funcionario.matricula || '').toLowerCase();
      return nome.includes(termo) || matricula.includes(termo);
    });
  }, [buscaParticipanteTurmaPlanejada, funcionariosAtivos]);

  const totalParticipantesTurmaPlanejadaFiltrados = participantesTurmaPlanejadaFiltrados.length;
  const totalParticipantesTurmaPlanejadaSelecionados =
    turmaPlanejadaParticipantesSelecionados.length;

  const abrirModalTurmaPlanejada = useCallback(() => {
    setTurmaPlanejadaQualificacaoCodigo((prev) => prev || String(tipos[0]?.codigo || ''));
    setTurmaPlanejadaData('');
    setTurmaPlanejadaHorario('');
    setTurmaPlanejadaLocal('');
    setTurmaPlanejadaInstrutor('');
    setTurmaPlanejadaObservacoes('');
    setTurmaPlanejadaTipoTreinamento('INICIAL');
    setTurmaPlanejadaParticipantesSelecionados([]);
    setBuscaParticipanteTurmaPlanejada('');
    setShowTurmaPlanejadaModal(true);
  }, [tipos]);

  const fecharModalTurmaPlanejada = useCallback(() => {
    if (salvandoTurmaPlanejada) return;
    setShowTurmaPlanejadaModal(false);
  }, [salvandoTurmaPlanejada]);

  const alternarSelecaoParticipanteTurmaPlanejada = useCallback((funcionarioId: number) => {
    setTurmaPlanejadaParticipantesSelecionados((prev) => {
      if (prev.includes(funcionarioId)) {
        return prev.filter((id) => id !== funcionarioId);
      }
      return [...prev, funcionarioId];
    });
  }, []);

  const selecionarTodosParticipantesFiltradosTurmaPlanejada = useCallback(() => {
    setTurmaPlanejadaParticipantesSelecionados((prev) => {
      const idsFiltrados = participantesTurmaPlanejadaFiltrados
        .map((funcionario) => Number(funcionario.id || 0))
        .filter((id) => id > 0);
      const set = new Set(prev);
      idsFiltrados.forEach((id) => set.add(id));
      return Array.from(set);
    });
  }, [participantesTurmaPlanejadaFiltrados]);

  const limparParticipantesFiltradosTurmaPlanejada = useCallback(() => {
    const idsFiltrados = new Set(
      participantesTurmaPlanejadaFiltrados
        .map((funcionario) => Number(funcionario.id || 0))
        .filter((id) => id > 0),
    );
    setTurmaPlanejadaParticipantesSelecionados((prev) =>
      prev.filter((id) => !idsFiltrados.has(id)),
    );
  }, [participantesTurmaPlanejadaFiltrados]);

  const salvarTurmaPlanejada = useCallback(async () => {
    if (!turmaPlanejadaQualificacaoCodigo) {
      showToast.error('Selecione a qualificação da turma.');
      return;
    }
    if (!turmaPlanejadaData) {
      showToast.error('Informe a data planejada da turma.');
      return;
    }
    if (turmaPlanejadaParticipantesSelecionados.length === 0) {
      showToast.error('Selecione ao menos um participante.');
      return;
    }

    const detalhesTurma = [
      turmaPlanejadaLocal ? `Local: ${turmaPlanejadaLocal}` : '',
      turmaPlanejadaHorario ? `Horario: ${turmaPlanejadaHorario}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const observacoesComTurma = [
      '[TURMA PLANEJADA]' + (detalhesTurma ? ` ${detalhesTurma}` : ''),
      turmaPlanejadaObservacoes.trim(),
    ]
      .filter(Boolean)
      .join('\n');

    setSalvandoTurmaPlanejada(true);
    let sucessos = 0;
    const falhas: string[] = [];
    const participantesIds = Array.from(new Set(turmaPlanejadaParticipantesSelecionados));
    const token = getAccessToken();

    for (const funcionarioId of participantesIds) {
      try {
        const response = await apiFetch('/api/qualificacoes/historico', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            funcionario_id: funcionarioId,
            qualificacao_codigo: turmaPlanejadaQualificacaoCodigo,
            data_conclusao: turmaPlanejadaData,
            status: 'PLANEJADA',
            tipo_treinamento: turmaPlanejadaTipoTreinamento,
            instrutor: turmaPlanejadaInstrutor || undefined,
            observacoes: observacoesComTurma || undefined,
          }),
        });

        const json = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };

        if (!response.ok || !json.success) {
          const nome = funcionariosAtivosMap.get(funcionarioId) || `Funcionario ${funcionarioId}`;
          falhas.push(`${nome}: ${json.error || `HTTP ${response.status}`}`);
          continue;
        }

        sucessos += 1;
      } catch (error) {
        const nome = funcionariosAtivosMap.get(funcionarioId) || `Funcionario ${funcionarioId}`;
        falhas.push(`${nome}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }

    if (sucessos > 0) {
      await carregarHistorico();
      // Invalidate consolidated training list so Turmas tab reflects new records immediately
      void queryClient.invalidateQueries({ queryKey: ['treinamentos-planejados'] });
      try {
        const statsResponse = await fetchWithAuth(
          `${API_BASE_URL}/dashboard/qualificacoes?t=${Date.now()}`,
        );
        if (statsResponse.ok) {
          const json = await statsResponse.json();
          const data = json.data || json;
          setDashboardStats({
            total: data.total_ativas || 0,
            validas: data.validas || 0,
            vencendo: data.a_vencer_30_dias || 0,
            vencidas: data.vencidas || 0,
            renovadas: data.renovadas || 0,
            planejadas: data.planejadas || 0,
          });
        }
      } catch {
        // no-op
      }
    }

    if (falhas.length === 0) {
      showToast.success(`${sucessos} qualificacao(oes) planejada(s) criada(s) com sucesso.`);
      setShowTurmaPlanejadaModal(false);
    } else if (sucessos > 0) {
      showToast.error(
        `Turma criada parcialmente: ${sucessos} sucesso(s), ${falhas.length} falha(s). ${falhas[0]}`,
      );
    } else {
      showToast.error(`Falha ao criar turma planejada. ${falhas[0] || ''}`);
    }

    setSalvandoTurmaPlanejada(false);
  }, [
    carregarHistorico,
    funcionariosAtivosMap,
    turmaPlanejadaData,
    turmaPlanejadaHorario,
    turmaPlanejadaInstrutor,
    turmaPlanejadaLocal,
    turmaPlanejadaObservacoes,
    turmaPlanejadaParticipantesSelecionados,
    turmaPlanejadaQualificacaoCodigo,
    turmaPlanejadaTipoTreinamento,
  ]);

  // Usar useApi para carregar tipos com autenticação automática
  // Removido uso direto de useApi para tipos (substituído por hook dedicado)

  // Usar useApi para carregar categorias — URL dinâmica por setor
  const categoriasApiUrl = useMemo(() => {
    if (categoriasSetorFilter.length === 0) return '/categorias';
    return `/categorias?setor_ids=${categoriasSetorFilter.join(',')}`;
  }, [categoriasSetorFilter]);

  const {
    data: categoriasData,
    error: categoriasError,
    refetch: refetchCategorias,
  } = useApi(categoriasApiUrl);

  // Atualizar tipos quando dados forem carregados
  // Removido efeito de sincronização antigo (tiposData)

  // Atualizar categorias quando dados forem carregados
  useEffect(() => {
    if (categoriasData) {
      const cats = Array.isArray(categoriasData)
        ? categoriasData
        : (categoriasData as { data?: Categoria[] })?.data || [];
      setCategorias(cats as Categoria[]);
    }
  }, [categoriasData]);

  const normalizeTipoCodigo = (value?: string | null) =>
    (value ?? '').toString().trim().toUpperCase();

  const categoriasMap = useMemo(() => {
    const map = new Map<string, Categoria>();
    categorias.forEach((cat) => {
      if (!cat?.nome) return;
      map.set(normalizeCategoriaKey(cat.nome), cat);
    });
    return map;
  }, [categorias]);

  // Carregar categorias ao abrir a aba histórico (para garantir cores)
  useEffect(() => {
    if (usesHistoricoDataset) {
      refetchCategorias();
    }
  }, [refetchCategorias, usesHistoricoDataset]);

  // Tipo para itens do histórico
  type HistoricoItem = (typeof historico)[number] & {
    total_certificados?: number;
    tem_certificado?: number | boolean;
    certificado_arquivo_id?: number | null;
    certificado_url?: string | null;
    categoria?: string;
    qualificacao_categoria?: string;
    funcionario_nome?: string;
    tipo_nome?: string;
    qualificacao_nome?: string;
    instrutor?: string | null;
  };

  const getHistoricoStatus = useCallback(
    (item: HistoricoItem): string => getHistoricoDisplayStatus(item),
    [],
  );

  const getPlanejamentoRelacionamentoKey = useCallback(
    (item: HistoricoItem): string | null => getPlanejamentoRelacionamentoKeyBase(item),
    [],
  );

  const planejadasRelacionadasMap = useMemo(
    () => buildPlanejadasRelacionadasMap(historicoPlanejadoRelacionado as HistoricoItem[]),
    [historicoPlanejadoRelacionado],
  );

  const getPlanejadaRelacionada = useCallback(
    (item: HistoricoItem): HistoricoItem | null =>
      findPlanejadaRelacionada(item, planejadasRelacionadasMap),
    [planejadasRelacionadasMap],
  );

  const hasCertificateSummary = useCallback(
    (item: Pick<HistoricoItem, 'certificado_arquivo_id' | 'certificado_url' | 'tem_certificado'>) =>
      Boolean(item.certificado_arquivo_id || item.certificado_url || item.tem_certificado),
    [],
  );

  // Agora o filtro é feito no backend via API
  // O historico já vem filtrado pelo debouncedSearch
  // Filtrar por status baseado no statusFiltro
  const applyCertificadoStateLocal = useCallback(
    (historicoId: number, temCertificados: boolean) => {
      setCertificadoOverrides((prev) => ({ ...prev, [historicoId]: temCertificados }));
      setHistoricoSelecionado((prev) =>
        prev && prev.id === historicoId
          ? {
              ...prev,
              tem_certificado: temCertificados ? 1 : 0,
              certificado_url: temCertificados ? prev.certificado_url || 'ativo' : undefined,
              certificado_arquivo_id: temCertificados
                ? (prev.certificado_arquivo_id ?? prev.id)
                : undefined,
            }
          : prev,
      );
    },
    [],
  );

  const hasArchivedCertificate = useCallback(
    (item: HistoricoItem) => certificadoOverrides[item.id] ?? false,
    [certificadoOverrides],
  );

  const syncCertificadoState = useCallback(
    async (historicoId: number, temCertificados: boolean) => {
      applyCertificadoStateLocal(historicoId, temCertificados);
      await carregarHistorico();
    },
    [applyCertificadoStateLocal, carregarHistorico],
  );

  const handleCertificadosChange = useCallback(
    (historicoId: number, temCertificados: boolean) => {
      applyCertificadoStateLocal(historicoId, temCertificados);
    },
    [applyCertificadoStateLocal],
  );

  const handleCertificadosUploadSuccess = useCallback(
    (temCertificados: boolean) => {
      if (!historicoSelecionadoId) return;
      void syncCertificadoState(historicoSelecionadoId, temCertificados);
    },
    [historicoSelecionadoId, syncCertificadoState],
  );

  const handleCertificadosDeleteSuccess = useCallback(
    (temCertificados: boolean) => {
      if (!historicoSelecionadoId) return;
      void syncCertificadoState(historicoSelecionadoId, temCertificados);
    },
    [historicoSelecionadoId, syncCertificadoState],
  );

  const historicoItensPagina = useMemo(
    () => (historico as HistoricoItem[]).filter((item) => item?.id),
    [historico],
  );

  const historicoItensPaginaKey = useMemo(
    () =>
      historicoItensPagina
        .map((item) => `${item.id}:${item.certificado_arquivo_id ?? 'null'}`)
        .join('|'),
    [historicoItensPagina],
  );

  const historicoItensPaginaEstado = useMemo(() => {
    return historicoItensPagina
      .map((item) => ({
        id: item.id,
        hasCertificate: hasCertificateSummary(item),
      }))
      .filter((item) => Number.isFinite(item.id));
  }, [hasCertificateSummary, historicoItensPagina]);

  useEffect(() => {
    setCertificadoOverrides((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const item of historicoItensPaginaEstado) {
        if (next[item.id] !== item.hasCertificate) {
          next[item.id] = item.hasCertificate;
          changed = true;
        }
      }

      for (const key of Object.keys(next)) {
        const id = Number(key);
        if (!historicoItensPaginaEstado.some((item) => item.id === id)) {
          delete next[id];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [historicoItensPaginaEstado]);

  const filteredHistorico = useMemo(
    () =>
      (historico as HistoricoItem[]).filter((item) => statusFiltro.has(getHistoricoStatus(item))),
    [getHistoricoStatus, historico, statusFiltro],
  );

  const prioritizedHistorico = useMemo(() => {
    const parseDateForPriority = (value?: string | null): Date | null => {
      if (!value) return null;
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
      if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        return new Date(year, month - 1, day);
      }
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    };

    const shouldPrioritize = (item: HistoricoItem): boolean => {
      const status = String(
        (item as HistoricoItem & { qualificacao_status?: string }).qualificacao_status || '',
      ).toUpperCase();
      if (status !== 'PLANEJADA') return false;

      const dataRef =
        (item as HistoricoItem & { data_realizacao?: string; data_conclusao?: string })
          .data_realizacao || item.data_conclusao;
      const data = parseDateForPriority(dataRef);
      if (!data) return false;

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return data <= hoje;
    };

    return [...filteredHistorico].sort((a, b) => {
      const destaqueA = highlightedHistoricoId && a.id === highlightedHistoricoId ? 1 : 0;
      const destaqueB = highlightedHistoricoId && b.id === highlightedHistoricoId ? 1 : 0;
      if (destaqueA !== destaqueB) {
        return destaqueB - destaqueA;
      }

      const prioridadeA = shouldPrioritize(a) ? 1 : 0;
      const prioridadeB = shouldPrioritize(b) ? 1 : 0;
      return prioridadeB - prioridadeA;
    });
  }, [filteredHistorico, highlightedHistoricoId]);

  const planejadosHistorico = useMemo(() => {
    const items = prioritizedHistorico.filter((item) => {
      return getHistoricoStatus(item) === 'PLANEJADA';
    });

    return items.sort((a, b) => {
      const dataA = parseDateLocal(
        (a as HistoricoItem & { data_realizacao?: string }).data_realizacao || a.data_conclusao,
      );
      const dataB = parseDateLocal(
        (b as HistoricoItem & { data_realizacao?: string }).data_realizacao || b.data_conclusao,
      );

      if (!dataA && !dataB) return 0;
      if (!dataA) return 1;
      if (!dataB) return -1;
      return dataA.getTime() - dataB.getTime();
    });
  }, [getHistoricoStatus, prioritizedHistorico]);

  const planejadosStats = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return planejadosHistorico.reduce(
      (acc, item) => {
        acc.total += 1;
        const data = parseDateLocal(
          (item as HistoricoItem & { data_realizacao?: string }).data_realizacao ||
            item.data_conclusao,
        );
        if (!data) {
          acc.semData += 1;
          return acc;
        }
        if (data < hoje) {
          acc.atrasados += 1;
        } else {
          acc.futuros += 1;
        }
        return acc;
      },
      { total: 0, futuros: 0, atrasados: 0, semData: 0 },
    );
  }, [planejadosHistorico]);

  const shouldUseLocalHistoricoHeaderStats = Boolean(
    debouncedSearch.trim() ||
    aeronaveFilter ||
    categoriaFilter ||
    setorFilter.length > 0 ||
    !isDefaultStatusFilter,
  );

  const localHistoricoStats = useMemo(
    () =>
      computeHistoricoHeaderStats(
        filteredHistorico,
        statusFiltro,
        historicoMeta?.total ?? filteredHistorico.length,
        Number(stats.planejadas || 0),
      ),
    [filteredHistorico, historicoMeta?.total, stats.planejadas, statusFiltro],
  );

  // renovadas/planejadas are always global (from API), never derived from the filtered page.
  // Only total/validas/vencendo/vencidas follow the local-vs-api split.
  const globalRenovadas = Number(stats.renovadas || 0);
  const globalPlanejadas = Number(stats.planejadas || 0);

  const historicoHeaderStats = shouldUseLocalHistoricoHeaderStats
    ? { ...localHistoricoStats, renovadas: globalRenovadas, planejadas: globalPlanejadas }
    : { ...stats, renovadas: globalRenovadas, planejadas: globalPlanejadas };

  const historicoTableLoading = loading && prioritizedHistorico.length === 0;
  const planejadosTableLoading = loading && planejadosHistorico.length === 0;

  // Mescla atualizações otimistas com dados do hook —
  // garante que a tabela reflita o valor salvo IMEDIATAMENTE após PUT,
  // mesmo que o refetch ainda não tenha concluído ou tenha falhado.
  const tiposEfetivos = useMemo(() => {
    const updateKeys = Object.keys(tipoUpdates);
    if (updateKeys.length === 0) return tipos;
    return tipos.map((t) => {
      const update = tipoUpdates[String(t.id)];
      return update ? { ...t, ...update } : t;
    });
  }, [tipos, tipoUpdates]);

  // Filtrar tipos baseado no searchTipos
  const filteredTipos = useMemo(() => {
    const searchLower = searchTipos.trim().toLowerCase();
    if (!searchLower) return tiposEfetivos;
    return tiposEfetivos.filter((tipo) => {
      return (
        tipo.nome?.toLowerCase().includes(searchLower) ||
        tipo.codigo?.toLowerCase().includes(searchLower) ||
        tipo.categoria?.toLowerCase().includes(searchLower)
      );
    });
  }, [searchTipos, tiposEfetivos]);

  const handleNew = () => {
    setEditingQualificacao(null);
    setShowModal(true);
  };

  const handleEdit = (qualificacao: HistoricoItem) => {
    console.log('🔧 [handleEdit] CHAMADO! Qualificacao:', qualificacao);
    console.log('🔧 [handleEdit] modalEditarAberto antes:', modalEditarAberto);
    console.log('🔧 [handleEdit] registroSelecionado antes:', registroSelecionado);

    logger.info('[handleEdit] Abrindo modal EDITAR para:', qualificacao);
    setRegistroSelecionado(qualificacao);
    setModalEditarAberto(true);

    console.log('🔧 [handleEdit] States atualizados - modal deve abrir agora');
  };

  // Form de edição herdado substituído pelo ModalAtribuirQualificacao
  // Shape usada para mapear histórico -> habilitação esperada pelo modal novo
  interface HabilitacaoShape {
    id?: number;
    funcionario_id?: number;
    qualificacao_id?: number;
    qualificacao_codigo?: string;
    qualificacao_nome?: string;
    data_conclusao?: string;
    data_vencimento?: string;
    numero_certificado?: string;
    instrutor?: string;
    observacoes?: string;
    tipo_treinamento?: string;
  }

  const handleRenovar = (row: HistoricoItem) => {
    // Abrir modal de renovação com os campos esperados
    setQualificacaoParaRenovar(row);
    setShowRenovarModal(true);
  };

  // Destacar qualificações planejadas com data já ultrapassada
  const isPlanejadaVencida = (item: HistoricoItem): boolean => {
    const status = String(
      (item as HistoricoItem & { qualificacao_status?: string }).qualificacao_status || '',
    ).toUpperCase();
    if (status !== 'PLANEJADA') return false;
    const dataRef =
      (item as HistoricoItem & { data_realizacao?: string; data_conclusao?: string })
        .data_realizacao || item.data_conclusao;
    const data = parseDateLocal(dataRef);
    if (!data) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return data < hoje;
  };

  // Ícone inline replace do modal — operador vê a linha colorida + ícone na tabela, não modal interruptivo

  // ModalRenovarQualificacao cuidará do POST e do loading; aqui apenas controlamos abertura/fechamento

  const handleDeletear = (row: HistoricoItem) => {
    setShowConfirmDelete({
      id: row.id,
      nome: `${row.funcionario_nome} - ${row.qualificacao_nome || row.qualificacao_codigo}`,
    });
  };

  const handleConfirmDelete = async () => {
    const item = showConfirmDelete;
    if (item?.id && item.id > 0) {
      setDeletandoId(item.id);
    }

    try {
      const deletou = await handleConfirmDeleteMutation(item);
      if (deletou) {
        setShowConfirmDelete(null);
      }
      return deletou;
    } finally {
      setDeletandoId(null);
    }
  };

  // Definir colunas da tabela de histórico (limpas e corrigidas)
  const formatDateInputValue = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateLabel = (value?: string | null): string => {
    if (!value) return 'Data a definir';
    const parsed = parseDateLocal(value);
    if (!parsed) return value;
    return parsed.toLocaleDateString('pt-BR');
  };

  const getDataMinimaPlanejada = (): string => {
    const amanha = new Date();
    amanha.setHours(0, 0, 0, 0);
    amanha.setDate(amanha.getDate() + 1);
    return formatDateInputValue(amanha);
  };

  const sugerirNovaDataPlanejada = (item?: HistoricoItem | null): string => {
    const dataBase = parseDateLocal(
      (item as HistoricoItem & { data_realizacao?: string })?.data_realizacao ||
        item?.data_conclusao,
    );
    const sugerida = dataBase ?? new Date();
    sugerida.setHours(0, 0, 0, 0);
    sugerida.setDate(sugerida.getDate() + 1);

    const minima = parseDateLocal(getDataMinimaPlanejada());
    if (minima && sugerida < minima) {
      return formatDateInputValue(minima);
    }

    return formatDateInputValue(sugerida);
  };

  const recarregarHistoricoEStats = useCallback(async () => {
    await carregarHistorico();

    const statsResponse = await fetchWithAuth(
      `${API_BASE_URL}/dashboard/qualificacoes?t=${Date.now()}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
    );

    if (!statsResponse.ok) {
      throw new Error('Erro ao carregar stats');
    }

    const json = await statsResponse.json();
    const data = json.data || json;
    setDashboardStats({
      total: data.total_ativas || 0,
      validas: data.validas || 0,
      vencendo: data.a_vencer_30_dias || 0,
      vencidas: data.vencidas || 0,
      renovadas: data.renovadas || 0,
      planejadas: data.planejadas || 0,
    });
  }, [carregarHistorico]);

  const {
    handleConfirmar: handleConfirmarMutation,
    handleCancelar: handleCancelarMutation,
    handleReagendarPlanejada: handleReagendarPlanejadaMutation,
    handleConfirmDeleteMutation,
  } = useQualificacoesMutations({
    API_BASE_URL,
    fetchWithAuth,
    showToast,
    emitirEventoModulo,
    recarregarHistoricoEStats,
  });

  const handleConfirmar = async (
    row: HistoricoItem,
    renovarAnterior = true,
    pedirConfirmacao = true,
  ) => {
    if (
      pedirConfirmacao &&
      !(await confirmDialog('Confirmar que esta qualificação foi realizada conforme planejado?'))
    ) {
      return false;
    }

    return handleConfirmarMutation(row, renovarAnterior);
  };

  const handleCancelar = async (row: HistoricoItem) => {
    if (
      !(await confirmDialog(
        'Cancelar esta qualificação planejada? Esta ação não pode ser desfeita.',
      ))
    ) {
      return false;
    }

    return handleCancelarMutation(row);
  };

  const handleReagendarPlanejada = async (row: HistoricoItem, novaData: string) => {
    setSalvandoPlanejadaId(row.id);

    try {
      return await handleReagendarPlanejadaMutation(row, novaData);
    } finally {
      setSalvandoPlanejadaId(null);
    }
  };

  const fecharModalPlanejada = () => {
    setShowPlanejadaModal(false);
    setPlanejadaSelecionada(null);
    setNovaDataPlanejada('');
  };

  const abrirModalPlanejada = (row: HistoricoItem) => {
    setPlanejadaSelecionada(row);
    setNovaDataPlanejada(sugerirNovaDataPlanejada(row));
    setShowPlanejadaModal(true);
  };

  const getTurmasPlanejadasDisponiveis = useCallback(
    (item: HistoricoItem): TreinamentoPlanejado[] => {
      const normalizeText = (value?: string | null) =>
        (value ?? '')
          .toString()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toUpperCase();
      const normalizeCode = (value?: string | null) =>
        (value ?? '').toString().trim().toUpperCase();
      const isSameDate = (left?: string | null, right?: string | null) =>
        String(left || '').slice(0, 10) === String(right || '').slice(0, 10);

      const qualificacaoId = Number(item.qualificacao_id || 0);
      const qualificacaoCodigo = normalizeCode(item.qualificacao_codigo || item.codigo || '');
      const qualificacaoNome = normalizeText(item.qualificacao_nome || '');
      const funcionarioId = Number(item.funcionario_id || 0);
      const dataPlanejadaItem =
        (item as HistoricoItem & { data_realizacao?: string }).data_realizacao ||
        item.data_conclusao ||
        null;

      return (treinamentosPlanejadosConvocacaoQuery.data?.items || [])
        .filter((treinamento) => {
          const statusTreinamento = normalizeText(treinamento.status);
          if (statusTreinamento !== 'PLANEJADO') return false;
          if (
            !treinamento.participantes.some(
              (participante) => Number(participante.funcionario_id) === funcionarioId,
            )
          ) {
            return false;
          }

          if (qualificacaoId > 0 && Number(treinamento.qualificacao_tipo_id) === qualificacaoId) {
            return true;
          }

          const treinamentoCodigo = normalizeCode(treinamento.qualificacao_codigo || '');
          if (qualificacaoCodigo && treinamentoCodigo === qualificacaoCodigo) {
            return true;
          }

          const treinamentoNome = normalizeText(
            treinamento.qualificacao_nome || treinamento.titulo || '',
          );
          if (
            qualificacaoNome &&
            treinamentoNome &&
            (treinamentoNome.includes(qualificacaoNome) ||
              qualificacaoNome.includes(treinamentoNome))
          ) {
            return true;
          }

          if (isSameDate(treinamento.data_prevista, dataPlanejadaItem)) {
            return true;
          }

          return false;
        })
        .sort((left, right) => {
          const leftKey = `${left.data_prevista} ${left.hora_inicio || '99:99'}`;
          const rightKey = `${right.data_prevista} ${right.hora_inicio || '99:99'}`;
          return leftKey.localeCompare(rightKey);
        });
    },
    [treinamentosPlanejadosConvocacaoQuery.data?.items],
  );

  const turmasPlanejadasDisponiveis = useMemo(
    () =>
      planejadaConvocacaoSelecionada
        ? getTurmasPlanejadasDisponiveis(planejadaConvocacaoSelecionada)
        : [],
    [getTurmasPlanejadasDisponiveis, planejadaConvocacaoSelecionada],
  );

  const carregarGestoresCcDisponiveis = useCallback(async () => {
    setCarregandoGestoresCc(true);
    try {
      const token = getAccessToken();
      const response = await apiFetch('/api/notificacoes/convocacoes/gestores', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: Array<{
          id: number;
          nome: string;
          email: string;
          cargo?: string | null;
          empresa?: string | null;
          ativo: boolean;
        }>;
      };

      if (!response.ok || !json.success) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }

      const gestoresAtivos = (json.data || []).filter((gestor) => gestor.ativo);
      setGestoresCcDisponiveis(gestoresAtivos);
      setGestoresCcSelecionadosIds(gestoresAtivos.map((gestor) => gestor.id));
    } catch (error) {
      setGestoresCcDisponiveis([]);
      setGestoresCcSelecionadosIds([]);
      showToast.error(error instanceof Error ? error.message : 'Falha ao carregar gestores em CC.');
    } finally {
      setCarregandoGestoresCc(false);
    }
  }, []);

  const fecharModalConvocacaoPlanejada = useCallback(() => {
    setShowConvocacaoPlanejadaModal(false);
    setPlanejadaConvocacaoSelecionada(null);
    setTurmaConvocacaoSelecionadaId(null);
    setConvocacaoPlanejadaPreview(null);
    setConfirmarReenvioConvocacaoPlanejada(false);
    setIgnorarSemEmailConvocacaoPlanejada(false);
    setEscopoEnvioConvocacaoPlanejada('turma');
    setGestoresCcDisponiveis([]);
    setGestoresCcSelecionadosIds([]);
  }, []);

  const abrirModalConvocacaoPlanejada = useCallback(
    (item: HistoricoItem) => {
      const turmas = getTurmasPlanejadasDisponiveis(item);
      setPlanejadaConvocacaoSelecionada(item);
      setTurmaConvocacaoSelecionadaId(turmas[0]?.id || null);
      setConvocacaoPlanejadaPreview(null);
      setConfirmarReenvioConvocacaoPlanejada(false);
      setIgnorarSemEmailConvocacaoPlanejada(false);
      setEscopoEnvioConvocacaoPlanejada('turma');
      setShowConvocacaoPlanejadaModal(true);
      void carregarGestoresCcDisponiveis();
    },
    [carregarGestoresCcDisponiveis, getTurmasPlanejadasDisponiveis],
  );

  const prepararConvocacaoPlanejada = useCallback(async () => {
    if (!turmaConvocacaoSelecionadaId) {
      showToast.error('Selecione uma turma planejada para convocação.');
      return;
    }

    try {
      const preview = await previewConvocacaoPlanejada.mutateAsync({
        id: turmaConvocacaoSelecionadaId,
        gestores_cc_ids: gestoresCcSelecionadosIds,
      });
      setConvocacaoPlanejadaPreview(preview);
      setConfirmarReenvioConvocacaoPlanejada(Boolean(preview.ultima_convocacao_em));
      setIgnorarSemEmailConvocacaoPlanejada(false);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao preparar convocação.');
    }
  }, [gestoresCcSelecionadosIds, previewConvocacaoPlanejada, turmaConvocacaoSelecionadaId]);

  const confirmarConvocacaoPlanejada = useCallback(async () => {
    if (!turmaConvocacaoSelecionadaId || !convocacaoPlanejadaPreview) return;

    try {
      if (escopoEnvioConvocacaoPlanejada === 'funcionario' && planejadaConvocacaoSelecionada) {
        await reenviarConvocacaoPlanejada.mutateAsync({
          id: turmaConvocacaoSelecionadaId,
          funcionario_id: Number(planejadaConvocacaoSelecionada.funcionario_id),
          gestores_cc_ids: gestoresCcSelecionadosIds,
        });
        showToast.success('Convocação enviada apenas para o funcionário selecionado.');
      } else {
        await enviarConvocacaoPlanejada.mutateAsync({
          id: turmaConvocacaoSelecionadaId,
          force_resend: confirmarReenvioConvocacaoPlanejada,
          skip_missing_email: ignorarSemEmailConvocacaoPlanejada,
          gestores_cc_ids: gestoresCcSelecionadosIds,
        });
        showToast.success('Convocação enviada para toda a turma selecionada.');
      }
      fecharModalConvocacaoPlanejada();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao enviar convocação.');
    }
  }, [
    convocacaoPlanejadaPreview,
    escopoEnvioConvocacaoPlanejada,
    confirmarReenvioConvocacaoPlanejada,
    enviarConvocacaoPlanejada,
    fecharModalConvocacaoPlanejada,
    ignorarSemEmailConvocacaoPlanejada,
    planejadaConvocacaoSelecionada,
    reenviarConvocacaoPlanejada,
    gestoresCcSelecionadosIds,
    turmaConvocacaoSelecionadaId,
  ]);

  const participanteConvocacaoSelecionado = useMemo(() => {
    if (!convocacaoPlanejadaPreview || !planejadaConvocacaoSelecionada) return null;
    const funcionarioId = Number(planejadaConvocacaoSelecionada.funcionario_id || 0);
    return (
      convocacaoPlanejadaPreview.participantes.find(
        (item) => item.funcionario_id === funcionarioId,
      ) || null
    );
  }, [convocacaoPlanejadaPreview, planejadaConvocacaoSelecionada]);

  const enviarConvocacaoPlanejadaFallback = useCallback(async () => {
    if (!planejadaConvocacaoSelecionada) return;

    const dataPlanejada =
      (
        planejadaConvocacaoSelecionada as HistoricoItem & {
          data_realizacao?: string;
        }
      ).data_realizacao || planejadaConvocacaoSelecionada.data_conclusao;

    if (!dataPlanejada) {
      showToast.error('Data planejada não encontrada para montar a turma.');
      return;
    }

    const normalize = (value?: string | null) =>
      String(value || '')
        .trim()
        .toUpperCase();
    const dataRef = String(dataPlanejada).slice(0, 10);
    const codigoRef = normalize(
      planejadaConvocacaoSelecionada.qualificacao_codigo || planejadaConvocacaoSelecionada.codigo,
    );
    const nomeRef = normalize(
      planejadaConvocacaoSelecionada.qualificacao_nome || planejadaConvocacaoSelecionada.tipo_nome,
    );

    const turmaFuncionarioIds = Array.from(
      new Set(
        planejadosHistorico
          .filter((item) => {
            const itemData = String(
              (
                item as HistoricoItem & {
                  data_realizacao?: string;
                }
              ).data_realizacao ||
                item.data_conclusao ||
                '',
            ).slice(0, 10);
            if (itemData !== dataRef) return false;

            const itemCodigo = normalize(item.qualificacao_codigo || item.codigo);
            const itemNome = normalize(item.qualificacao_nome || item.tipo_nome);

            const codigoMatch = Boolean(codigoRef && itemCodigo && codigoRef === itemCodigo);
            const nomeMatch = Boolean(nomeRef && itemNome && nomeRef === itemNome);

            if (codigoRef || nomeRef) return codigoMatch || nomeMatch;
            return true;
          })
          .map((item) => Number(item.funcionario_id || 0))
          .filter((id) => id > 0),
      ),
    );

    const funcionarioSelecionadoId = Number(planejadaConvocacaoSelecionada.funcionario_id || 0);
    if (turmaFuncionarioIds.length === 0 && funcionarioSelecionadoId > 0) {
      turmaFuncionarioIds.push(funcionarioSelecionadoId);
    }

    if (turmaFuncionarioIds.length === 0) {
      showToast.error('Não foi possível identificar os participantes da turma planejada.');
      return;
    }

    setEnviandoConvocacaoPlanejadaFallback(true);
    try {
      const token = getAccessToken();
      const response = await apiFetch('/api/notificacoes/convocacoes/planejadas/enviar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          turma_funcionario_ids: turmaFuncionarioIds,
          qualificacao_nome:
            planejadaConvocacaoSelecionada.qualificacao_nome ||
            planejadaConvocacaoSelecionada.tipo_nome ||
            planejadaConvocacaoSelecionada.qualificacao_codigo ||
            planejadaConvocacaoSelecionada.codigo ||
            undefined,
          qualificacao_id: Number(planejadaConvocacaoSelecionada.qualificacao_id || 0) || undefined,
          qualificacao_codigo:
            planejadaConvocacaoSelecionada.qualificacao_codigo ||
            planejadaConvocacaoSelecionada.codigo ||
            undefined,
          data_planejada: dataRef,
          funcionario_id:
            escopoEnvioConvocacaoPlanejada === 'funcionario' ? funcionarioSelecionadoId : undefined,
          escopo: escopoEnvioConvocacaoPlanejada,
          gestores_cc_ids: gestoresCcSelecionadosIds,
          instrutor: (planejadaConvocacaoSelecionada as HistoricoItem).instrutor || undefined,
          local: (() => {
            const obs = String((planejadaConvocacaoSelecionada as HistoricoItem).observacoes || '');
            const m = obs.match(/Local:\s*([^|]+)/i);
            return m ? m[1].trim() : undefined;
          })(),
          horario: (() => {
            const obs = String((planejadaConvocacaoSelecionada as HistoricoItem).observacoes || '');
            const m = obs.match(/Horario:\s*([^|]+)/i);
            return m ? m[1].trim() : undefined;
          })(),
        }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          enviados?: number;
          falhas?: number;
        };
      };

      if (!response.ok || !json.success) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }

      const enviados = Number(json.data?.enviados || 0);
      const falhas = Number(json.data?.falhas || 0);
      showToast.success(
        falhas > 0
          ? `Convocação enviada (${enviados} sucesso, ${falhas} falha).`
          : `Convocação enviada com sucesso para ${enviados} participante(s).`,
      );
      fecharModalConvocacaoPlanejada();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao enviar convocação.');
    } finally {
      setEnviandoConvocacaoPlanejadaFallback(false);
    }
  }, [
    escopoEnvioConvocacaoPlanejada,
    fecharModalConvocacaoPlanejada,
    gestoresCcSelecionadosIds,
    planejadaConvocacaoSelecionada,
    planejadosHistorico,
  ]);

  const historicoColumns = useMemo<Column<HistoricoItem>[]>(
    () => [
      {
        id: 'acoes',
        label: 'Ações',
        accessor: (row) => row.id,
        sortable: false,
        visible: true,
        width: '200px',
        minWidth: '200px',
        render: (value, row) => {
          const item = row as HistoricoItem & {
            qualificacao_status?: string;
            data_realizacao?: string;
            data_conclusao?: string;
            categoria?: string;
            qualificacao_categoria?: string;
            data_vencimento?: string;
          };
          const status = item.qualificacao_status || 'CONCLUIDA';
          const isPlanejada = status === 'PLANEJADA';
          const isCancelada = status === 'CANCELADA';

          // Verificar se a data planejada já passou (para mostrar botão de confirmar)
          const dataRealizacao = item.data_realizacao || item.data_conclusao;
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const dataPlanejada = parseDateLocal(dataRealizacao);
          const dataPlanejadaPassou = Boolean(dataPlanejada && dataPlanejada <= hoje);

          // Verificar se é EAD ou CMA vencido ou vencendo
          const categoria = (item.categoria || item.qualificacao_categoria || '').toUpperCase();
          const nomeQualificacao = (item.qualificacao_nome || '').toUpperCase();
          const isCMA =
            categoria === 'CMA' ||
            categoria === 'EXAME' ||
            nomeQualificacao.includes('MÉDICO') ||
            nomeQualificacao.includes('MEDICO');
          const isEAD = categoria === 'EAD' || categoria === 'TREINAMENTO EAD';
          const isEADouCMA = isEAD || isCMA;

          const statusHistorico = getHistoricoStatus(item);
          const isVencida = statusHistorico === 'VENCIDA';
          const isVencendo = statusHistorico === 'VENCENDO_30';
          const mostrarAlertaEAD =
            isEADouCMA && (isVencida || isVencendo) && !isPlanejada && !isCancelada;

          const destructiveRowActions: RowAction[] = isPlanejada
            ? [
                {
                  label: 'Excluir qualificação planejada',
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => handleCancelar(item),
                },
              ]
            : [
                {
                  label: 'Deletar qualificação',
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => handleDeletear(item),
                },
              ];

          return (
            <div className="flex items-center gap-1">
              {!isCancelada && (
                <button
                  type="button"
                  onClick={() => handleEdit(item)}
                  title="Editar qualificação"
                  className={historicoActionButtonClass}
                >
                  <Edit2 className="w-4 h-4 text-indigo-600" />
                </button>
              )}

              {!isPlanejada && !isCancelada && (
                <button
                  type="button"
                  onClick={() => handleRenovar(item)}
                  title="Renovar qualificação"
                  className={historicoActionButtonClass}
                >
                  <RefreshCw className="w-4 h-4 text-violet-600" />
                </button>
              )}

              {isPlanejada && dataPlanejadaPassou && (
                <button
                  type="button"
                  onClick={() => abrirModalPlanejada(item)}
                  title="Informar se o treinamento planejado foi realizado"
                  className={`${historicoActionButtonClass} animate-pulse`}
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-500" />
                </button>
              )}

              {isPlanejada && !dataPlanejadaPassou && (
                <button
                  type="button"
                  onClick={() => abrirModalPlanejada(item)}
                  title="Reagendar qualificação planejada"
                  className={historicoActionButtonClass}
                >
                  <RotateCcw className="w-4 h-4 text-sky-600" />
                </button>
              )}

              {isPlanejada && (
                <button
                  type="button"
                  onClick={() => abrirModalConvocacaoPlanejada(item)}
                  title="Selecionar turma planejada para enviar convocação"
                  className={historicoActionButtonClass}
                >
                  <Mail className="w-4 h-4 text-emerald-600" />
                </button>
              )}

              {!isCancelada && !isPlanejada && (
                <button
                  type="button"
                  onClick={async () => {
                    setHistoricoSelecionado(item);
                    setShowCertModal(true);
                  }}
                  title={
                    hasArchivedCertificate(item)
                      ? 'Certificado arquivado ✓'
                      : 'Clique para gerenciar certificado'
                  }
                  className={historicoActionButtonClass}
                >
                  <Award
                    className={`w-4 h-4 ${hasArchivedCertificate(item) ? 'text-emerald-600' : 'text-slate-500'}`}
                  />
                </button>
              )}

              {mostrarAlertaEAD && (
                <button
                  type="button"
                  onClick={async () => {
                    setAlertaEADModal({
                      isOpen: true,
                      qualificacao: item,
                    });
                  }}
                  title="Enviar alerta de treinamento vencido"
                  className={historicoActionButtonClass}
                >
                  <BellRing className="w-4 h-4 text-amber-500" />
                </button>
              )}

              <RowActionsMenu actions={destructiveRowActions} label="Mais ações" />
            </div>
          );
        },
      },
      {
        id: 'status',
        label: 'Status',
        accessor: (row) => row.status,
        sortable: true,
        visible: true,
        width: '115px',
        render: (value, row) => {
          const item = row as HistoricoItem & { qualificacao_status?: string };

          // Priorizar qualificacao_status do banco (PLANEJADA, CONCLUIDA, CANCELADA)
          const qualificacaoStatus = item.qualificacao_status?.toUpperCase();

          // Se é PLANEJADA ou CANCELADA, usar diretamente
          if (qualificacaoStatus === 'PLANEJADA' || qualificacaoStatus === 'CANCELADA') {
            return <QualificacaoStatusBadge status={qualificacaoStatus} />;
          }

          // Para CONCLUIDA, usar a lógica de status derivado (VALIDA, VENCIDA, etc.)
          const statusHistorico = getHistoricoStatus(item);
          const ehRenovada = statusHistorico === 'RENOVADA';
          const status = statusHistorico;
          return (
            <div className="flex flex-col items-start gap-1">
              <QualificacaoStatusBadge status={status} isRenovada={ehRenovada} />
            </div>
          );
        },
      },
      {
        id: 'funcionario',
        label: 'Funcionário',
        accessor: (row) => row.funcionario_nome,
        sortable: true,
        visible: true,
        width: '200px',
        render: (value, row) => {
          const nome = String(value ?? '');
          return (
            <div className="flex min-w-0 flex-col">
              <FuncionarioLink
                funcionarioId={row.funcionario_id}
                nome={nome}
                className="line-clamp-2 whitespace-normal break-words text-sm font-normal text-slate-900"
              />
              {row.funcionario_codigo_anac && (
                <span
                  className="line-clamp-1 whitespace-normal break-words text-xs font-normal text-slate-500"
                  title="Código CANAC"
                >
                  CANAC: {row.funcionario_codigo_anac}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'qualificacao',
        label: 'Qualificação',
        accessor: (row) =>
          row.qualificacao_nome || row.qualificacao_desc || row.qualificacao_codigo || '-',
        sortable: true,
        visible: true,
        width: '250px',
        render: (value) => (
          <span className="line-clamp-2 whitespace-normal break-words text-sm font-normal text-slate-900">
            {String(value ?? '')}
          </span>
        ),
      },
      {
        id: 'tipo_treinamento',
        label: 'Modalidade',
        accessor: (row) => {
          return getTipoTreinamentoDisplay(
            (row as { tipo_treinamento?: string | null }).tipo_treinamento || null,
            Number(
              (row as { validade_meses?: number | null; qualificacao_validade?: number | null })
                .validade_meses ??
                (row as { qualificacao_validade?: number | null }).qualificacao_validade ??
                0,
            ),
          ).value;
        },
        sortable: true,
        visible: true,
        width: '105px',
        render: (value) => {
          const display = getTipoTreinamentoDisplay(String(value || ''));
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${display.className}`}
            >
              {display.label}
            </span>
          );
        },
      },
      {
        id: 'codigo',
        label: 'Código',
        accessor: (row) =>
          (row as HistoricoItem & { codigo_legacy?: string }).qualificacao_codigo ||
          (row as HistoricoItem & { codigo_legacy?: string }).codigo ||
          (row as HistoricoItem & { codigo_legacy?: string }).codigo_legacy ||
          '-',
        sortable: true,
        visible: true,
        width: '90px',
        render: (value, row) => {
          const r = row as HistoricoItem & { codigo_legacy?: string };
          const display =
            String(value || r.qualificacao_codigo || r.codigo || r.codigo_legacy || '-') || '-';
          return <span className="text-sm font-normal text-slate-900">{display}</span>;
        },
      },
      {
        id: 'aeronave',
        label: 'Equipamento',
        accessor: (row) => (row as any).modelo_aeronave || '-',
        sortable: true,
        visible: true,
        width: '115px',
        render: (value) => (
          <span className="text-sm font-normal text-slate-900">{String(value ?? '-')}</span>
        ),
      },
      {
        id: 'categoria',
        label: 'Categoria',
        accessor: (row) => row.qualificacao_categoria || row.categoria || '-',
        sortable: true,
        visible: true,
        width: '145px',
        render: (value, row) => {
          const categoriaName = String(value ?? '');
          const corDireta = (row as any).categoria_cor;
          const categoriaByName = !corDireta
            ? categoriasMap.get(normalizeCategoriaKey(categoriaName))
            : undefined;
          const categoriaById =
            !corDireta && (row as { categoria_id?: number }).categoria_id
              ? categorias.find((c) => c.id === (row as { categoria_id?: number }).categoria_id)
              : undefined;

          const corFinal = getCategoriaCorDisplay(
            categoriaName,
            corDireta || categoriaByName?.cor || categoriaById?.cor,
          );
          const appearance = resolveClassificationTagAppearance({
            variant: 'category',
            label: categoriaName,
            color: corFinal ?? null,
          });

          return (
            <span
              key={`cat-${(row as any).id}-${value}-${corFinal || 'default'}`}
              className={appearance.className}
              style={appearance.style}
            >
              {categoriaName}
            </span>
          );
        },
      },
      {
        id: 'realizado',
        label: 'Realizado',
        accessor: (row) => {
          const d = row.data_realizacao || row.data_conclusao || row.data_emissao;
          return d ? parseDateLocal(d) : '';
        },
        sortable: true,
        visible: true,
        width: '135px',
        render: (value, row) => {
          if (!value || value === '-')
            return <span className="text-sm font-normal text-slate-400">-</span>;
          const data = value as Date;
          const qualificacaoStatus = String(
            (row as unknown as { qualificacao_status?: string | null }).qualificacao_status || '',
          ).toUpperCase();
          const isPlanejada = qualificacaoStatus === 'PLANEJADA';
          const validadeMeses =
            (
              row as unknown as {
                validade_meses?: number;
                validade?: number;
                qualificacao_validade?: number;
              }
            ).validade_meses ??
            (
              row as unknown as {
                validade_meses?: number;
                validade?: number;
                qualificacao_validade?: number;
              }
            ).validade ??
            (
              row as unknown as {
                validade_meses?: number;
                validade?: number;
                qualificacao_validade?: number;
              }
            ).qualificacao_validade ??
            null;
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-900">
                {data.toLocaleDateString('pt-BR')}
              </span>
              <span className="text-xs font-normal text-slate-500">
                {isPlanejada
                  ? 'Data planejada'
                  : validadeMeses
                    ? `Valid. ${validadeMeses} meses.`
                    : 'Valid. -'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'vencimento',
        label: 'Vencimento',
        accessor: (row) => {
          const d = row.data_vencimento || row.data_validade;
          return d ? parseDateLocal(d) : '';
        },
        sortable: true,
        visible: true,
        width: '155px',
        render: (value, row) => {
          const item = row as HistoricoItem & { qualificacao_status?: string };
          const rawStatus = String(item.qualificacao_status || item.status || '').toUpperCase();
          if (!value || value === '-') {
            if (rawStatus === 'CONCLUIDA' || rawStatus === 'CONCLUIDO') {
              return <span className="text-sm font-medium text-emerald-700">Sem vencimento</span>;
            }
            return <span className="text-sm font-normal text-slate-400">-</span>;
          }
          const dataVenc = value as Date;
          const hoje = new Date();
          const diasRestantes = Math.floor(
            (dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
          );
          const planejadaRelacionada = getPlanejadaRelacionada(row as HistoricoItem);
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-900">
                {dataVenc.toLocaleDateString('pt-BR')}
              </span>
              {diasRestantes >= 0 ? (
                <span className="text-xs font-normal text-slate-500">
                  {diasRestantes === 0 ? 'Hoje' : `${diasRestantes} dias`}
                </span>
              ) : (
                // Mostrar "vencida há xxx dias" APENAS se NÃO for renovada
                getHistoricoStatus(row as HistoricoItem) !== 'RENOVADA' && (
                  <>
                    <span className="text-xs font-medium text-danger-600">
                      Vencida há {Math.abs(diasRestantes)} dias
                    </span>
                    {planejadaRelacionada && (
                      <span className="text-[11px] font-medium text-purple-600">Já planejada</span>
                    )}
                  </>
                )
              )}
            </div>
          );
        },
      },
    ],
    [
      abrirModalConvocacaoPlanejada,
      abrirModalPlanejada,
      categorias,
      categoriasMap,
      getCategoriaCorDisplay,
      getHistoricoStatus,
      getStatusColor,
      getStatusDotColor,
      getStatusLabel,
      getPlanejadaRelacionada,
      handleCancelar,
      handleDeletear,
      handleEdit,
      handleRenovar,
      hasArchivedCertificate,
      normalizeCategoriaKey,
      parseDateLocal,
    ],
  );

  return (
    <AppLayout>
      {/* Page Header */}
      <PageHeader
        className="mb-8"
        title="Qualificações e Treinamentos"
        subtitle="Gerencie qualificações, certificações e treinamentos dos funcionários."
        actions={
          <>
            <button
              onClick={handleNew}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Incluir Qualificação
            </button>
          </>
        }
      />

      {/* Main content container */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Tab bar */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          {/* Row 1: Tabs + primary action button */}
          <div className="flex items-center justify-between px-4 pt-2">
            <div
              role="tablist"
              aria-label="Seções de qualificações"
              className="flex min-w-0 items-center"
            >
              <button
                role="tab"
                aria-selected={activeTab === 'historico'}
                onClick={() => setActiveTab('historico')}
                className={`flex items-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                  activeTab === 'historico'
                    ? 'border-primary text-blue-600 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <History size={15} aria-hidden="true" />
                Histórico
              </button>
              <button
                role="tab"
                aria-selected={isPlanejadosTab}
                onClick={() => setActiveTab('planejados')}
                className={`flex items-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                  isPlanejadosTab
                    ? 'border-primary text-blue-600 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <CalendarDays size={15} aria-hidden="true" />
                Planejados
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'tipos'}
                onClick={() => setActiveTab('tipos')}
                className={`flex items-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                  activeTab === 'tipos'
                    ? 'border-primary text-blue-600 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Bookmark size={15} aria-hidden="true" />
                Modelos
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'categorias'}
                onClick={() => setActiveTab('categorias')}
                className={`flex items-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                  activeTab === 'categorias'
                    ? 'border-primary text-blue-600 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <FolderOpen size={15} aria-hidden="true" />
                Classificações
              </button>
            </div>
            {/* Primary action button — right side of tab bar */}
            {activeTab === 'tipos' && canManageTipos && (
              <button
                onClick={async () => {
                  setEditingTipo({
                    id: '',
                    nome: '',
                    codigo: '',
                    tipo: null,
                    categoria: '',
                    validade: null,
                    observacoes: null,
                    ativo: 1,
                    descricao: null,
                    conteudo_programatico: null,
                    carga_horaria: null,
                    carga_horaria_inicial: null,
                    carga_horaria_recorrente: null,
                    vencimento_fim_mes: 0,
                    is_check: 0,
                    setores: [],
                    setor_ids: modelosPrefs.setorFilter.map((value) => Number(value)),
                  });
                  setShowTipoModal(true);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Novo Modelo
              </button>
            )}
            {isPlanejadosTab && plannedView !== 'turmas' && (
              <button
                onClick={() => {
                  setPlannedView('turmas');
                  setAutoOpenTurmasModal(true);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Nova turma
              </button>
            )}
            {activeTab === 'categorias' && (
              <button
                onClick={async () => {
                  setEditingCategoria(null);
                  setNovaCategoriaNome('');
                  setNovaCategoriaDesc('');
                  setShowCategoriaModal(true);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Nova Categoria
              </button>
            )}
          </div>

          {/* Row 2: Search + filters bar */}
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5">
            {(usesHistoricoDataset || activeTab === 'tipos') && (
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder={
                    activeTab === 'tipos'
                      ? 'Buscar modelos...'
                      : 'Buscar por nome, código, qualificação...'
                  }
                  value={activeTab === 'tipos' ? searchTipos : searchTerm}
                  onChange={(e) =>
                    activeTab === 'tipos'
                      ? setSearchTipos(e.target.value)
                      : setSearchTerm(e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-1.5 text-sm focus:border-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                />
              </div>
            )}
            {activeTab === 'tipos' && (
              <>
                <select
                  value={categoriaFilter}
                  onChange={(e) => setCategoriaFilter(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-600 focus:outline-none bg-white cursor-pointer"
                >
                  <option value="">Categoria</option>
                  {categorias
                    .slice()
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                    .map((cat) => (
                      <option
                        key={cat.id ?? cat.nome}
                        value={cat.id != null ? String(cat.id) : cat.nome}
                      >
                        {cat.nome}
                      </option>
                    ))}
                </select>
                {setoresTipos.length === 1 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                    {setoresTipos[0].nome}
                  </div>
                ) : (
                  <MultiSelect
                    options={setorOptionsTipos}
                    selected={modelosPrefs.setorFilter}
                    onChange={(selected) =>
                      setModelosPrefs((prev) => ({ ...prev, setorFilter: selected }))
                    }
                    placeholder="Todos os setores"
                    allLabel="Todos os setores"
                    className="min-w-[220px]"
                  />
                )}
                {(searchTipos.trim() || modelosPrefs.setorFilter.length > 0 || categoriaFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTipos('');
                      setCategoriaFilter('');
                      setModelosPrefs((prev) => ({ ...prev, setorFilter: [] }));
                    }}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Limpar filtros
                  </button>
                )}
              </>
            )}
            {activeTab === 'categorias' && (
              <>
                {setoresTipos.length === 1 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                    {setoresTipos[0].nome}
                  </div>
                ) : setoresTipos.length > 1 ? (
                  <MultiSelect
                    options={setorOptionsTipos}
                    selected={categoriasSetorFilter}
                    onChange={setCategoriasSetorFilter}
                    placeholder="Todos os setores"
                    allLabel="Todos os setores"
                    className="min-w-[180px]"
                  />
                ) : null}
                {categoriasSetorFilter.length > 0 && setoresTipos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCategoriasSetorFilter([])}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Limpar filtro
                  </button>
                )}
              </>
            )}
            {usesHistoricoDataset && (
              <>
                <select
                  value={aeronaveFilter}
                  onChange={(e) => {
                    setAeronaveFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-600 focus:outline-none bg-white cursor-pointer"
                >
                  <option value="">Equipamento</option>
                  {aeronavesConfig.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.modelo || a.codigo || (a as { nome?: string }).nome || String(a.id)}
                    </option>
                  ))}
                </select>
                <select
                  value={categoriaFilter}
                  onChange={(e) => {
                    setCategoriaFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-600 focus:outline-none bg-white cursor-pointer"
                >
                  <option value="">Categoria</option>
                  {categorias
                    .slice()
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                    .map((cat) => (
                      <option key={cat.id ?? cat.nome} value={cat.nome}>
                        {cat.nome}
                      </option>
                    ))}
                </select>
                {setorOptionsHistorico.length === 1 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                    {setorOptionsHistorico[0].label}
                  </div>
                ) : setorOptionsHistorico.length > 1 ? (
                  <MultiSelect
                    options={setorOptionsHistorico}
                    selected={setorFilter}
                    onChange={(selected) => {
                      setSetorFilter(selected);
                      setPage(1);
                    }}
                    placeholder="Todos os setores"
                    allLabel="Todos os setores"
                    className="min-w-[180px]"
                  />
                ) : null}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    Status ({statusFiltro.size}/6)
                  </button>
                  {statusDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg border border-slate-200 shadow-lg p-3 min-w-[200px]">
                      <div className="text-xs font-medium text-slate-500 mb-2">Exibir status:</div>
                      {[
                        { key: 'VALIDA', label: 'Válidas', color: 'text-green-600' },
                        {
                          key: 'VENCENDO_30',
                          label: 'Vencendo (30 dias)',
                          color: 'text-amber-600',
                        },
                        { key: 'VENCIDA', label: 'Vencidas', color: 'text-red-600' },
                        { key: 'RENOVADA', label: 'Renovadas', color: 'text-blue-600' },
                        { key: 'PLANEJADA', label: 'Planejadas', color: 'text-purple-600' },
                        { key: 'CANCELADA', label: 'Canceladas', color: 'text-slate-500' },
                      ].map(({ key, label, color }) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 py-1 cursor-pointer select-none hover:bg-slate-50 px-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={statusFiltro.has(key)}
                            onChange={(e) => {
                              const s = new Set(statusFiltro);
                              e.target.checked ? s.add(key) : s.delete(key);
                              setStatusFiltro(s);
                            }}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                          <span className={`text-sm ${color}`}>{label}</span>
                        </label>
                      ))}
                      <div className="border-t border-slate-200 mt-2 pt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setStatusFiltro(
                              new Set([
                                'VALIDA',
                                'VENCIDA',
                                'VENCENDO_30',
                                'RENOVADA',
                                'PLANEJADA',
                                'CANCELADA',
                              ]),
                            )
                          }
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFiltro(new Set())}
                          className="text-xs text-slate-500 hover:underline"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {activeTab === 'historico' && (
              <button
                onClick={() => setColumnConfigOpen('historico')}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Columns2 className="w-3.5 h-3.5" /> Colunas
              </button>
            )}
          </div>

          {isHistoricoTab && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <button
                type="button"
                onClick={resetStatusFromChip}
                title="Limpar filtro rápido de status"
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <span>Total</span>
                <strong className="text-slate-700 dark:text-slate-200">
                  {loadingStats && !shouldUseLocalHistoricoHeaderStats
                    ? '...'
                    : historicoHeaderStats.total}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => applySingleStatusFromChip('VENCENDO_30')}
                title="Filtrar apenas vencendo"
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                  isOnlyStatusSelected('VENCENDO_30')
                    ? 'ring-2 ring-amber-300 bg-amber-100 text-amber-800'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300'
                }`}
              >
                <span>Vencendo</span>
                <strong>
                  {loadingStats && !shouldUseLocalHistoricoHeaderStats
                    ? '...'
                    : historicoHeaderStats.vencendo}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => applySingleStatusFromChip('VENCIDA')}
                title="Filtrar apenas vencidas"
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                  isOnlyStatusSelected('VENCIDA')
                    ? 'ring-2 ring-red-300 bg-red-100 text-red-800'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300'
                }`}
              >
                <span>Vencidas</span>
                <strong>
                  {loadingStats && !shouldUseLocalHistoricoHeaderStats
                    ? '...'
                    : historicoHeaderStats.vencidas}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => applySingleStatusFromChip('PLANEJADA')}
                title="Filtrar apenas planejadas"
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                  isOnlyStatusSelected('PLANEJADA')
                    ? 'ring-2 ring-purple-300 bg-purple-100 text-purple-800'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-300'
                }`}
              >
                <span>Planejadas</span>
                <strong>
                  {loadingStats && !shouldUseLocalHistoricoHeaderStats
                    ? '...'
                    : historicoHeaderStats.planejadas || 0}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => applySingleStatusFromChip('RENOVADA')}
                title="Filtrar apenas renovadas"
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
                  isOnlyStatusSelected('RENOVADA')
                    ? 'ring-2 ring-blue-300 bg-blue-100 text-blue-800'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300'
                }`}
              >
                <span>Renovadas</span>
                <strong>
                  {loadingStats && !shouldUseLocalHistoricoHeaderStats
                    ? '...'
                    : historicoHeaderStats.renovadas}
                </strong>
              </button>
            </div>
          )}

          {/* Planejados stats bar removed — Turmas tab handles scheduling separately */}
        </div>

        {/* Error Banners */}
        {usesHistoricoDataset && historicoError && (
          <div className="mx-4 mt-4 mb-2 rounded-md border border-danger-300 bg-danger-50 p-4 flex gap-3">
            <AlertCircle className="w-6 h-6 text-danger-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-danger-700 mb-1">
                Erro ao carregar histórico
              </p>
              <p className="text-xs text-danger-600 mb-3 break-all">{historicoError}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => carregarHistorico()}
                  className="inline-flex items-center gap-1 rounded-md bg-danger-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-danger-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1 rounded-md border border-danger-300 px-3 py-1.5 text-xs font-medium text-danger-700 hover:bg-danger-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Recarregar página
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'tipos' && tiposError && (
          <div className="mx-4 mt-4 mb-2 rounded-md border border-danger-300 bg-danger-50 p-4 flex gap-3">
            <AlertCircle className="w-6 h-6 text-danger-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-danger-700 mb-1">
                Erro ao carregar tipos de qualificação
              </p>
              <p className="text-xs text-danger-600 mb-3 break-all">{tiposError}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => refetchTipos()}
                  className="inline-flex items-center gap-1 rounded-md bg-danger-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-danger-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1 rounded-md border border-danger-300 px-3 py-1.5 text-xs font-medium text-danger-700 hover:bg-danger-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Recarregar página
                </button>
              </div>
            </div>
          </div>
        )}

        {isHistoricoTab && highlightedHistoricoId && (
          <div className="mx-4 mt-4 mb-2 rounded-md border border-sky-200 bg-sky-50 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-sky-800">
                Registro do histórico em foco: #{highlightedHistoricoId}
              </p>
              <p className="text-xs text-sky-700 mt-1">
                Os filtros de status foram ampliados para garantir que o registro vinculado pelo
                EdApp fique visível.
              </p>
            </div>
            <a
              href="/qualificacoes"
              className="inline-flex items-center gap-2 rounded-md border border-sky-300 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
            >
              Limpar foco
            </a>
          </div>
        )}

        {/* Content */}
        <div className="min-h-[300px]">
          {activeTab === 'historico' && (
            <DataTable
              key={`historico-page-${page}-limit-${limit}`}
              tableId="qualificacoes-historico"
              data={prioritizedHistorico}
              columns={historicoColumns}
              rowClassName={(row) => {
                const item = row as HistoricoItem;
                const classNames: string[] = [];

                if (item.id === highlightedHistoricoId) {
                  classNames.push('bg-sky-50 ring-1 ring-inset ring-sky-300');
                }

                if (isPlanejadaVencida(item)) {
                  classNames.push('bg-amber-50 border-l-4 border-amber-400');
                }

                return classNames.join(' ');
              }}
              loading={historicoTableLoading}
              // Column config control
              columnConfigOpen={columnConfigOpen === 'historico'}
              onColumnConfigOpenChange={(open) => setColumnConfigOpen(open ? 'historico' : null)}
              showInternalColumnConfigButton={false}
              // Ordenação server-side
              sortConfig={sortConfig}
              onSortChange={(newSortConfig) => {
                setSortConfig(newSortConfig);
                setPage(1); // Reset para página 1 ao ordenar
              }}
              // Paginação server-side com opções 50/100
              // Usa meta.total quando há busca, senão usa stats.total
              page={page}
              pageSize={limit}
              total={historicoMeta?.total ?? stats.total}
              onPageChange={(newPage) => setPage(newPage)}
              onPageSizeChange={(size) => {
                setLimit(size);
                setPage(1); // Reset para página 1 ao mudar tamanho
              }}
              pageSizeOptions={[50, 100]}
              emptyState={
                <QualificacaoEmptyState
                  icon={ShieldCheck}
                  title="Nenhuma qualificação encontrada"
                  description={
                    historicoTotal > 0 || (historico as HistoricoItem[]).length > 0
                      ? 'Os filtros atuais esconderam os registros carregados.'
                      : 'Comece adicionando a primeira qualificação ao sistema'
                  }
                  action={
                    historicoTotal > 0 || (historico as HistoricoItem[]).length > 0 ? (
                      <button
                        onClick={() =>
                          setStatusFiltro(
                            new Set([
                              'VALIDA',
                              'VENCIDA',
                              'VENCENDO_30',
                              'RENOVADA',
                              'PLANEJADA',
                              'CANCELADA',
                            ]),
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <ListFilter className="w-4 h-4" />
                        <span>Mostrar todos os status</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleNew}
                        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar Qualificação</span>
                      </button>
                    )
                  }
                />
              }
            />
          )}

          {activeTab === 'tipos' && (
            <>
              {loadingTipos ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <DataTable
                  tableId="qualificacoes-tipos"
                  data={filteredTipos}
                  columns={[
                    {
                      id: 'acoes',
                      label: 'Ações',
                      accessor: (row) => row.id,
                      sortable: false,
                      visible: true,
                      render: (value, row) => (
                        <div className="flex items-center gap-2">
                          {canManageTipos && (
                            <>
                              <button
                                onClick={async () => {
                                  setEditingTipo({
                                    id: row.id ?? String(row.nome || 'tipo'),
                                    nome: row.nome || '',
                                    codigo: row.codigo ?? null,
                                    tipo: (row as { tipo?: string | null }).tipo ?? null,
                                    categoria: row.categoria ?? null,
                                    categoria_id:
                                      (row as { categoria_id?: number | null }).categoria_id ??
                                      null,
                                    validade: row.validade ?? null,
                                    observacoes: row.observacoes ?? null,
                                    ativo: row.ativo ?? 1,
                                    descricao: row.descricao ?? null,
                                    conteudo_programatico:
                                      (row as { conteudo_programatico?: string | null })
                                        .conteudo_programatico ?? null,
                                    carga_horaria:
                                      (row as { carga_horaria?: number | null }).carga_horaria ??
                                      null,
                                    carga_horaria_inicial:
                                      (row as { carga_horaria_inicial?: number | null })
                                        .carga_horaria_inicial ?? null,
                                    carga_horaria_recorrente:
                                      (row as { carga_horaria_recorrente?: number | null })
                                        .carga_horaria_recorrente ?? null,
                                    vencimento_fim_mes: (row as any).vencimento_fim_mes ?? 0,
                                    is_check: (row as { is_check?: number | boolean | null })
                                      .is_check
                                      ? 1
                                      : 0,
                                    setores:
                                      (row as { setores?: Array<{ id: number; nome: string }> })
                                        .setores ?? [],
                                    setor_ids: (
                                      (row as { setores?: Array<{ id: number; nome: string }> })
                                        .setores ?? []
                                    ).map((setor) => Number(setor.id)),
                                    created_at: row.created_at,
                                    updated_at: row.updated_at ?? null,
                                  });
                                  setShowTipoModal(true);
                                }}
                                className={historicoActionButtonClass}
                                title="Editar modelo"
                              >
                                <Pencil className="w-4 h-4 text-indigo-600" />
                              </button>
                              <RowActionsMenu
                                label="Mais ações"
                                actions={[
                                  {
                                    label: 'Excluir modelo',
                                    icon: Trash2,
                                    destructive: true,
                                    onSelect: async () => {
                                      await safeDelete({
                                        url: `${API_BASE_URL}/qualificacoes/tipos`,
                                        id: row.id,
                                        itemName: row.nome || 'modelo',
                                        onSuccess: () => {
                                          showToast.success('Modelo deletado com sucesso!');
                                          refetchTipos();
                                        },
                                        onError: () => {
                                          showToast.error('Erro ao deletar modelo');
                                        },
                                      });
                                    },
                                  },
                                ]}
                              />
                            </>
                          )}
                        </div>
                      ),
                    },
                    {
                      id: 'nome',
                      label: 'Nome',
                      accessor: (row) => row.nome,
                      sortable: true,
                      visible: true,
                      render: (value) => (
                        <span className="text-sm font-medium text-slate-900">
                          {String(value ?? '')}
                        </span>
                      ),
                    },
                    {
                      id: 'status',
                      label: 'Status',
                      accessor: (row) =>
                        row.ativo === 1 || row.ativo === true ? 'ATIVO' : 'INATIVO',
                      sortable: true,
                      visible: true,
                      render: (value) => {
                        const isAtivo = value === 'ATIVO';
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              isAtivo
                                ? 'bg-success-600/10 text-success-600'
                                : 'bg-slate-500/10 text-slate-500'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isAtivo ? 'bg-success-600' : 'bg-slate-500'
                              }`}
                            />
                            {isAtivo ? 'Ativo' : 'Inativo'}
                          </span>
                        );
                      },
                    },
                    {
                      id: 'codigo',
                      label: 'Código',
                      accessor: (row) => row.codigo || '-',
                      sortable: true,
                      visible: true,
                      render: (value) => (
                        <span className="text-sm font-normal text-slate-600">
                          {String(value ?? '')}
                        </span>
                      ),
                    },
                    {
                      id: 'categoria',
                      label: 'Categoria',
                      accessor: (row) => row.categoria,
                      sortable: true,
                      visible: true,
                      render: (value, row) => {
                        // Procurar a categoria nas categorias carregadas para pegar a cor real
                        const categoria = categorias.find((c) => c.nome === value);
                        let corBg = '#f1f5f9';
                        let corText = '#64748b';

                        const categoriaCor = getCategoriaCorDisplay(
                          String(value ?? ''),
                          categoria?.cor,
                        );

                        if (categoriaCor) {
                          // Normalizar hex: #rgb -> #rrggbb
                          let hex = categoriaCor.replace('#', '');
                          if (hex.length === 3) {
                            hex = hex
                              .split('')
                              .map((c) => c + c)
                              .join('');
                          }
                          corBg = `#${hex}22`;
                          corText = `#${hex}`;
                        }

                        return (
                          <span
                            key={`tipo-cat-${(row as any).id}-${value}-${
                              categoriaCor || 'default'
                            }`}
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: corBg,
                              color: corText,
                            }}
                          >
                            {String(value ?? '')}
                          </span>
                        );
                      },
                    },
                    {
                      id: 'setores',
                      label: 'Setores',
                      accessor: (row) => row.setores || [],
                      sortable: false,
                      visible: true,
                      render: (value, row) => {
                        const setores = Array.isArray(value)
                          ? (value as Array<{ id: number; nome: string }>)
                          : [];

                        if (
                          setores.length === 0 ||
                          (row as { is_transversal?: boolean }).is_transversal
                        ) {
                          return (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              Transversal
                            </span>
                          );
                        }

                        if (setores.length === 1) {
                          return (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              {setores[0].nome}
                            </span>
                          );
                        }

                        return (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            {setores.length} setores
                          </span>
                        );
                      },
                    },
                    {
                      id: 'validade',
                      label: 'Valid.',
                      accessor: (row) => (row.validade != null ? row.validade : '-'),
                      sortable: true,
                      visible: true,
                      render: (value) => (
                        <span className="text-sm font-normal text-slate-600">
                          {value === '-' ? '-' : `${value} meses`}
                        </span>
                      ),
                    },
                    {
                      id: 'total_no_historico',
                      label: 'Registros',
                      accessor: (row) => (row as any).total_no_historico ?? 0,
                      sortable: true,
                      visible: true,
                      render: (value) => {
                        const count = Number(value ?? 0);
                        return (
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              count === 0
                                ? 'bg-slate-100 text-slate-400'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {count}
                          </span>
                        );
                      },
                    },
                  ]}
                  loading={false}
                  // Column config control
                  columnConfigOpen={columnConfigOpen === 'tipos'}
                  onColumnConfigOpenChange={(open) => setColumnConfigOpen(open ? 'tipos' : null)}
                  showInternalColumnConfigButton={false}
                  emptyState={
                    <QualificacaoEmptyState
                      icon={Tag}
                      title="Nenhum modelo cadastrado"
                      description="Configure os modelos de qualificações disponíveis no sistema"
                      action={
                        canManageTipos && (
                          <button
                            onClick={() => setShowTipoModal(true)}
                            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Novo Modelo</span>
                          </button>
                        )
                      }
                    />
                  }
                />
              )}
            </>
          )}

          {activeTab === 'categorias' && (
            <div>
              {/* Modelos permanece como aba principal própria. */}
              <div className="mx-4 mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-2 text-sm text-blue-800">
                <Info size={16} className="mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Modelos</strong> (tipos de qualificação) permanece como aba principal
                  própria. A classificação funcional é feita exclusivamente por Categoria.
                </span>
              </div>
              {categoriasError && (
                <div className="mx-4 mb-4 rounded-md border border-danger-300 bg-danger-50 p-4 flex gap-3">
                  <AlertCircle className="w-6 h-6 text-danger-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-danger-700 mb-1">
                      Erro ao carregar categorias
                    </p>
                    <p className="text-xs text-danger-600 mb-3 break-all">{categoriasError}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="inline-flex items-center gap-1 rounded-md bg-danger-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-danger-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Recarregar
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">
                        Ações
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-32">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        Categoria
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        Conteúdo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {categorias.map((cat) => (
                      <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                setEditingCategoria(cat);
                                setNovaCategoriaNome(cat.nome);
                                setNovaCategoriaDesc(cat.descricao || '');
                                setShowCategoriaModal(true);
                              }}
                              className={historicoActionButtonClass}
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4 text-indigo-600" />
                            </button>
                            <RowActionsMenu
                              label="Mais ações"
                              actions={[
                                {
                                  label: 'Deletar categoria',
                                  icon: Trash2,
                                  destructive: true,
                                  onSelect: async () => {
                                    if (
                                      !(await confirmDialog(
                                        'Tem certeza que deseja deletar esta categoria?',
                                      ))
                                    )
                                      return;
                                    try {
                                      const apiUrl = API_BASE_URL;
                                      const response = await fetchWithAuth(
                                        `${apiUrl}/categorias/${cat.id}`,
                                        {
                                          method: 'DELETE',
                                        },
                                      );
                                      if (response.ok) {
                                        showToast.success('Categoria deletada com sucesso!');
                                        setCategorias(categorias.filter((c) => c.id !== cat.id));
                                      } else {
                                        const errorData = await response
                                          .json()
                                          .catch(() => ({}));
                                        if (response.status === 403) {
                                          showToast.error(
                                            'Permissão negada. Apenas administradores podem deletar categorias.',
                                          );
                                        } else {
                                          showToast.error(
                                            errorData.error || 'Erro ao deletar categoria',
                                          );
                                        }
                                      }
                                    } catch (error) {
                                      console.error('Erro ao deletar categoria:', error);
                                      showToast.error('Erro ao deletar categoria');
                                    }
                                  },
                                },
                              ]}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-success-600/10 text-success-600">
                            <span className="h-2 w-2 rounded-full bg-success-600" />
                            ATIVO
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-3 w-3 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor:
                                  getCategoriaCorDisplay(cat.nome, cat.cor) || '#9ca3af',
                              }}
                            />
                            <span className="font-medium text-slate-900">{cat.nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-600 line-clamp-2">
                            {cat.descricao || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {categorias.length === 0 && (
                <QualificacaoEmptyState
                  icon={FolderOpen}
                  title="Nenhuma categoria encontrada"
                  description="Crie a primeira categoria"
                />
              )}
            </div>
          )}

          {isPlanejadosTab && (
            <div className="space-y-0">
              {/* Sub-tabs: Lista | Calendário | Turmas — pill style matching main tabs */}
              <div
                role="tablist"
                aria-label="Visualizações de treinamentos planejados"
                className="flex items-center gap-1 border-b border-slate-100 px-4 pt-3 pb-3"
              >
                {(['lista', 'calendario', 'turmas'] as const).map((view) => {
                  const labels: Record<string, string> = {
                    lista: 'Lista',
                    calendario: 'Calendário',
                    turmas: 'Turmas',
                  };
                  const icons: Record<string, React.ReactNode> = {
                    lista: <ClipboardList size={14} aria-hidden="true" />,
                    calendario: <CalendarDays size={14} aria-hidden="true" />,
                    turmas: <Users size={14} aria-hidden="true" />,
                  };
                  const isActive = plannedView === view;
                  return (
                    <button
                      key={view}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        setPlannedView(view);
                        writeUserPreference('qualificacoes_prefs_v1', {
                          activeTab: 'planejados',
                          plannedView: view,
                        });
                      }}
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 font-semibold'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {icons[view]}
                      {labels[view]}
                    </button>
                  );
                })}
              </div>

              {/* Lista: dataset consolidado — kept mounted via CSS hidden for instant switching */}
              <div className={plannedView === 'lista' ? '' : 'hidden'}>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-20">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
                    </div>
                  }
                >
                  <TreinamentosPlanejadosPage
                    asTab={true}
                    forcedTab="quadro"
                    hideActions={true}
                    hideTabNav={true}
                    initialSetorIds={setorFilter.length > 0 ? setorFilter.map(Number) : undefined}
                  />
                </Suspense>
              </div>

              {/* Calendário: kept mounted via CSS hidden for instant switching */}
              <div className={plannedView === 'calendario' ? '' : 'hidden'}>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-20">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
                    </div>
                  }
                >
                  <TreinamentosPlanejadosPage
                    asTab={true}
                    forcedTab="calendario"
                    hideActions={true}
                    hideTabNav={true}
                    initialSetorIds={setorFilter.length > 0 ? setorFilter.map(Number) : undefined}
                  />
                </Suspense>
              </div>

              {/* Turmas: gestão cadastral real, filtrada por TREINAMENTOS */}
              <div className={plannedView === 'turmas' ? '' : 'hidden'}>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-20">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
                    </div>
                  }
                >
                  <TreinamentosPlanejadosPage
                    asTab={true}
                    forcedTab="quadro"
                    hideTabNav={true}
                    sourceFilter="TREINAMENTOS"
                    autoOpenForm={autoOpenTurmasModal}
                    onAutoOpenFormHandled={() => setAutoOpenTurmasModal(false)}
                    initialSetorIds={setorFilter.length > 0 ? setorFilter.map(Number) : undefined}
                  />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Categoria */}
      <Modal
        isOpen={showCategoriaModal}
        onClose={() => {
          setShowCategoriaModal(false);
          setEditingCategoria(null);
          setNovaCategoriaNome('');
          setNovaCategoriaDesc('');
        }}
        title={editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Nome" required>
            <TextInput
              placeholder="Ex: LICENÇA, EXAME, TREINAMENTO..."
              value={novaCategoriaNome}
              onChange={(e) => setNovaCategoriaNome(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField label="Descrição">
            <TextArea
              rows={3}
              placeholder="Descrição opcional da categoria..."
              value={novaCategoriaDesc}
              onChange={(e) => setNovaCategoriaDesc(e.target.value)}
            />
          </FormField>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={async () => {
                setShowCategoriaModal(false);
                setEditingCategoria(null);
                setNovaCategoriaNome('');
                setNovaCategoriaDesc('');
              }}
              className="px-6 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!novaCategoriaNome.trim()) {
                  showToast.error('Nome é obrigatório');
                  return;
                }

                try {
                  const apiUrl = API_BASE_URL;

                  const method = editingCategoria ? 'PUT' : 'POST';
                  const url = editingCategoria
                    ? `${apiUrl}/categorias/${editingCategoria.id}`
                    : `${apiUrl}/categorias`;

                  const response = await fetchWithAuth(url, {
                    method,
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      nome: novaCategoriaNome,
                      descricao: novaCategoriaDesc || null,
                    }),
                  });

                  if (response.ok) {
                    showToast.success(
                      editingCategoria ? 'Categoria atualizada!' : 'Categoria criada!',
                    );
                    setShowCategoriaModal(false);
                    setEditingCategoria(null);
                    setNovaCategoriaNome('');
                    setNovaCategoriaDesc('');
                    // Recarregar categorias
                    const categoriasResponse = await fetchWithAuth(`${apiUrl}/categorias`, {});
                    if (categoriasResponse.ok) {
                      const data = await categoriasResponse.json();
                      setCategorias(data.data || []);
                    }
                  } else {
                    showToast.error(editingCategoria ? 'Erro ao atualizar' : 'Erro ao criar');
                  }
                } catch {
                  showToast.error('Erro ao salvar categoria');
                }
              }}
              className="px-6 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {editingCategoria ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Renovação (componentizado) */}
      <Suspense fallback={null}>
        <ModalRenovarQualificacao
          isOpen={showRenovarModal}
          onClose={() => {
            setShowRenovarModal(false);
            setQualificacaoParaRenovar(null);
          }}
          qualificacao={
            qualificacaoParaRenovar
              ? {
                  id: (qualificacaoParaRenovar.id as number) || 0,
                  funcionario_nome: qualificacaoParaRenovar.funcionario_nome || '',
                  qualificacao_nome: qualificacaoParaRenovar.qualificacao_nome || '',
                  qualificacao_codigo:
                    (
                      qualificacaoParaRenovar as unknown as {
                        qualificacao_codigo?: string;
                        codigo?: string;
                      }
                    ).qualificacao_codigo ||
                    (qualificacaoParaRenovar as unknown as { codigo?: string }).codigo ||
                    '-',
                  data_vencimento:
                    (qualificacaoParaRenovar.data_vencimento as string) ||
                    (qualificacaoParaRenovar as unknown as { data_validade?: string })
                      .data_validade ||
                    '',
                  data_realizacao:
                    (qualificacaoParaRenovar.data_conclusao as string) ||
                    (qualificacaoParaRenovar as unknown as { data_emissao?: string })
                      .data_emissao ||
                    '',
                }
              : null
          }
          onSuccess={async () => {
            // ⚡ ATUALIZAÇÃO IMEDIATA - CRÍTICO PARA COMPLIANCE
            await carregarHistorico();
            // Recarregar stats também
            try {
              const statsResponse = await fetchWithAuth(`${API_BASE_URL}/dashboard/qualificacoes`);
              if (statsResponse.ok) {
                const json = await statsResponse.json();
                const data = json.data || json;
                setDashboardStats({
                  total: data.total_ativas || 0,
                  validas: data.validas || 0,
                  vencendo: data.a_vencer_30_dias || 0,
                  vencidas: data.vencidas || 0,
                  renovadas: data.renovadas || 0,
                  planejadas: data.planejadas || 0,
                });
              }
            } catch (error) {
              console.error('Erro ao atualizar stats:', error);
            }
          }}
        />
      </Suspense>

      {/* Modal novo unificado (atribuir/editar) */}
      <Suspense fallback={null}>
        <ModalAtribuirQualificacao
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setEditingQualificacao(null);
          }}
          habilitacao={
            editingQualificacao
              ? (() => {
                  const e = editingQualificacao as unknown as HabilitacaoShape;
                  return {
                    id: e.id!,
                    funcionario_id: e.funcionario_id!,
                    qualificacao_id: e.qualificacao_id!,
                    qualificacao_codigo:
                      e.qualificacao_codigo ||
                      (editingQualificacao as unknown as { codigo?: string }).codigo,
                    qualificacao_nome: e.qualificacao_nome,
                    data_conclusao: e.data_conclusao,
                    data_vencimento: e.data_vencimento,
                    numero_certificado: e.numero_certificado,
                    instrutor: e.instrutor,
                    observacoes: e.observacoes,
                    tipo_treinamento: e.tipo_treinamento,
                  };
                })()
              : undefined
          }
          onSuccess={async () => {
            // ⚡ ATUALIZAÇÃO IMEDIATA - CRÍTICO PARA COMPLIANCE
            await carregarHistorico();
            // Recarregar stats também
            try {
              const statsResponse = await fetchWithAuth(`${API_BASE_URL}/dashboard/qualificacoes`);
              if (statsResponse.ok) {
                const json = await statsResponse.json();
                const data = json.data || json;
                setDashboardStats({
                  total: data.total_ativas || 0,
                  validas: data.validas || 0,
                  vencendo: data.a_vencer_30_dias || 0,
                  vencidas: data.vencidas || 0,
                  renovadas: data.renovadas || 0,
                  planejadas: data.planejadas || 0,
                });
              }
            } catch (error) {
              console.error('Erro ao atualizar stats:', error);
            }
            setShowModal(false);
            setEditingQualificacao(null);
          }}
        />
      </Suspense>

      <Modal
        isOpen={showConvocacaoPlanejadaModal && !!planejadaConvocacaoSelecionada}
        onClose={fecharModalConvocacaoPlanejada}
        title="Convocar turma planejada"
        size="lg"
      >
        <div className="space-y-4">
          {!convocacaoPlanejadaPreview ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {planejadaConvocacaoSelecionada?.funcionario_nome || '-'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {planejadaConvocacaoSelecionada?.qualificacao_nome || '-'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  A lista abaixo mostra apenas turmas em status planejado e vinculadas ao mesmo
                  funcionário e à mesma qualificação desta linha.
                </p>
              </div>

              <QualificacaoSectionBox
                title="Gestores em CC"
                titleRight={
                  <span className="text-xs text-slate-500">
                    {gestoresCcSelecionadosIds.length} selecionado(s)
                  </span>
                }
              >
                {carregandoGestoresCc ? (
                  <p className="mt-2 text-sm text-slate-500">Carregando gestores em cópia...</p>
                ) : gestoresCcDisponiveis.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Nenhum gestor ativo cadastrado.</p>
                ) : (
                  <>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        onClick={() =>
                          setGestoresCcSelecionadosIds(
                            gestoresCcDisponiveis.map((gestor) => gestor.id),
                          )
                        }
                      >
                        Marcar todos
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        onClick={() => setGestoresCcSelecionadosIds([])}
                      >
                        Limpar
                      </button>
                    </div>

                    <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">
                      {gestoresCcDisponiveis.map((gestor) => (
                        <label
                          key={gestor.id}
                          className="flex items-start gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={gestoresCcSelecionadosIds.includes(gestor.id)}
                            onChange={(event) => {
                              setGestoresCcSelecionadosIds((current) => {
                                if (event.target.checked) {
                                  return current.includes(gestor.id)
                                    ? current
                                    : [...current, gestor.id];
                                }
                                return current.filter((id) => id !== gestor.id);
                              });
                            }}
                          />
                          <span>
                            {gestor.nome}{' '}
                            <span className="text-slate-500">&lt;{gestor.email}&gt;</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </QualificacaoSectionBox>

              {treinamentosPlanejadosConvocacaoQuery.isLoading ? (
                <p className="text-sm text-slate-500">Carregando turmas planejadas...</p>
              ) : turmasPlanejadasDisponiveis.length === 0 ? (
                <>
                  <QualificacaoSectionBox title="Escopo do envio">
                    <div className="space-y-2 text-sm text-slate-700">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="escopo-convocacao-planejada"
                          checked={escopoEnvioConvocacaoPlanejada === 'turma'}
                          onChange={() => setEscopoEnvioConvocacaoPlanejada('turma')}
                        />
                        Enviar para todos os participantes da turma
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="escopo-convocacao-planejada"
                          checked={escopoEnvioConvocacaoPlanejada === 'funcionario'}
                          onChange={() => setEscopoEnvioConvocacaoPlanejada('funcionario')}
                        />
                        Enviar apenas para{' '}
                        {planejadaConvocacaoSelecionada?.funcionario_nome ||
                          'o participante da linha'}
                      </label>
                    </div>
                  </QualificacaoSectionBox>

                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={fecharModalConvocacaoPlanejada}>
                      Fechar
                    </Button>
                    <Button
                      onClick={() => void enviarConvocacaoPlanejadaFallback()}
                      disabled={enviandoConvocacaoPlanejadaFallback || carregandoGestoresCc}
                    >
                      {enviandoConvocacaoPlanejadaFallback ? 'Enviando...' : 'Enviar convocação'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <QualificacaoSectionBox title="Escopo do envio">
                    <div className="space-y-2 text-sm text-slate-700">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="escopo-convocacao-planejada"
                          checked={escopoEnvioConvocacaoPlanejada === 'turma'}
                          onChange={() => setEscopoEnvioConvocacaoPlanejada('turma')}
                        />
                        Enviar para todos da turma
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="escopo-convocacao-planejada"
                          checked={escopoEnvioConvocacaoPlanejada === 'funcionario'}
                          onChange={() => setEscopoEnvioConvocacaoPlanejada('funcionario')}
                        />
                        Enviar apenas para{' '}
                        {planejadaConvocacaoSelecionada?.funcionario_nome ||
                          'o funcionário da linha'}
                      </label>
                    </div>
                  </QualificacaoSectionBox>

                  {turmasPlanejadasDisponiveis.map((turma) => (
                    <label
                      key={turma.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 hover:border-slate-300"
                    >
                      <input
                        type="radio"
                        name="turma-convocacao-planejada"
                        checked={turmaConvocacaoSelecionadaId === turma.id}
                        onChange={() => setTurmaConvocacaoSelecionadaId(turma.id)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {turma.titulo?.trim() || turma.qualificacao_nome || 'Turma planejada'}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatDateLabel(turma.data_prevista)} ·{' '}
                          {turma.hora_inicio || 'Horário a definir'}
                          {turma.local ? ` · ${turma.local}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {turma.convocados_total} convocados · {turma.confirmados_total}{' '}
                          confirmados
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {!treinamentosPlanejadosConvocacaoQuery.isLoading &&
                turmasPlanejadasDisponiveis.length > 0 && (
                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={fecharModalConvocacaoPlanejada}>
                      Fechar
                    </Button>
                    <Button
                      onClick={() => void prepararConvocacaoPlanejada()}
                      disabled={
                        !turmaConvocacaoSelecionadaId ||
                        previewConvocacaoPlanejada.isPending ||
                        carregandoGestoresCc
                      }
                    >
                      {previewConvocacaoPlanejada.isPending
                        ? 'Preparando...'
                        : 'Preparar convocação'}
                    </Button>
                  </div>
                )}
            </>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <QualificacaoSectionBox variant="slate" title="Turma">
                  <p className="font-semibold text-slate-900">
                    {convocacaoPlanejadaPreview.treinamento_nome}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {convocacaoPlanejadaPreview.modalidade}
                  </p>
                </QualificacaoSectionBox>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Envio
                  </p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {escopoEnvioConvocacaoPlanejada === 'funcionario'
                      ? participanteConvocacaoSelecionado?.status === 'ready'
                        ? '1 válido de 1'
                        : '0 válidos de 1'
                      : `${convocacaoPlanejadaPreview.destinatarios_validos} válidos de ${convocacaoPlanejadaPreview.destinatarios_total}`}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    CC:{' '}
                    {gestoresCcDisponiveis
                      .filter((item) => gestoresCcSelecionadosIds.includes(item.id))
                      .map((item) => item.email)
                      .join(', ') || 'Sem cópia'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p>
                  <strong>Data:</strong> {convocacaoPlanejadaPreview.data_inicio}
                </p>
                <p>
                  <strong>Horário:</strong> {convocacaoPlanejadaPreview.horario}
                </p>
                <p>
                  <strong>Local:</strong> {convocacaoPlanejadaPreview.local}
                </p>
              </div>

              {escopoEnvioConvocacaoPlanejada === 'turma' &&
                (convocacaoPlanejadaPreview.ausentes_email.length > 0 ||
                  convocacaoPlanejadaPreview.invalidos_email.length > 0) && (
                  <label className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ignorarSemEmailConvocacaoPlanejada}
                      onChange={(event) =>
                        setIgnorarSemEmailConvocacaoPlanejada(event.target.checked)
                      }
                      className="mt-1"
                    />
                    <span>Ignorar participantes sem e-mail válido e enviar para os demais.</span>
                  </label>
                )}

              {escopoEnvioConvocacaoPlanejada === 'funcionario' &&
                participanteConvocacaoSelecionado?.status !== 'ready' && (
                  <QualificacaoAlert variant="rose">
                    O funcionário selecionado está sem e-mail válido para envio individual.
                  </QualificacaoAlert>
                )}

              {escopoEnvioConvocacaoPlanejada === 'turma' &&
                convocacaoPlanejadaPreview.ultima_convocacao_em && (
                  <label className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmarReenvioConvocacaoPlanejada}
                      onChange={(event) =>
                        setConfirmarReenvioConvocacaoPlanejada(event.target.checked)
                      }
                      className="mt-1"
                    />
                    <span>Esta turma já recebeu convocação. Confirmo o reenvio.</span>
                  </label>
                )}

              {convocacaoPlanejadaPreview.avisos.length > 0 && (
                <QualificacaoAlert variant="slate">
                  {convocacaoPlanejadaPreview.avisos.map((aviso) => (
                    <p key={aviso}>{aviso}</p>
                  ))}
                </QualificacaoAlert>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setConvocacaoPlanejadaPreview(null)}>
                  Voltar
                </Button>
                <Button
                  onClick={() => void confirmarConvocacaoPlanejada()}
                  disabled={
                    enviarConvocacaoPlanejada.isPending ||
                    reenviarConvocacaoPlanejada.isPending ||
                    carregandoGestoresCc ||
                    (escopoEnvioConvocacaoPlanejada === 'turma' &&
                      Boolean(convocacaoPlanejadaPreview.ultima_convocacao_em) &&
                      !confirmarReenvioConvocacaoPlanejada) ||
                    (escopoEnvioConvocacaoPlanejada === 'turma' &&
                      (convocacaoPlanejadaPreview.ausentes_email.length || 0) +
                        (convocacaoPlanejadaPreview.invalidos_email.length || 0) >
                        0 &&
                      !ignorarSemEmailConvocacaoPlanejada) ||
                    (escopoEnvioConvocacaoPlanejada === 'funcionario' &&
                      participanteConvocacaoSelecionado?.status !== 'ready')
                  }
                >
                  {enviarConvocacaoPlanejada.isPending || reenviarConvocacaoPlanejada.isPending
                    ? 'Enviando...'
                    : escopoEnvioConvocacaoPlanejada === 'funcionario'
                      ? 'Enviar para funcionário'
                      : 'Enviar convocação'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showTurmaPlanejadaModal}
        onClose={fecharModalTurmaPlanejada}
        title="Incluir turma planejada"
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={fecharModalTurmaPlanejada}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarTurmaPlanejada()} disabled={salvandoTurmaPlanejada}>
              {salvandoTurmaPlanejada ? 'Salvando...' : 'Salvar turma'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Registro legado — sessão avulsa</p>
            <p className="mt-1 text-xs text-amber-700">
              Este formulário cria um registro simples com data única e instrutor em texto livre.
              Para turmas com múltiplos dias, instrutores cadastrados, recursos e controle de
              presença, use o{' '}
              <a
                href="/qualificacoes?tab=turmas"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-amber-900 underline hover:text-amber-950"
              >
                Gerenciador de Turmas Planejadas
              </a>
              .
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Qualificacao" required>
              <Select
                value={turmaPlanejadaQualificacaoCodigo}
                onChange={(e) => setTurmaPlanejadaQualificacaoCodigo(e.target.value)}
                options={[
                  { value: '', label: '-- Selecione --' },
                  ...tipos
                    .filter((tipo) => Boolean(tipo?.codigo && tipo?.nome))
                    .map((tipo) => ({
                      value: String(tipo.codigo || ''),
                      label: `${tipo.codigo} - ${tipo.nome}`,
                    })),
                ]}
              />
            </FormField>
            <FormField label="Data planejada" required>
              <TextInput
                type="date"
                value={turmaPlanejadaData}
                min={getDataMinimaPlanejada()}
                onChange={(e) => setTurmaPlanejadaData(e.target.value)}
              />
            </FormField>
            <FormField label="Horario">
              <TimeInput
                value={turmaPlanejadaHorario}
                onChange={setTurmaPlanejadaHorario}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:border-primary-600 focus:ring-primary-600/20"
              />
            </FormField>
            <FormField label="Local">
              <TextInput
                value={turmaPlanejadaLocal}
                onChange={(e) => setTurmaPlanejadaLocal(e.target.value)}
                placeholder="Ex: Sala de Treinamento 2"
              />
            </FormField>
            <FormField label="Tipo de treinamento">
              <Select
                value={turmaPlanejadaTipoTreinamento}
                onChange={(e) =>
                  setTurmaPlanejadaTipoTreinamento(
                    e.target.value as
                      'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO',
                  )
                }
                options={[
                  { value: 'INICIAL', label: 'Treinamento Inicial' },
                  { value: 'RECORRENTE', label: 'Treinamento Periódico' },
                  { value: 'SEMESTRAL', label: 'Semestral' },
                  { value: 'UPGRADE', label: 'Upgrade' },
                  { value: 'ESPECIFICO', label: 'Específico' },
                ]}
              />
            </FormField>
            <FormField label="Instrutor">
              <TextInput
                value={turmaPlanejadaInstrutor}
                onChange={(e) => setTurmaPlanejadaInstrutor(e.target.value)}
                placeholder="Nome do instrutor"
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Observacoes">
                <TextArea
                  rows={3}
                  value={turmaPlanejadaObservacoes}
                  onChange={(e) => setTurmaPlanejadaObservacoes(e.target.value)}
                  placeholder="Informacoes adicionais para todos os participantes"
                />
              </FormField>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Participantes da turma</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {totalParticipantesTurmaPlanejadaSelecionados} selecionado(s)
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={buscaParticipanteTurmaPlanejada}
                onChange={(e) => setBuscaParticipanteTurmaPlanejada(e.target.value)}
                placeholder="Buscar por nome ou matricula"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
              />
              <button
                type="button"
                onClick={selecionarTodosParticipantesFiltradosTurmaPlanejada}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Selecionar filtrados ({totalParticipantesTurmaPlanejadaFiltrados})
              </button>
              <button
                type="button"
                onClick={limparParticipantesFiltradosTurmaPlanejada}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpar filtrados
              </button>
            </div>

            <div className="mt-3 max-h-64 overflow-auto rounded-md border border-slate-200">
              {loadingFuncionariosAtivos ? (
                <p className="p-3 text-sm text-slate-500">Carregando funcionarios...</p>
              ) : participantesTurmaPlanejadaFiltrados.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">Nenhum funcionario encontrado.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {participantesTurmaPlanejadaFiltrados.map((funcionario) => {
                    const funcionarioId = Number(funcionario.id || 0);
                    const checked = turmaPlanejadaParticipantesSelecionados.includes(funcionarioId);
                    return (
                      <li key={funcionarioId} className="px-3 py-2 hover:bg-slate-50">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              alternarSelecaoParticipanteTurmaPlanejada(funcionarioId)
                            }
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {funcionario.nome}
                            </p>
                            <p className="text-xs text-slate-500">
                              {funcionario.matricula || 'Sem matricula'}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showPlanejadaModal && !!planejadaSelecionada}
        onClose={fecharModalPlanejada}
        title={planejadaSelecionada?.qualificacao_nome || 'Treinamento planejado'}
        size="lg"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={fecharModalPlanejada}
              disabled={salvandoPlanejadaId === planejadaSelecionada?.id}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Fechar
            </button>
            {planejadaSelecionada && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={async () => {
                    const reagendou = await handleReagendarPlanejada(
                      planejadaSelecionada,
                      novaDataPlanejada,
                    );
                    if (reagendou) {
                      fecharModalPlanejada();
                    }
                  }}
                  disabled={salvandoPlanejadaId === planejadaSelecionada.id}
                  className="inline-flex items-center justify-center rounded-lg border border-sky-200 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvandoPlanejadaId === planejadaSelecionada.id
                    ? 'Processando...'
                    : 'Nao foi realizado, reagendar'}
                </button>

                {(() => {
                  const dataPlanejada = parseDateLocal(
                    (planejadaSelecionada as HistoricoItem & { data_realizacao?: string })
                      .data_realizacao || planejadaSelecionada.data_conclusao,
                  );
                  const hoje = new Date();
                  hoje.setHours(0, 0, 0, 0);
                  const podeConfirmar = Boolean(dataPlanejada && dataPlanejada <= hoje);

                  if (!podeConfirmar) {
                    return null;
                  }

                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        setSalvandoPlanejadaId(planejadaSelecionada.id);
                        const confirmou = await handleConfirmar(planejadaSelecionada, true, false);
                        setSalvandoPlanejadaId(null);
                        if (confirmou) {
                          fecharModalPlanejada();
                        }
                      }}
                      disabled={salvandoPlanejadaId === planejadaSelecionada.id}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {salvandoPlanejadaId === planejadaSelecionada.id
                        ? 'Processando...'
                        : 'Foi realizado'}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        }
      >
        {planejadaSelecionada && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <QualificacaoChip color="purple">Planejada</QualificacaoChip>
                {planejadaSelecionada.qualificacao_codigo && (
                  <QualificacaoChip color="slate">
                    {planejadaSelecionada.qualificacao_codigo}
                  </QualificacaoChip>
                )}
                {(planejadaSelecionada as HistoricoItem & { tipo_treinamento?: string | null })
                  .tipo_treinamento && (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                    {
                      getTipoTreinamentoDisplay(
                        (
                          planejadaSelecionada as HistoricoItem & {
                            tipo_treinamento?: string | null;
                          }
                        ).tipo_treinamento || null,
                        (
                          planejadaSelecionada as HistoricoItem & {
                            qualificacao_validade?: number | null;
                          }
                        ).qualificacao_validade || null,
                      ).label
                    }
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Revise os dados do planejamento. Se o treinamento foi executado na data prevista,
                confirme para concluir o registro e aplicar a lógica de renovação. Se não foi
                realizado, informe uma nova data futura para manter o planejamento ativo.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <QualificacaoInfoCard
                label="Funcionario"
                value={planejadaSelecionada.funcionario_nome || '-'}
              />
              <QualificacaoInfoCard
                label="Qualificacao"
                value={planejadaSelecionada.qualificacao_nome || '-'}
              />
              <QualificacaoInfoCard
                label="Data planejada"
                value={(() => {
                  const dataAtual =
                    (planejadaSelecionada as HistoricoItem & { data_realizacao?: string })
                      .data_realizacao || planejadaSelecionada.data_conclusao;
                  return dataAtual
                    ? parseDateLocal(dataAtual)?.toLocaleDateString('pt-BR') || dataAtual
                    : '-';
                })()}
              />
              <QualificacaoInfoCard
                label="Vencimento"
                value={
                  planejadaSelecionada.data_vencimento
                    ? parseDateLocal(planejadaSelecionada.data_vencimento)?.toLocaleDateString(
                        'pt-BR',
                      ) || planejadaSelecionada.data_vencimento
                    : '-'
                }
              />
              <QualificacaoInfoCard
                label="Instrutor"
                value={planejadaSelecionada.instrutor || '-'}
              />
              <QualificacaoInfoCard label="Registro" value={`#${planejadaSelecionada.id}`} />
            </div>

            <QualificacaoInfoCard
              label="Observacoes"
              value={
                planejadaSelecionada.observacoes || 'Sem observacoes adicionais neste planejamento.'
              }
              valueClassName="text-slate-700"
            />

            <FormField label="Nova data planejada">
              <TextInput
                type="date"
                value={novaDataPlanejada}
                min={getDataMinimaPlanejada()}
                onChange={(e) => setNovaDataPlanejada(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">
                Use uma nova data apenas quando o treinamento não tiver sido realizado e precisar
                ser reagendado.
              </p>
            </FormField>
          </div>
        )}
      </Modal>

      {/* Modal de Edição Completa (substitui ModalEditarQualificacaoSimples) */}
      <Suspense fallback={null}>
        <ModalAtribuirQualificacao
          isOpen={modalEditarAberto && !!registroSelecionado}
          onClose={() => {
            setModalEditarAberto(false);
            setRegistroSelecionado(null);
          }}
          habilitacao={
            registroSelecionado
              ? (() => {
                  const r = registroSelecionado as unknown as HabilitacaoShape;
                  return {
                    id: r.id!,
                    funcionario_id: r.funcionario_id!,
                    qualificacao_id: r.qualificacao_id!,
                    qualificacao_codigo:
                      r.qualificacao_codigo ||
                      (registroSelecionado as unknown as { codigo?: string }).codigo,
                    qualificacao_nome: r.qualificacao_nome,
                    data_conclusao: r.data_conclusao,
                    data_vencimento: r.data_vencimento,
                    numero_certificado: r.numero_certificado,
                    instrutor: r.instrutor,
                    observacoes: r.observacoes,
                    tipo_treinamento: r.tipo_treinamento,
                  };
                })()
              : undefined
          }
          onSuccess={async () => {
            // ⚡ ATUALIZAÇÃO IMEDIATA - CRÍTICO PARA COMPLIANCE
            await carregarHistorico();
            // Recarregar stats também
            try {
              const statsResponse = await fetchWithAuth(`${API_BASE_URL}/dashboard/qualificacoes`);
              if (statsResponse.ok) {
                const json = await statsResponse.json();
                const data = json.data || json;
                setDashboardStats({
                  total: data.total_ativas || 0,
                  validas: data.validas || 0,
                  vencendo: data.a_vencer_30_dias || 0,
                  vencidas: data.vencidas || 0,
                  renovadas: data.renovadas || 0,
                  planejadas: data.planejadas || 0,
                });
              }
            } catch (error) {
              console.error('Erro ao atualizar stats:', error);
            }
            setModalEditarAberto(false);
            setRegistroSelecionado(null);
          }}
        />
      </Suspense>

      {/* Modal de Renovação (duplicado) */}
      {/* Removido: usamos ModalRenovarQualificacao acima para UI consistente */}
      {/* <Modal
        isOpen={showRenovarModal}
        onClose={() => {
          setShowRenovarModal(false);
          setQualificacaoParaRenovar(null);
        }}
        title={`Renovar Qualificação${
          qualificacaoParaRenovar ? ` - ${qualificacaoParaRenovar.qualificacao_nome}` : ''
        }`}
        size="md"
      >
        <div className="space-y-4">
          {qualificacaoParaRenovar && (
            <div className="rounded-lg bg-slate-50 p-4 space-y-2">
              <div className="flex justify-between items-start">
                <QualificacaoDataPoint label="Funcionário" value={qualificacaoParaRenovar.funcionario_nome} />
                <QualificacaoDataPoint label="Qualificação" value={qualificacaoParaRenovar.qualificacao_nome} />
              </div>
              <div className="flex justify-between items-start pt-2 border-t border-slate-200">
                <div>
                  <p className="text-xs font-medium text-slate-600 uppercase">Data Anterior</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {qualificacaoParaRenovar.data_conclusao
                      ? new Date(qualificacaoParaRenovar.data_conclusao).toLocaleDateString('pt-BR')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 uppercase">Vence em</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {qualificacaoParaRenovar.data_vencimento
                      ? new Date(qualificacaoParaRenovar.data_vencimento).toLocaleDateString(
                          'pt-BR',
                        )
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <FormField label="Nova Data de Realização" required>
            <TextInput
              type="date"
              value={novaDataRealizacao}
              onChange={(e) => setNovaDataRealizacao(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-2">
              Nova data de vencimento será calculada automaticamente (+1 ano)
            </p>
          </FormField>

          <FormActions
            onCancel={() => {
              setShowRenovarModal(false);
              setQualificacaoParaRenovar(null);
              setNovaDataRealizacao('');
            }}
            onSubmit={handleConfirmarRenovacao}
            submitLabel={renovandoId === qualificacaoParaRenovar?.id ? 'Renovando...' : 'Renovar'}
            submitDisabled={renovandoId === qualificacaoParaRenovar?.id}
          />
        </div>
      </Modal> */}

      {/* Modal de Modelo de Qualificação */}
      <Modal
        isOpen={showTipoModal}
        onClose={() => {
          setShowTipoModal(false);
          setEditingTipo(null);
        }}
        title={editingTipo ? 'Editar Modelo de Qualificação' : 'Novo Modelo de Qualificação'}
        size="lg"
        footer={
          <FormActions
            onCancel={() => {
              if (savingTipo) return;
              setShowTipoModal(false);
              setEditingTipo(null);
            }}
            onSubmit={async () => {
              if (savingTipo) return;

              // Validação mínima
              if (
                !editingTipo ||
                !editingTipo.nome?.trim() ||
                !editingTipo.codigo?.trim() ||
                !editingTipo.categoria?.trim()
              ) {
                showToast.error('Nome, Código e Categoria são obrigatórios');
                return;
              }

              const codigoNormalizado = normalizeTipoCodigo(editingTipo.codigo);

              const duplicateTipo = tipos.find((tipo) => {
                if (!tipo) return false;
                if (editingTipo.id && String(tipo.id) === String(editingTipo.id)) return false;
                return normalizeTipoCodigo(tipo.codigo) === codigoNormalizado;
              });

              if (duplicateTipo) {
                showToast.error(`Código já existe: ${codigoNormalizado}`);
                return;
              }

              // Validade deve ser nula (sem vencimento) ou > 0.
              // O banco tem CHECK(validade IS NULL OR validade > 0).
              if (editingTipo.validade != null && editingTipo.validade <= 0) {
                showToast.error(
                  'Validade deve ser maior que zero. Deixe o campo vazio para qualificação sem vencimento.',
                );
                return;
              }

              // ⚠️ Safety timeout: evita que o botão fique em "Salvando..." para sempre.
              // Timeout de 30s cobre até mesmo o pior caso de reconcileImportedEdappHistory.
              const SAVE_TIMEOUT_MS = 30_000;
              let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

              try {
                setSavingTipo(true);

                // Forçar reset após timeout como último recurso (defesa em profundidade)
                saveTimeoutId = setTimeout(() => {
                  console.error(
                    '[SalvarTipo] TIMEOUT: operação excedeu %ds — forçando reset de savingTipo',
                    SAVE_TIMEOUT_MS / 1000,
                  );
                  setSavingTipo(false);
                  showToast.error(
                    'Operação excedeu o tempo limite. O modelo pode ter sido salvo — verifique a lista.',
                  );
                }, SAVE_TIMEOUT_MS);

                const token = getAccessToken();
                const apiUrl = API_BASE_URL;

                if (!token) {
                  showToast.error('Token não encontrado. Faça login novamente.');
                  return;
                }

                // Determinar se é criação ou atualização
                // IDs de tipos são strings (formato: tipo-{timestamp}-{random})
                const isEdit = !!(editingTipo.id && String(editingTipo.id).trim().length > 0);
                const method = isEdit ? 'PUT' : 'POST';
                const url = isEdit
                  ? `${apiUrl}/qualificacoes/tipos/${editingTipo.id}`
                  : `${apiUrl}/qualificacoes/tipos`;

                // Construir payload
                let payload: Record<string, unknown> = {};
                let setoresMudaram = false;

                if (isEdit) {
                  const originalTipo = tipos.find((t) => String(t.id) === String(editingTipo.id));
                  const diffPayload = buildTipoUpdatePayload(
                    originalTipo as Record<string, unknown> | null | undefined,
                    {
                      ...editingTipo,
                      codigo: codigoNormalizado,
                    },
                  );

                  // Verifica se houve mudança nos setores
                  const originalSetores = (originalTipo?.setores || [])
                    .map((s: { id: number }) => Number(s.id))
                    .sort()
                    .join(',');
                  const draftSetores = (editingTipo.setor_ids || []).map(Number).sort().join(',');
                  setoresMudaram = originalSetores !== draftSetores;

                  if (!diffPayload && !setoresMudaram) {
                    showToast.info('Nenhuma alteração para salvar.');
                    setSavingTipo(false);
                    if (saveTimeoutId !== null) clearTimeout(saveTimeoutId);
                    setShowTipoModal(false);
                    setEditingTipo(null);
                    return;
                  }

                  payload = diffPayload || {}; // Pode ser vazio se apenas os setores mudaram
                } else {
                  payload = {
                    ...buildTipoPayload(editingTipo),
                    codigo: codigoNormalizado,
                  };
                }

                console.log(
                  '[SalvarTipo] Enviando %s %s — categoria=%s validade=%s',
                  method,
                  url,
                  payload.categoria,
                  payload.validade,
                );

                // ⚠️ AbortController com timeout para fetch — evita promise pendente eterna
                const abortController = new AbortController();
                const fetchTimeoutId = setTimeout(() => abortController.abort(), SAVE_TIMEOUT_MS);

                const response = await fetchWithAuth(url, {
                  method,
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload),
                  signal: abortController.signal,
                });

                clearTimeout(fetchTimeoutId);

                console.log(
                  '[SalvarTipo] Resposta recebida — status=%d, ok=%s',
                  response.status,
                  response.ok,
                );

                if (response.ok) {
                  const responseJson = (await response.json().catch(() => null)) as {
                    data?: TipoUpdateResponseData;
                  } | null;
                  const savedTipoId = String(responseJson?.data?.id || editingTipo.id || '').trim();

                  if (!savedTipoId) {
                    showToast.error('Tipo salvo sem ID de retorno.');
                    return;
                  }

                  const setoresResponse = await fetchWithAuth(
                    `${apiUrl}/qualificacoes/tipos/${savedTipoId}/setores`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        setor_ids: (editingTipo.setor_ids || [])
                          .map((value) => Number(value))
                          .filter((value) => Number.isInteger(value) && value > 0),
                      }),
                      signal: abortController.signal,
                    },
                  );

                  if (!setoresResponse.ok) {
                    const setorErr = await setoresResponse.json().catch(() => null);
                    showToast.error(setorErr?.error || 'Erro ao salvar setores do modelo');
                    return;
                  }

                  getTipoRelatedCachePatterns().forEach((pattern) =>
                    clearApiCacheByPattern(pattern),
                  );
                  clearApiCacheByPattern('/api/lms/cursos');
                  clearApiCacheByPattern('/api/lms/stats');
                  await queryClient.invalidateQueries({
                    queryKey: ['lms', 'cursos'],
                    exact: false,
                  });
                  await queryClient.invalidateQueries({ queryKey: lmsKeys.adminStats() });
                  showToast.success(buildTipoSaveSuccessMessage(responseJson?.data, isEdit));

                  // Atualização otimista: reflete o valor salvo na tabela IMEDIATAMENTE,
                  // antes mesmo do refetch concluir. Isso corrige o bug de "validade antiga
                  // na tabela e no modal ao reabrir".
                  const tipoIdStr = String(editingTipo.id);
                  const optimisticUpdate: Partial<TipoQualificacao> = {};
                  // Sempre propagar validade, incluindo null (limpar vencimento).
                  optimisticUpdate.validade = editingTipo.validade ?? null;
                  // Outros campos que podem ter mudado e afetam a visualização da tabela
                  if (editingTipo.nome?.trim()) {
                    optimisticUpdate.nome = editingTipo.nome.trim();
                  }
                  if (editingTipo.codigo?.trim()) {
                    optimisticUpdate.codigo = editingTipo.codigo.trim();
                  }
                  if (editingTipo.categoria?.trim()) {
                    optimisticUpdate.categoria = editingTipo.categoria.trim();
                  }
                  setTipoUpdates((prev) => ({ ...prev, [tipoIdStr]: optimisticUpdate }));

                  setShowTipoModal(false);
                  setEditingTipo(null);
                  try {
                    await Promise.all([refetchTipos(), carregarHistorico(), carregarStats()]);
                    setTipoUpdates((prev) => {
                      const next = { ...prev };
                      delete next[tipoIdStr];
                      return next;
                    });
                  } catch (e) {
                    logger.warn(
                      '[Qualificacoes] refetchTipos falhou — usando optimistic update',
                      e,
                    );
                    showToast.warning(
                      'Dados salvos, mas histórico ou indicadores podem ainda estar desatualizados.',
                    );
                  }
                } else {
                  const err = await response.json().catch(() => null);
                  console.error('[SalvarTipo] erro response', err);
                  showToast.error(
                    err?.error ||
                      (response.status === 409
                        ? `Código já existe: ${codigoNormalizado}`
                        : 'Erro ao salvar modelo'),
                  );
                }
              } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                  console.error('[SalvarTipo] Fetch abortado por timeout');
                  showToast.error('Operação excedeu o tempo limite. Tente novamente.');
                } else {
                  console.error('[SalvarTipo] erro', error);
                  showToast.error(
                    error instanceof TypeError
                      ? 'Erro de conexão. Verifique sua rede.'
                      : 'Erro ao salvar modelo',
                  );
                }
              } finally {
                if (saveTimeoutId !== null) {
                  clearTimeout(saveTimeoutId);
                }
                setSavingTipo(false);
              }
            }}
            submitLabel="Salvar"
            loading={savingTipo}
            submitDisabled={savingTipo || !canManageTipos}
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField label="Nome" required>
              <TextInput
                placeholder="Ex: CRM - Crew Resource Management"
                value={editingTipo?.nome || ''}
                onChange={(e) =>
                  setEditingTipo((prev) => ({
                    ...(prev || {
                      id: '',
                      nome: '',
                      codigo: '',
                      categoria: '',
                      validade: null,
                      ativo: 1,
                      vencimento_fim_mes: 0,
                      conteudo_programatico: null,
                      carga_horaria: null,
                      carga_horaria_inicial: null,
                      carga_horaria_recorrente: null,
                      is_check: 0,
                    }),
                    nome: (e.target as HTMLInputElement).value,
                  }))
                }
              />
            </FormField>
          </div>

          <FormField label="Código" required>
            <TextInput
              placeholder="Ex: CRM"
              value={editingTipo?.codigo || ''}
              onChange={(e) =>
                setEditingTipo((prev) => ({
                  ...(prev || {
                    id: '',
                    nome: '',
                    codigo: '',
                    categoria: '',
                    validade: null,
                    ativo: 1,
                    vencimento_fim_mes: 0,
                    conteudo_programatico: null,
                    carga_horaria: null,
                    carga_horaria_inicial: null,
                    carga_horaria_recorrente: null,
                    is_check: 0,
                  }),
                  codigo: (e.target as HTMLInputElement).value,
                }))
              }
            />
          </FormField>

          <FormField label="Categoria" required>
            <Select
              value={editingTipo?.categoria || ''}
              onChange={(e) => {
                const selectedNome = (e.target as HTMLSelectElement).value;
                const selectedCat = categorias.find((c) => c.nome === selectedNome);
                setEditingTipo((prev) => ({
                  ...(prev || {
                    id: '',
                    nome: '',
                    codigo: '',
                    categoria: '',
                    validade: null,
                    ativo: 1,
                    vencimento_fim_mes: 0,
                    conteudo_programatico: null,
                    carga_horaria: null,
                    carga_horaria_inicial: null,
                    carga_horaria_recorrente: null,
                    is_check: 0,
                  }),
                  categoria: selectedNome,
                  categoria_id: selectedCat?.id ?? undefined,
                }));
              }}
              options={[
                { value: '', label: '-- Selecione uma categoria --' },
                ...categorias.map((cat) => ({
                  value: cat.nome,
                  label: cat.nome,
                })),
              ]}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField label="Setores">
              {setorOptionsTipos.length <= 1 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {setorOptionsTipos[0]?.label || 'Transversal'}
                </div>
              ) : (
                <MultiSelect
                  options={setorOptionsTipos}
                  selected={(editingTipo?.setor_ids || []).map((id) => String(id))}
                  onChange={(selected) =>
                    setEditingTipo((prev) =>
                      prev
                        ? {
                            ...prev,
                            setor_ids: selected
                              .map((value) => Number(value))
                              .filter((value) => Number.isInteger(value) && value > 0),
                          }
                        : prev,
                    )
                  }
                  placeholder="Transversal"
                  allLabel="Transversal"
                />
              )}
              <p className="mt-1 text-xs text-slate-500">
                Sem setor vinculado, o modelo fica transversal.
              </p>
            </FormField>
          </div>

          <FormField label="Validade (meses)">
            <TextInput
              type="number"
              min={1}
              placeholder="Ex: 12 (deixe vazio para sem validade)"
              value={editingTipo?.validade?.toString() || ''}
              onChange={(e) =>
                setEditingTipo((prev) =>
                  prev
                    ? {
                        ...prev,
                        validade: (e.target as HTMLInputElement).value
                          ? parseInt((e.target as HTMLInputElement).value, 10)
                          : null,
                      }
                    : prev,
                )
              }
            />
            <p className="mt-1 text-xs text-slate-500">
              Em meses. Deixe vazio para qualificação sem vencimento (indeterminada). Use um valor
              positivo (ex: 12, 24, 36).
            </p>
          </FormField>

          <FormField label="Carga Horária Inicial (h)">
            <TextInput
              type="number"
              placeholder="Ex: 16"
              value={editingTipo?.carga_horaria_inicial?.toString() || ''}
              onChange={(e) =>
                setEditingTipo((prev) =>
                  prev
                    ? {
                        ...prev,
                        carga_horaria_inicial: (e.target as HTMLInputElement).value
                          ? Number((e.target as HTMLInputElement).value)
                          : null,
                      }
                    : prev,
                )
              }
            />
          </FormField>

          <FormField label="Carga Horária Periódico / Semestral (h)">
            <TextInput
              type="number"
              placeholder="Ex: 8"
              value={editingTipo?.carga_horaria_recorrente?.toString() || ''}
              onChange={(e) =>
                setEditingTipo((prev) =>
                  prev
                    ? {
                        ...prev,
                        carga_horaria_recorrente: (e.target as HTMLInputElement).value
                          ? Number((e.target as HTMLInputElement).value)
                          : null,
                      }
                    : prev,
                )
              }
            />
          </FormField>

          <FormField label="Vencimento">
            <Select
              value={editingTipo?.vencimento_fim_mes?.toString() || '0'}
              onChange={(e) =>
                setEditingTipo((prev) =>
                  prev
                    ? {
                        ...prev,
                        vencimento_fim_mes: parseInt((e.target as HTMLSelectElement).value, 10),
                      }
                    : prev,
                )
              }
              options={[
                { value: '0', label: 'No dia exato' },
                { value: '1', label: 'No fim do mês' },
              ]}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField label="Descrição">
              <TextArea
                rows={2}
                placeholder="Descrição resumida do modelo de qualificação..."
                value={editingTipo?.descricao || ''}
                onChange={(e) =>
                  setEditingTipo((prev) =>
                    prev ? { ...prev, descricao: (e.target as HTMLTextAreaElement).value } : prev,
                  )
                }
              />
            </FormField>
          </div>

          <div className="md:col-span-2">
            <FormField label="Conteúdo Programático">
              <TextArea
                rows={5}
                placeholder="Liste o conteúdo programático que deve aparecer no certificado..."
                value={editingTipo?.conteudo_programatico || ''}
                onChange={(e) =>
                  setEditingTipo((prev) =>
                    prev
                      ? {
                          ...prev,
                          conteudo_programatico: (e.target as HTMLTextAreaElement).value,
                        }
                      : prev,
                  )
                }
              />
            </FormField>
          </div>
        </div>
      </Modal>

      {historicoSelecionado && historicoSelecionado.id && (
        <CertificadoModalLoader
          isOpen={showCertModal}
          onClose={() => {
            setShowCertModal(false);
            setHistoricoSelecionado(null);
          }}
          onCertificadosChange={handleCertificadosChange}
          qualificacao={{
            id: historicoSelecionado.id,
            funcionario_id: historicoSelecionado.funcionario_id,
            funcionario_nome: historicoSelecionado.funcionario_nome || '',
            matricula: historicoSelecionado.funcionario_matricula || '',
            qualificacao_nome:
              historicoSelecionado.qualificacao_nome ||
              String((historicoSelecionado as unknown as Record<string, unknown>).tipo_nome || ''),
            codigo:
              historicoSelecionado.qualificacao_codigo ||
              String(
                (historicoSelecionado as unknown as Record<string, unknown>).tipo_codigo ||
                  historicoSelecionado.codigo ||
                  '',
              ),
            data_conclusao:
              historicoSelecionado.data_conclusao || historicoSelecionado.data_realizacao || '',
            instrutor: historicoSelecionado.instrutor,
          }}
          onUploadSuccess={handleCertificadosUploadSuccess}
          onDeleteSuccess={handleCertificadosDeleteSuccess}
        />
      )}

      {/* Modal de Confirmação de Delete */}
      <ConfirmDeleteModal
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
        onConfirm={async () => {
          await handleConfirmDelete();
        }}
        message="Tem certeza que deseja deletar esta qualificação?"
        itemName={showConfirmDelete?.nome || ''}
        loading={deletandoId !== null}
      />

      {/* Modal de Alerta EAD */}
      {alertaEADModal.isOpen && alertaEADModal.qualificacao && (
        <ModalAlertaEAD
          isOpen={alertaEADModal.isOpen}
          onClose={() => setAlertaEADModal({ isOpen: false, qualificacao: null })}
          qualificacao={alertaEADModal.qualificacao}
        />
      )}
    </AppLayout>
  );
}
