// src/react-app/pages/escalas/EscalaPageContext.tsx
//
// Provides all page-level state, queries, mutations, derived values, and handlers
// for the Escalas module. Consumed by EscalasListagemView and EscalasDetalheView.

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useModuloBus } from '@/react-app/lib/useModuloBus';
import {
  fetchApi,
  mutateApi,
  escalasKeys,
  refreshEscalaLookupQueries,
} from './hooks/queries/useEscalasQuery';
import { useEscalaStore } from './hooks/useEscalaStore';
import { useTiposEventoResolvidos } from './hooks/useTiposEventoResolvidos';
import {
  useEscalasQuery,
  useEscalaAlocacoesQuery,
  useEscalaCalendarioQuery,
  useEscalaCoberturaQuery,
  useEscalaCoberturaTripulantesQuery,
  useEscalaConflitosQuery,
  useEscalaMutations,
  useAeronavesQuery,
  useQuinzenasQuery,
} from './hooks/queries/useEscalasQuery';
import type {
  EscalaAlocacao,
  EscalaCoberturaAeronave,
  StatusEscala,
  QuinzenaEscala,
  EscalaTripulacao,
  EscalaEvento,
} from './hooks/queries/useEscalasQuery';
import { STATUS_CONFIG } from './utils/statusConfig';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { canManageEscalaOperations } from './utils/operationalPermissions';
import { isValidQuinzenaRange } from './utils/quinzenaValidation';

export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
export const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

// ── Context value type ────────────────────────────────────────────────────────

export interface EscalaPageCtxValue {
  // Auth
  user: ReturnType<typeof useAuth>['user'];
  podeGerenciarOperacoes: boolean;
  navigate: ReturnType<typeof useNavigate>;

  // Zustand store (re-exposed for convenience in views)
  escalaAtualId: string | null;
  resetEscalaState: (id: string | null, status?: string) => void;
  filtroNome: string;
  setFiltroNome: (v: string) => void;
  filtroAeronave: string | null;
  setFiltroAeronave: (v: string | null) => void;
  filtroTripulante: string | null;
  setFiltroTripulante: (v: string | null) => void;
  filtroQuinzena: 'todas' | 'q1' | 'q2';
  setFiltroQuinzena: (v: 'todas' | 'q1' | 'q2') => void;
  visaoGrade: string;
  setVisaoGrade: (v: string) => void;
  highlightAlocacao: string | null;
  setHighlightAlocacao: (v: string | null) => void;
  visaoContinua: boolean;
  toggleVisaoContinua: () => void;
  modoEdicao: boolean;
  setModoEdicao: (v: boolean) => void;
  painelAberto: string | null;
  setPainelAberto: (v: string | null) => void;
  modalAberto: ReturnType<typeof useEscalaStore>['modalAberto'];
  abrirModal: ReturnType<typeof useEscalaStore>['abrirModal'];
  fecharModal: () => void;
  limparSelecao: () => void;
  tiposEventoVisiveis: string[];
  toggleTipoEvento: (tipo: string) => void;
  mostrarTodosOsTipos: (tipos?: string[]) => void;
  configMap: ReturnType<typeof useTiposEventoResolvidos>['configMap'];
  tiposAtivos: ReturnType<typeof useTiposEventoResolvidos>['tiposAtivos'];

  // Local page state
  filtroAno: number;
  setFiltroAno: React.Dispatch<React.SetStateAction<number>>;
  filtroStatus: StatusEscala | 'todos';
  setFiltroStatus: (v: StatusEscala | 'todos') => void;
  filtroModeloAeronave: string | null;
  setFiltroModeloAeronave: (v: string | null) => void;
  filtroAeronaveSelecionado: string | null;
  filtroModeloSelecionado: string | null;
  painelQuinzenas: boolean;
  setPainelQuinzenas: (v: boolean) => void;
  editandoQuinzenas: Record<number, { data_inicio: string; data_fim: string }>;
  setEditandoQuinzenas: React.Dispatch<
    React.SetStateAction<Record<number, { data_inicio: string; data_fim: string }>>
  >;
  savingQid: number | null;
  setSavingQid: (v: number | null) => void;
  gerandoAno: boolean;
  setGerandoAno: (v: boolean) => void;
  fdpModalAberto: boolean;
  setFdpModalAberto: (v: boolean) => void;
  compartilhandoView: boolean;
  setCompartilhandoView: (v: boolean) => void;
  showVistaTripulante: boolean;
  setShowVistaTripulante: (v: boolean) => void;
  showComparacao: boolean;
  setShowComparacao: (v: boolean) => void;
  revisaoComparacaoNum: number | null;
  setRevisaoComparacaoNum: (v: number | null) => void;
  maisMenuAberto: boolean;
  setMaisMenuAberto: React.Dispatch<React.SetStateAction<boolean>>;
  addMenuAberto: boolean;
  setAddMenuAberto: (v: boolean) => void;
  sincronizandoGrade: boolean;
  setSincronizandoGrade: (v: boolean) => void;
  onboardingFechado: boolean;
  setOnboardingFechado: (v: boolean) => void;
  confirmarExcluirId: string | null;
  setConfirmarExcluirId: (v: string | null) => void;
  confirmarRemoverAlocacao: { escalaId: string; alocacaoId: string; nome: string } | null;
  setConfirmarRemoverAlocacao: (
    v: { escalaId: string; alocacaoId: string; nome: string } | null,
  ) => void;
  confirmarRemoverSituacao: { escalaId: string; situacaoId: string; nome: string } | null;
  setConfirmarRemoverSituacao: (
    v: { escalaId: string; situacaoId: string; nome: string } | null,
  ) => void;

  // Queries
  escalas: ReturnType<typeof useEscalasQuery>['data'];
  loadingLista: boolean;
  refetchLista: () => void;
  dadosCalendario: ReturnType<typeof useEscalaCalendarioQuery>['data'];
  loadingCalendario: boolean;
  refetchCalendario: () => void;
  refetchAlocacoes: () => void;
  refetchCobertura: () => void;
  refetchCoberturaTripulantes: () => void;
  refetchQuinzenas: () => void;
  conflitosData: ReturnType<typeof useEscalaConflitosQuery>['data'];
  snapshotComparacao:
    | {
        tripulacoes: EscalaTripulacao[];
        eventos: EscalaEvento[];
        savedAt: string;
        revisao?: number;
        publicado_em?: string | null;
      }
    | null
    | undefined;

  // Mutations
  alterarStatus: ReturnType<typeof useEscalaMutations>['alterarStatus'];
  removerEvento: ReturnType<typeof useEscalaMutations>['removerEvento'];
  deletarEscala: ReturnType<typeof useEscalaMutations>['deletarEscala'];
  removerTripulacao: ReturnType<typeof useEscalaMutations>['removerTripulacao'];
  removerAlocacaoOperacional: ReturnType<typeof useEscalaMutations>['removerAlocacaoOperacional'];
  regenerarEventosTripulacao: ReturnType<typeof useEscalaMutations>['regenerarEventosTripulacao'];
  mutating: boolean;

  // Derived values
  escalaAtual: NonNullable<ReturnType<typeof useEscalaCalendarioQuery>['data']>['escala'] | null;
  alocacoesOperacionais: EscalaAlocacao[];
  alocacoesOperacionaisVisiveis: EscalaAlocacao[];
  coberturaOperacional: EscalaCoberturaAeronave[];
  coberturaOperacionalFiltrada: EscalaCoberturaAeronave[];
  coberturaTripulantes: ReturnType<typeof useEscalaCoberturaTripulantesQuery>['data'] | null;
  tripulantesCobertura: NonNullable<
    ReturnType<typeof useEscalaCoberturaTripulantesQuery>['data']
  >['tripulantes'];
  tripulantesCoberturaFiltrados: NonNullable<
    ReturnType<typeof useEscalaCoberturaTripulantesQuery>['data']
  >['tripulantes'];
  resumoCoberturaTripulantes: {
    total: number;
    completos: number;
    parciais: number;
    livres: number;
    pendentes: number;
  };
  tripulanteModalSelecionado:
    | NonNullable<
        ReturnType<typeof useEscalaCoberturaTripulantesQuery>['data']
      >['tripulantes'][number]
    | null;
  tripulanteInicialAlocacao:
    | NonNullable<
        ReturnType<typeof useEscalaCoberturaTripulantesQuery>['data']
      >['tripulantes'][number]
    | null;
  aeronavesAtivas: NonNullable<ReturnType<typeof useAeronavesQuery>['data']>;
  aeronavesAtivasIds: Set<string>;
  aeronavesComTripulacao: Set<string>;
  modelosAeronaveDisponiveis: string[];
  quinzenas: QuinzenaEscala[];
  prevEscala: NonNullable<ReturnType<typeof useEscalasQuery>['data']>[number] | null;
  nextEscala: NonNullable<ReturnType<typeof useEscalasQuery>['data']>[number] | null;
  statusConf: (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG] | null;
  totalPilotos: number;
  totalEventos: number;
  totalConflitos: number;
  escalaSemTripulacao: boolean;
  exibirAcoesOperacionais: boolean;
  fdpAlertas: { nome: string; diasVoo: number; maxConsec: number; alerta: string }[];
  aeronavePainelDisponibilidade: string | null;

  // Handlers
  handleSaveQuinzena: (
    q: QuinzenaEscala,
    vals: { data_inicio: string; data_fim: string },
  ) => Promise<void>;
  abrirVistaTripulante: () => Promise<void>;
  abrirEscala: (id: string | null, status?: string) => void;
  abrirAlocacaoTripulante: (payload?: {
    aeronaveLabel?: string | null;
    funcao?: string;
    aeronaveId?: string | number | null;
    modoGestaoAeronave?: boolean;
    modoFluxoB?: boolean;
    funcionarioInicialId?: string | null;
    quinzenaId?: number;
    dataInicioInicial?: string;
    dataFimInicial?: string;
  }) => void;
  abrirSituacao: (
    situacaoId?: string,
    payload?: {
      funcionarioInicialId?: string | null;
      quinzenaInicial?: number;
      dataInicioInicial?: string;
      dataFimInicial?: string;
      modoFluxoB?: boolean;
    },
  ) => void;
  abrirSelecaoTripulante: () => void;
  abrirDecisaoTripulante: (payload: {
    tripulanteId: string;
    quinzenaNumero?: 1 | 2;
    quinzenaId?: number;
    dataInicio?: string;
    dataFim?: string;
  }) => void;
  focarAlocacaoAeronave: (alocacao: {
    aeronave?: string | null;
    aeronave_id?: number | string | null;
  }) => void;
  sincronizarGradeEscala: () => Promise<void>;
  regenerarEventosBase: (tripulacaoIds: string[], nome: string) => Promise<void>;
  handleAlterarStatus: (justificativa?: string) => Promise<void>;
  handleRepublicar: (justificativa?: string) => Promise<void>;
  handleTransicaoStatus: (novoStatus: StatusEscala, justificativa?: string) => Promise<void>;
  handleRemoverEvento: (eventoId: string) => Promise<void>;
  handleEventoRemovido: () => Promise<void>;
  handleRemoverSituacao: (escalaId: string, situacaoId: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const EscalaPageContext = createContext<EscalaPageCtxValue | null>(null);

export function useEscalaPageCtx(): EscalaPageCtxValue {
  const ctx = useContext(EscalaPageContext);
  if (!ctx) throw new Error('useEscalaPageCtx must be used inside EscalaPageProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function EscalaPageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const podeGerenciarOperacoes = canManageEscalaOperations(user?.role);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const {
    escalaAtualId,
    resetEscalaState,
    filtroNome,
    setFiltroNome,
    filtroAeronave,
    setFiltroAeronave,
    filtroTripulante,
    setFiltroTripulante,
    filtroQuinzena,
    setFiltroQuinzena,
    visaoGrade,
    setVisaoGrade,
    highlightAlocacao,
    setHighlightAlocacao,
    visaoContinua,
    toggleVisaoContinua,
    modoEdicao,
    setModoEdicao,
    painelAberto,
    setPainelAberto,
    modalAberto,
    abrirModal,
    fecharModal,
    limparSelecao,
    tiposEventoVisiveis,
    toggleTipoEvento,
    mostrarTodosOsTipos,
  } = useEscalaStore();
  const { configMap, tiposAtivos } = useTiposEventoResolvidos();

  // Sync tiposEventoVisiveis with DB-driven tiposAtivos on first load.
  // Ensures any custom/new types are shown by default.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (tiposAtivos.length === 0) return;
    if (syncedRef.current) return;
    syncedRef.current = true;
    const visiveis = tiposEventoVisiveis;
    const missing = tiposAtivos.filter((c) => !visiveis.includes(c));
    if (missing.length > 0) {
      mostrarTodosOsTipos([...visiveis, ...missing]);
    }
  }, [tiposAtivos, tiposEventoVisiveis, mostrarTodosOsTipos]);

  // ── Local state ────────────────────────────────────────────────────────────
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear());
  const [filtroStatus, setFiltroStatus] = useState<StatusEscala | 'todos'>('todos');
  const [filtroModeloAeronave, setFiltroModeloAeronave] = useState<string | null>(null);
  const [painelQuinzenas, setPainelQuinzenas] = useState(false);
  const [editandoQuinzenas, setEditandoQuinzenas] = useState<
    Record<number, { data_inicio: string; data_fim: string }>
  >({});
  const [savingQid, setSavingQid] = useState<number | null>(null);
  const [gerandoAno, setGerandoAno] = useState(false);
  const [fdpModalAberto, setFdpModalAberto] = useState(false);
  const [compartilhandoView, setCompartilhandoView] = useState(false);
  const [showVistaTripulante, setShowVistaTripulante] = useState(false);
  const [showComparacao, setShowComparacao] = useState(false);
  const [revisaoComparacaoNum, setRevisaoComparacaoNum] = useState<number | null>(null);
  const [maisMenuAberto, setMaisMenuAberto] = useState(false);
  const [addMenuAberto, setAddMenuAberto] = useState(false);
  const [sincronizandoGrade, setSincronizandoGrade] = useState(false);
  const [onboardingFechado, setOnboardingFechado] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('escala-onboarding-alocar-v1') === '1';
  });
  const [confirmarExcluirId, setConfirmarExcluirId] = useState<string | null>(null);
  const [confirmarRemoverAlocacao, setConfirmarRemoverAlocacao] = useState<{
    escalaId: string;
    alocacaoId: string;
    nome: string;
  } | null>(null);
  const [confirmarRemoverSituacao, setConfirmarRemoverSituacao] = useState<{
    escalaId: string;
    situacaoId: string;
    nome: string;
  } | null>(null);

  const filtroAeronaveSelecionado =
    typeof filtroAeronave === 'string' && filtroAeronave.trim().length > 0
      ? filtroAeronave.trim()
      : null;
  const filtroModeloSelecionado =
    typeof filtroModeloAeronave === 'string' && filtroModeloAeronave.trim().length > 0
      ? filtroModeloAeronave.trim()
      : null;

  useEffect(() => {
    if (!escalaAtualId) return;
    setMaisMenuAberto(false);
    setAddMenuAberto(false);
    limparSelecao();
  }, [escalaAtualId, limparSelecao]);

  useEffect(() => () => resetEscalaState(null), [resetEscalaState]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const {
    data: escalas,
    loading: loadingLista,
    refetch: refetchLista,
  } = useEscalasQuery({
    ano: filtroAno,
    status: filtroStatus !== 'todos' ? filtroStatus : undefined,
  });

  const {
    data: dadosCalendario,
    loading: loadingCalendario,
    refetch: refetchCalendario,
  } = useEscalaCalendarioQuery(escalaAtualId, visaoContinua);

  const { data: alocacoesData, refetch: refetchAlocacoes } = useEscalaAlocacoesQuery(escalaAtualId);
  const { data: coberturaData, refetch: refetchCobertura } = useEscalaCoberturaQuery(escalaAtualId);
  const { data: coberturaTripulantesData, refetch: refetchCoberturaTripulantes } =
    useEscalaCoberturaTripulantesQuery(escalaAtualId);

  const alocacoesOperacionais = useMemo<EscalaAlocacao[]>(() => {
    if (alocacoesData?.alocacoes) return alocacoesData.alocacoes;
    return dadosCalendario?.alocacoes || [];
  }, [alocacoesData?.alocacoes, dadosCalendario?.alocacoes]);

  const coberturaOperacional = useMemo<EscalaCoberturaAeronave[]>(
    () => coberturaData?.aeronaves || [],
    [coberturaData?.aeronaves],
  );

  const coberturaTripulantes = coberturaTripulantesData || null;

  const aeronavePainelDisponibilidade = useMemo(() => {
    if (filtroAeronaveSelecionado) return filtroAeronaveSelecionado;
    if (filtroModeloSelecionado) return filtroModeloSelecionado;
    const comGap = coberturaOperacional.find((a) => a.resumo.gaps > 0);
    if (comGap) return comGap.prefixo || comGap.modelo || null;
    const p = alocacoesOperacionais[0];
    return p?.aeronave_prefixo || p?.aeronave_modelo || null;
  }, [
    alocacoesOperacionais,
    coberturaOperacional,
    filtroAeronaveSelecionado,
    filtroModeloSelecionado,
  ]);

  useModuloBus(
    useCallback(() => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: escalasKeys.all }),
        refreshEscalaLookupQueries(queryClient),
      ]);
    }, [queryClient]),
  );

  const { data: conflitosData } = useEscalaConflitosQuery(escalaAtualId);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const {
    alterarStatus,
    removerEvento,
    deletarEscala,
    removerTripulacao,
    removerAlocacaoOperacional,
    regenerarEventosTripulacao,
    loading: mutating,
  } = useEscalaMutations();

  const { data: aeronavesData } = useAeronavesQuery();
  const aeronavesAtivas = useMemo(
    () => (aeronavesData || []).filter((a) => a.status === 'ATIVO'),
    [aeronavesData],
  );
  const aeronavesAtivasIds = useMemo(
    () => new Set(aeronavesAtivas.map((a) => String(a.id))),
    [aeronavesAtivas],
  );
  const escalaAtual = dadosCalendario?.escala ?? null;

  const { data: quinzenasData, refetch: refetchQuinzenas } = useQuinzenasQuery(
    dadosCalendario?.escala?.ano ?? new Date().getFullYear(),
  );
  const quinzenas = useMemo(() => quinzenasData || [], [quinzenasData]);

  const snapshotUrl =
    showComparacao && escalaAtual?.id
      ? revisaoComparacaoNum !== null
        ? `/api/escalas/${escalaAtual.id}/revisoes/${revisaoComparacaoNum}`
        : `/api/escalas/${escalaAtual.id}/snapshot-publicado`
      : '';
  const { data: snapshotComparacao } = useQuery<{
    tripulacoes: EscalaTripulacao[];
    eventos: EscalaEvento[];
    savedAt: string;
    revisao?: number;
    publicado_em?: string | null;
  } | null>({
    queryKey: ['escalas', 'snapshot', escalaAtual?.id, revisaoComparacaoNum],
    queryFn: () => fetchApi(snapshotUrl),
    enabled: !!snapshotUrl,
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const alocacoesOperacionaisVisiveis = useMemo(
    () =>
      alocacoesOperacionais.filter(
        (a) => a.aeronave_id == null || aeronavesAtivasIds.has(String(a.aeronave_id)),
      ),
    [aeronavesAtivasIds, alocacoesOperacionais],
  );

  const metadadosAlocacaoPorId = useMemo(
    () =>
      new Map(
        alocacoesOperacionaisVisiveis.map((alocacao) => [
          alocacao.id,
          {
            prefixo: alocacao.aeronave_prefixo || alocacao.aeronave?.prefixo || null,
            modelo:
              alocacao.modelo_aeronave ||
              alocacao.aeronave_modelo ||
              alocacao.aeronave?.modelo ||
              null,
          },
        ]),
      ),
    [alocacoesOperacionaisVisiveis],
  );

  const aeronavesComTripulacao = useMemo(
    () =>
      new Set(
        alocacoesOperacionaisVisiveis
          .map((a) => a.aeronave_prefixo ?? a.aeronave_modelo ?? '')
          .filter(Boolean),
      ),
    [alocacoesOperacionaisVisiveis],
  );

  const modelosAeronaveDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(aeronavesAtivas.map((a) => (a.modelo || '').trim()).filter((m) => m.length > 0)),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [aeronavesAtivas],
  );

  const coberturaOperacionalFiltrada = useMemo(
    () =>
      coberturaOperacional.filter((a) => {
        if (!aeronavesAtivasIds.has(String(a.aeronave_id))) return false;
        const prefixo = (a.prefixo || '').trim();
        const modelo = (a.modelo || '').trim();
        const matchesAeronave =
          !filtroAeronaveSelecionado ||
          prefixo.localeCompare(filtroAeronaveSelecionado, 'pt-BR', { sensitivity: 'base' }) === 0;
        const matchesModelo =
          !filtroModeloSelecionado ||
          modelo.localeCompare(filtroModeloSelecionado, 'pt-BR', { sensitivity: 'base' }) === 0;
        return matchesAeronave && matchesModelo;
      }),
    [aeronavesAtivasIds, coberturaOperacional, filtroAeronaveSelecionado, filtroModeloSelecionado],
  );

  const tripulantesCobertura = useMemo(
    () => coberturaTripulantes?.tripulantes || [],
    [coberturaTripulantes?.tripulantes],
  );

  const tripulantesCoberturaFiltrados = useMemo(() => {
    const normalize = (value: string | null | undefined) =>
      String(value || '')
        .trim()
        .toLowerCase();
    const termo = (filtroTripulante || filtroNome || '').trim().toLowerCase();
    return tripulantesCobertura.filter((t) => {
      const alocacoesTripulante = [t.alocacao_q1, t.alocacao_q2].filter(Boolean);
      const matchesAeronave =
        !filtroAeronaveSelecionado ||
        alocacoesTripulante.some((alocacao) => {
          const meta = alocacao?.id ? metadadosAlocacaoPorId.get(alocacao.id) : null;
          return [alocacao?.aeronave, meta?.prefixo]
            .map((a) => normalize(a))
            .some((a) => a.length > 0 && a === normalize(filtroAeronaveSelecionado));
        });
      if (!matchesAeronave) return false;
      const matchesModelo =
        !filtroModeloSelecionado ||
        alocacoesTripulante.some((alocacao) => {
          const meta = alocacao?.id ? metadadosAlocacaoPorId.get(alocacao.id) : null;
          return normalize(meta?.modelo) === normalize(filtroModeloSelecionado);
        }) ||
        (t.modelos_habilitados || []).some((m) => {
          const normalizeModelo = (v: string | null | undefined) => {
            const s = String(v || '')
              .trim()
              .toUpperCase()
              .replace(/[\s-]+/g, '');
            if (s.includes('SK76') || s.includes('S76')) return 'sk76';
            if (s.includes('AW139')) return 'aw139';
            return s.toLowerCase();
          };
          return normalizeModelo(m) === normalizeModelo(filtroModeloSelecionado);
        });
      if (!matchesModelo) return false;
      if (!termo) return true;
      return [t.nome, t.nome_guerra || '', t.matricula || '']
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  }, [
    filtroAeronaveSelecionado,
    filtroModeloSelecionado,
    filtroNome,
    filtroTripulante,
    metadadosAlocacaoPorId,
    tripulantesCobertura,
  ]);

  const resumoCoberturaTripulantes = useMemo(() => {
    const total = tripulantesCoberturaFiltrados.length;
    const completos = tripulantesCoberturaFiltrados.filter(
      (t) => t.status_geral === 'completo',
    ).length;
    const parciais = tripulantesCoberturaFiltrados.filter(
      (t) => t.status_geral === 'parcial',
    ).length;
    const livres = tripulantesCoberturaFiltrados.filter((t) => t.status_geral === 'livre').length;
    return { total, completos, parciais, livres, pendentes: parciais + livres };
  }, [tripulantesCoberturaFiltrados]);

  const tripulanteModalSelecionado = useMemo(() => {
    if (modalAberto?.tipo !== 'alocar-tripulante') return null;
    return tripulantesCobertura.find((t) => t.id === modalAberto.tripulanteId) || null;
  }, [modalAberto, tripulantesCobertura]);

  const tripulanteInicialAlocacao = useMemo(() => {
    if (modalAberto?.tipo !== 'adicionar-alocacao') return null;
    const fid = modalAberto.funcionarioInicialId;
    if (!fid) return null;
    return tripulantesCobertura.find((t) => t.id === fid) || null;
  }, [modalAberto, tripulantesCobertura]);

  const fdpAlertas = useMemo(() => {
    if (!dadosCalendario) return [];
    type Alerta = { nome: string; diasVoo: number; maxConsec: number; alerta: string };
    const alertas: Alerta[] = [];
    const { tripulacoes, eventos } = dadosCalendario;
    const pilotos = new Map<string, string>();
    tripulacoes.forEach((trip) => {
      if (trip.pic_id) pilotos.set(trip.pic_id, trip.pic_nome ?? '—');
      if (trip.sic_id) pilotos.set(trip.sic_id, trip.sic_nome ?? '—');
    });
    pilotos.forEach((nome, funcionarioId) => {
      const vooDias = eventos
        .filter((e) => e.funcionario_id === funcionarioId && e.tipo_evento === 'voo')
        .map((e) => e.data_inicio.slice(0, 10));
      const diasUnicos = [...new Set(vooDias)].sort();
      const total = diasUnicos.length;
      let maxConsec = 0;
      let consec = 1;
      for (let i = 1; i < diasUnicos.length; i++) {
        const prev = new Date(diasUnicos[i - 1]);
        const curr = new Date(diasUnicos[i]);
        const diff = (curr.getTime() - prev.getTime()) / 86400000;
        if (diff === 1) {
          consec++;
          maxConsec = Math.max(maxConsec, consec);
        } else {
          consec = 1;
        }
      }
      if (diasUnicos.length === 1) maxConsec = 1;
      const mensagens: string[] = [];
      if (total > 22) mensagens.push(`${total} dias voo no mês (limite ≈ 20)`);
      if (maxConsec >= 6) mensagens.push(`${maxConsec} dias consecutivos de voo`);
      if (mensagens.length > 0)
        alertas.push({ nome, diasVoo: total, maxConsec, alerta: mensagens.join(' • ') });
    });
    return alertas;
  }, [dadosCalendario]);

  const statusConf = escalaAtual ? STATUS_CONFIG[escalaAtual.status] : null;
  const totalPilotos = (() => {
    if (alocacoesOperacionais.length > 0) {
      return new Set(alocacoesOperacionais.map((a) => a.funcionario_id)).size;
    }
    const ids = new Set<string>();
    dadosCalendario?.tripulacoes?.forEach((t: EscalaTripulacao) => {
      if (t.pic_id) ids.add(t.pic_id);
      if (t.sic_id) ids.add(t.sic_id);
    });
    return ids.size;
  })();
  const totalEventos = dadosCalendario?.eventos.length ?? 0;
  const totalConflitos = conflitosData
    ? conflitosData.conflitos_eventos.length +
      conflitosData.conflitos_tripulacoes.length +
      conflitosData.restricoes_violadas.length +
      conflitosData.violacoes_compliance.length
    : 0;
  const escalaSemTripulacao =
    (dadosCalendario?.tripulacoes.length ?? 0) === 0 && alocacoesOperacionais.length === 0;
  const exibirAcoesOperacionais = modoEdicao && !loadingCalendario && !escalaSemTripulacao;

  const prevEscala = useMemo(() => {
    if (!escalaAtual || !escalas) return null;
    const { mes, ano } = escalaAtual;
    return (
      escalas.find(
        (e) =>
          (e.ano === ano && e.mes === mes - 1) || (e.ano === ano - 1 && mes === 1 && e.mes === 12),
      ) ?? null
    );
  }, [escalas, escalaAtual]);

  const nextEscala = useMemo(() => {
    if (!escalaAtual || !escalas) return null;
    const { mes, ano } = escalaAtual;
    return (
      escalas.find(
        (e) =>
          (e.ano === ano && e.mes === mes + 1) || (e.ano === ano + 1 && mes === 12 && e.mes === 1),
      ) ?? null
    );
  }, [escalas, escalaAtual]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSaveQuinzena = useCallback(
    async (q: QuinzenaEscala, vals: { data_inicio: string; data_fim: string }) => {
      if (!isValidQuinzenaRange(vals.data_inicio, vals.data_fim)) {
        toast.error('A data final da quinzena deve ser posterior à data inicial.');
        return;
      }
      setSavingQid(q.id);
      try {
        await mutateApi(`/api/escalas/quinzenas/${q.id}`, 'PUT', {
          data_inicio: vals.data_inicio,
          data_fim: vals.data_fim,
        });
        toast.success(`Q${q.numero} de ${MESES[q.mes - 1]} salva`);
        setEditandoQuinzenas((prev) => {
          const n = { ...prev };
          delete n[q.id];
          return n;
        });
        void refetchQuinzenas();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar quinzena');
      } finally {
        setSavingQid(null);
      }
    },
    [refetchQuinzenas],
  );

  const abrirVistaTripulante = useCallback(async () => {
    if (!escalaAtual) return;
    setCompartilhandoView(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/escalas/${escalaAtual.id}/export?format=html`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error || `Erro ao gerar visão tripulante (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) toast.info('Popup bloqueado. Tente novamente ou ajuste as configurações.');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao abrir visão tripulante');
    } finally {
      setCompartilhandoView(false);
    }
  }, [escalaAtual]);

  const abrirEscala = useCallback(
    (id: string | null, status?: string) => {
      resetEscalaState(id, status);
    },
    [resetEscalaState],
  );

  const abrirAlocacaoTripulante = useCallback(
    (payload?: {
      aeronaveLabel?: string | null;
      funcao?: string;
      aeronaveId?: string | number | null;
      modoGestaoAeronave?: boolean;
      modoFluxoB?: boolean;
      funcionarioInicialId?: string | null;
      quinzenaId?: number;
      dataInicioInicial?: string;
      dataFimInicial?: string;
    }) => {
      if (!escalaAtual) return;
      localStorage.setItem('escala-onboarding-alocar-v1', '1');
      setOnboardingFechado(true);
      setMaisMenuAberto(false);
      setAddMenuAberto(false);
      abrirModal({
        tipo: 'adicionar-alocacao',
        escalaId: escalaAtual.id,
        aeronaveInicial: payload?.aeronaveLabel ?? null,
        aeronaveIdInicial: payload?.aeronaveId ?? null,
        modoGestaoAeronave: payload?.modoGestaoAeronave ?? false,
        modoFluxoB: payload?.modoFluxoB ?? false,
        funcionarioInicialId: payload?.funcionarioInicialId ?? null,
        funcaoInicial:
          (payload?.funcao as
            | 'PIC'
            | 'SIC'
            | 'PIC_CHK'
            | 'SIC_CHK'
            | 'INSTRUTOR'
            | 'FLEX'
            | undefined) ?? 'PIC',
        quinzenaInicial: payload?.quinzenaId,
        dataInicioInicial: payload?.dataInicioInicial,
        dataFimInicial: payload?.dataFimInicial,
      });
    },
    [abrirModal, escalaAtual],
  );

  const abrirSituacao = useCallback(
    (
      situacaoId?: string,
      payload?: {
        funcionarioInicialId?: string | null;
        quinzenaInicial?: number;
        dataInicioInicial?: string;
        dataFimInicial?: string;
        modoFluxoB?: boolean;
      },
    ) => {
      if (!escalaAtual) return;
      setMaisMenuAberto(false);
      setAddMenuAberto(false);
      abrirModal({
        tipo: 'nova-situacao',
        escalaId: escalaAtual.id,
        situacaoId,
        modoFluxoB: payload?.modoFluxoB,
        funcionarioInicialId: payload?.funcionarioInicialId,
        quinzenaInicial: payload?.quinzenaInicial,
        dataInicioInicial: payload?.dataInicioInicial,
        dataFimInicial: payload?.dataFimInicial,
      });
    },
    [abrirModal, escalaAtual],
  );

  const abrirSelecaoTripulante = useCallback(() => {
    if (!escalaAtual) return;
    abrirModal({ tipo: 'selecionar-tripulante', escalaId: escalaAtual.id });
  }, [abrirModal, escalaAtual]);

  const abrirDecisaoTripulante = useCallback(
    (payload: {
      tripulanteId: string;
      quinzenaNumero?: 1 | 2;
      quinzenaId?: number;
      dataInicio?: string;
      dataFim?: string;
    }) => {
      if (!escalaAtual) return;
      abrirModal({
        tipo: 'alocar-tripulante',
        escalaId: escalaAtual.id,
        tripulanteId: payload.tripulanteId,
        quinzenaNumero: payload.quinzenaNumero,
        quinzenaId: payload.quinzenaId,
        dataInicio: payload.dataInicio,
        dataFim: payload.dataFim,
      });
    },
    [abrirModal, escalaAtual],
  );

  const focarAlocacaoAeronave = useCallback(
    (alocacao: { aeronave?: string | null; aeronave_id?: number | string | null }) => {
      setVisaoGrade('aeronave');
      setFiltroAeronave(
        typeof alocacao.aeronave === 'string' && alocacao.aeronave.trim().length > 0
          ? alocacao.aeronave.trim()
          : null,
      );
      if (alocacao.aeronave_id != null) {
        const highlightId = String(alocacao.aeronave_id);
        setHighlightAlocacao(highlightId);
        window.setTimeout(() => setHighlightAlocacao(null), 3000);
      }
    },
    [setFiltroAeronave, setHighlightAlocacao, setVisaoGrade],
  );

  const sincronizarGradeEscala = useCallback(async () => {
    setSincronizandoGrade(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: escalasKeys.detail(escalaAtualId || '__none__'),
        }),
        queryClient.invalidateQueries({
          queryKey: escalasKeys.calendarios(escalaAtualId || '__none__'),
        }),
        queryClient.invalidateQueries({
          queryKey: escalasKeys.conflitos(escalaAtualId || '__none__'),
        }),
        queryClient.invalidateQueries({ queryKey: escalasKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: escalasKeys.alocacoes(escalaAtualId || '__none__'),
        }),
        queryClient.invalidateQueries({
          queryKey: escalasKeys.cobertura(escalaAtualId || '__none__'),
        }),
        queryClient.invalidateQueries({
          queryKey: escalasKeys.coberturaTripulantes(escalaAtualId || '__none__'),
        }),
        refreshEscalaLookupQueries(queryClient),
      ]);
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: escalasKeys.detail(escalaAtualId || '__none__'),
          type: 'active',
        }),
        queryClient.refetchQueries({
          queryKey: escalasKeys.calendarios(escalaAtualId || '__none__'),
          type: 'active',
        }),
        queryClient.refetchQueries({
          queryKey: escalasKeys.conflitos(escalaAtualId || '__none__'),
          type: 'active',
        }),
        queryClient.refetchQueries({ queryKey: escalasKeys.lists(), type: 'active' }),
        queryClient.refetchQueries({
          queryKey: escalasKeys.alocacoes(escalaAtualId || '__none__'),
          type: 'active',
        }),
        queryClient.refetchQueries({
          queryKey: escalasKeys.cobertura(escalaAtualId || '__none__'),
          type: 'active',
        }),
        queryClient.refetchQueries({
          queryKey: escalasKeys.coberturaTripulantes(escalaAtualId || '__none__'),
          type: 'active',
        }),
        refetchCalendario(),
        refetchAlocacoes(),
        refetchCobertura(),
        refetchCoberturaTripulantes(),
        refetchLista(),
      ]);
    } finally {
      setSincronizandoGrade(false);
    }
  }, [
    escalaAtualId,
    queryClient,
    refetchAlocacoes,
    refetchCalendario,
    refetchCobertura,
    refetchCoberturaTripulantes,
    refetchLista,
  ]);

  const regenerarEventosBase = useCallback(
    async (tripulacaoIds: string[], nome: string) => {
      if (!escalaAtual || tripulacaoIds.length === 0) return;
      try {
        setSincronizandoGrade(true);
        for (const tripulacaoId of tripulacaoIds) {
          await regenerarEventosTripulacao(escalaAtual.id, tripulacaoId);
        }
        toast.success(`Eventos VOO/FOL gerados com sucesso para ${nome}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao gerar eventos base');
      } finally {
        await Promise.all([refetchCalendario(), refetchLista()]);
        setSincronizandoGrade(false);
      }
    },
    [escalaAtual, regenerarEventosTripulacao, refetchCalendario, refetchLista],
  );

  const handleTransicaoStatus = useCallback(
    async (novoStatus: StatusEscala, justificativa?: string) => {
      if (!escalaAtual) return;
      try {
        await alterarStatus(escalaAtual.id, novoStatus, justificativa, escalaAtual.ano);
        const labelNovoStatus = STATUS_CONFIG[novoStatus]?.label?.toLowerCase() ?? novoStatus;
        toast.success(`Escala ${labelNovoStatus}!`);
        await Promise.all([refetchCalendario(), refetchLista()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao alterar status');
      }
    },
    [alterarStatus, escalaAtual, refetchCalendario, refetchLista],
  );

  const handleAlterarStatus = useCallback(
    async (justificativa?: string) => {
      if (!escalaAtual || !statusConf?.next) return;
      await handleTransicaoStatus(statusConf.next, justificativa);
    },
    [escalaAtual, handleTransicaoStatus, statusConf],
  );

  const handleRepublicar = useCallback(
    async (justificativa?: string) => {
      if (!escalaAtual || escalaAtual.status !== 'publicada') return;
      try {
        await alterarStatus(escalaAtual.id, 'publicada', justificativa, escalaAtual.ano);
        toast.success('Nova revisão publicada com sucesso!');
        await Promise.all([refetchCalendario(), refetchLista()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao publicar revisão');
      }
    },
    [alterarStatus, escalaAtual, refetchCalendario, refetchLista],
  );

  const handleRemoverEvento = useCallback(
    async (eventoId: string) => {
      if (!escalaAtual) return;
      try {
        await removerEvento(escalaAtual.id, eventoId);
        toast.success('Evento removido');
        refetchCalendario();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao remover evento');
      }
    },
    [escalaAtual, refetchCalendario, removerEvento],
  );

  const handleEventoRemovido = useCallback(async () => {
    await refetchCalendario();
  }, [refetchCalendario]);

  const handleRemoverSituacao = useCallback(
    async (escalaId: string, situacaoId: string) => {
      await mutateApi(`/api/escalas/${escalaId}/situacoes/${situacaoId}`, 'DELETE');
      await Promise.all([
        refetchCalendario(),
        refetchAlocacoes(),
        refetchCobertura(),
        refetchCoberturaTripulantes(),
      ]);
    },
    [refetchAlocacoes, refetchCalendario, refetchCobertura, refetchCoberturaTripulantes],
  );

  // ── Context value ──────────────────────────────────────────────────────────
  const value: EscalaPageCtxValue = {
    user,
    podeGerenciarOperacoes,
    navigate,
    // Zustand
    escalaAtualId,
    resetEscalaState,
    filtroNome,
    setFiltroNome,
    filtroAeronave,
    setFiltroAeronave,
    filtroTripulante,
    setFiltroTripulante,
    filtroQuinzena,
    setFiltroQuinzena,
    visaoGrade,
    setVisaoGrade,
    highlightAlocacao,
    setHighlightAlocacao,
    visaoContinua,
    toggleVisaoContinua,
    modoEdicao,
    setModoEdicao,
    painelAberto,
    setPainelAberto,
    modalAberto,
    abrirModal,
    fecharModal,
    limparSelecao,
    tiposEventoVisiveis,
    toggleTipoEvento,
    mostrarTodosOsTipos,
    configMap,
    tiposAtivos,
    // Local state
    filtroAno,
    setFiltroAno,
    filtroStatus,
    setFiltroStatus,
    filtroModeloAeronave,
    setFiltroModeloAeronave,
    filtroAeronaveSelecionado,
    filtroModeloSelecionado,
    painelQuinzenas,
    setPainelQuinzenas,
    editandoQuinzenas,
    setEditandoQuinzenas,
    savingQid,
    setSavingQid,
    gerandoAno,
    setGerandoAno,
    fdpModalAberto,
    setFdpModalAberto,
    compartilhandoView,
    setCompartilhandoView,
    showVistaTripulante,
    setShowVistaTripulante,
    showComparacao,
    setShowComparacao,
    revisaoComparacaoNum,
    setRevisaoComparacaoNum,
    maisMenuAberto,
    setMaisMenuAberto,
    addMenuAberto,
    setAddMenuAberto,
    sincronizandoGrade,
    setSincronizandoGrade,
    onboardingFechado,
    setOnboardingFechado,
    confirmarExcluirId,
    setConfirmarExcluirId,
    confirmarRemoverAlocacao,
    setConfirmarRemoverAlocacao,
    confirmarRemoverSituacao,
    setConfirmarRemoverSituacao,
    // Queries
    escalas,
    loadingLista,
    refetchLista,
    dadosCalendario,
    loadingCalendario,
    refetchCalendario,
    refetchAlocacoes,
    refetchCobertura,
    refetchCoberturaTripulantes,
    refetchQuinzenas,
    conflitosData,
    snapshotComparacao,
    // Mutations
    alterarStatus,
    removerEvento,
    deletarEscala,
    removerTripulacao,
    removerAlocacaoOperacional,
    regenerarEventosTripulacao,
    mutating,
    // Derived
    escalaAtual,
    alocacoesOperacionais,
    alocacoesOperacionaisVisiveis,
    coberturaOperacional,
    coberturaOperacionalFiltrada,
    coberturaTripulantes,
    tripulantesCobertura,
    tripulantesCoberturaFiltrados,
    resumoCoberturaTripulantes,
    tripulanteModalSelecionado,
    tripulanteInicialAlocacao,
    aeronavesAtivas,
    aeronavesAtivasIds,
    aeronavesComTripulacao,
    modelosAeronaveDisponiveis,
    quinzenas,
    prevEscala,
    nextEscala,
    statusConf,
    totalPilotos,
    totalEventos,
    totalConflitos,
    escalaSemTripulacao,
    exibirAcoesOperacionais,
    fdpAlertas,
    aeronavePainelDisponibilidade,
    // Handlers
    handleSaveQuinzena,
    abrirVistaTripulante,
    abrirEscala,
    abrirAlocacaoTripulante,
    abrirSituacao,
    abrirSelecaoTripulante,
    abrirDecisaoTripulante,
    focarAlocacaoAeronave,
    sincronizarGradeEscala,
    regenerarEventosBase,
    handleAlterarStatus,
    handleRepublicar,
    handleTransicaoStatus,
    handleRemoverEvento,
    handleEventoRemovido,
    handleRemoverSituacao,
  };

  return <EscalaPageContext.Provider value={value}>{children}</EscalaPageContext.Provider>;
}
