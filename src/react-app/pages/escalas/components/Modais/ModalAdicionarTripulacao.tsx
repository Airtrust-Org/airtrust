// FIX: [BUG 3] - Quinzena selection now applies the real quinzena date range while preserving custom edits unless the user changes the preset.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Plane, ShieldCheck, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { cn } from '@/react-app/lib/utils';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import {
  ApiRequestError,
  useAeronavesQuery,
  useEscalaMutations,
  useTripulantesOperacionaisQuery,
  type Aeronave,
  type EscalaAlocacao,
  type QuinzenaEscala,
  type TripulanteOperacional,
} from '../../hooks/queries/useEscalasQuery';
import {
  SEM_AERONAVE_LABEL,
  SEM_AERONAVE_VALUE,
  isSemAeronaveValue,
} from '../../alocacao-operacional-constants';
import { getFuncaoVisualToken } from '../../funcao-tokens';
import {
  fmtDateRange,
  fmtDateShort,
  getQuinzenaBadgeClasses,
  getQuinzenaShortLabel,
} from '../../quinzena-tokens';
import { Q1, Q2 } from '../../constants/escalaTokens';
import {
  formatarAeronave,
  formatarResumoConflitoSubstituicao,
  normalizeText,
  normalizeModeloOperacional,
  getFuncaoPreferidaFluxoB,
  isFuncaoCompativelFluxoB,
  funcaoExigeComandante,
  isTripulanteCompativelComFuncao,
  intervaloSobrepoe,
  inferirModoPeriodo,
  getQuinzenaSelecionada,
  getQuinzenaPreset,
  getQuinzenaFiltro,
  getAvisoQuinzenaCruzada,
  normalizeQuinzena,
  getQuinzenaLabel,
  getResumoAlocacaoExistente,
  buildFallbackTripulante,
} from './tripulacao-utils';

const FUNCOES = [
  { value: 'PIC', label: 'PIC' },
  { value: 'SIC', label: 'SIC' },
  { value: 'PIC_CHK', label: 'PIC CHK' },
  { value: 'SIC_CHK', label: 'SIC CHK' },
  { value: 'INSTRUTOR', label: 'Instrutor' },
  { value: 'FLEX', label: 'Flex' },
] as const;

type FuncaoAlocacao = (typeof FUNCOES)[number]['value'];
type PeriodoModo = '1q' | '2q' | 'custom';

interface Props {
  escalaId: string;
  mes: number;
  ano: number;
  escalaStatus?: string;
  quinzenas?: QuinzenaEscala[];
  aeronaveInicial?: string | null;
  aeronaveIdInicial?: string | number | null;
  modoGestaoAeronave?: boolean;
  modoFluxoB?: boolean;
  funcionarioInicialId?: string | null;
  tripulanteInicial?: TripulanteOperacional | null;
  funcaoInicial?: FuncaoAlocacao;
  quinzenaInicial?: number;
  dataInicioInicial?: string;
  dataFimInicial?: string;
  alocacaoId?: string | null;
  alocacaoInicial?: EscalaAlocacao;
  alocacoesExistentes?: EscalaAlocacao[];
  onSaved?: (result?: { id?: string; eventos_gerados?: number }) => Promise<void> | void;
  onIniciarRevisao?: () => void;
  onClose: () => void;
}

type SlotGerencialDraft = {
  slotKey: string;
  alocacaoId: string | null;
  funcionarioId: string;
  funcionarioNome: string;
  funcionarioNomeGuerra: string | null;
  funcao: 'PIC' | 'SIC';
  quinzenaId: number;
  dataInicio: string;
  dataFim: string;
  observacoes: string;
  cmaOverride: boolean;
};

type ConflitoSubstituivel = Parameters<typeof formatarResumoConflitoSubstituicao>[0];

async function confirmarSubstituicaoExistente(resumo: string) {
  return confirmDialog(
    `${resumo}. Se você confirmar, a alocação/situação existente será substituída por esta nova alocação.`,
    {
      title: 'Substituir alocação existente?',
      confirmText: 'Substituir e continuar',
      cancelText: 'Cancelar',
    },
  );
}

export default function ModalAdicionarTripulacao({
  escalaId,
  mes,
  ano,
  escalaStatus,
  quinzenas,
  aeronaveInicial,
  aeronaveIdInicial,
  modoGestaoAeronave = false,
  modoFluxoB = false,
  funcionarioInicialId = null,
  tripulanteInicial = null,
  funcaoInicial = 'PIC',
  quinzenaInicial,
  dataInicioInicial,
  dataFimInicial,
  alocacaoId,
  alocacaoInicial,
  alocacoesExistentes = [],
  onSaved,
  onIniciarRevisao,
  onClose,
}: Props) {
  const modoEdicao = Boolean(alocacaoId);
  const { data: aeronavesRaw } = useAeronavesQuery();
  const aeronaves = useMemo(
    () =>
      (aeronavesRaw || []).filter(
        (item) =>
          String(item.status || 'ATIVO')
            .trim()
            .toUpperCase() === 'ATIVO',
      ),
    [aeronavesRaw],
  );
  const {
    adicionarAlocacaoOperacional,
    salvarLoteAlocacoesOperacionais,
    atualizarAlocacaoOperacional,
    removerAlocacaoOperacional,
    loading,
  } = useEscalaMutations();

  const [alocacaoGerenciadaId, setAlocacaoGerenciadaId] = useState<string | null>(
    alocacaoId || null,
  );

  const alocacaoSelecionada =
    alocacoesExistentes.find((a) => String(a.id) === String(alocacaoGerenciadaId)) ||
    alocacaoInicial ||
    null;

  const fallbackTripulanteFuncionarioInicial = useMemo(
    () =>
      buildFallbackTripulante(
        alocacoesExistentes.find((item) => item.funcionario_id === funcionarioInicialId) || null,
      ),
    [alocacoesExistentes, funcionarioInicialId],
  );

  const fallbackTripulante = useMemo(
    () => buildFallbackTripulante(alocacaoInicial || undefined),
    [alocacaoInicial],
  );

  const tripulanteInicialFluxoB = useMemo(() => {
    if (tripulanteInicial) return tripulanteInicial;
    if (!modoFluxoB) return null;
    if (fallbackTripulante?.funcionario_id === funcionarioInicialId) return fallbackTripulante;
    if (fallbackTripulanteFuncionarioInicial?.funcionario_id === funcionarioInicialId) {
      return fallbackTripulanteFuncionarioInicial;
    }
    if (!funcionarioInicialId) {
      return fallbackTripulanteFuncionarioInicial || fallbackTripulante;
    }

    return {
      funcionario_id: funcionarioInicialId,
      nome: 'Tripulante selecionado',
      nome_guerra: null,
      matricula: '—',
      empresa_id: 0,
      role: funcaoInicial === 'SIC' ? 'copiloto' : 'comandante',
      cma_valido: true,
      cma_dias_restantes: null,
      cma_validade_fim: null,
      frms_score: null,
      frms_status: null,
      frms_avaliacao_data: null,
      simuladores_pendentes: 0,
      proximo_simulador_data: null,
      habilitacoes: [],
      status_operacional: 'APTO',
      pode_ser_alocado: true,
      ja_alocado_nesta_escala: false,
      motivo_bloqueio: null,
      ja_alocado_em: null,
      quinzena: null,
    } satisfies TripulanteOperacional;
  }, [
    fallbackTripulante,
    fallbackTripulanteFuncionarioInicial,
    funcionarioInicialId,
    funcaoInicial,
    modoFluxoB,
    tripulanteInicial,
  ]);

  const [aeronaveId, setAeronaveId] = useState<string>(
    alocacaoSelecionada?.aeronave_id
      ? String(alocacaoSelecionada.aeronave_id)
      : aeronaveIdInicial
        ? String(aeronaveIdInicial)
        : '',
  );
  const [funcao, setFuncao] = useState<FuncaoAlocacao>(
    alocacaoSelecionada?.funcao || funcaoInicial,
  );
  const [funcionarioId, setFuncionarioId] = useState<string>(
    modoFluxoB
      ? funcionarioInicialId || alocacaoSelecionada?.funcionario_id || ''
      : modoGestaoAeronave
        ? ''
        : alocacaoSelecionada?.funcionario_id || '',
  );
  const [pendingCmaFuncionarioId, setPendingCmaFuncionarioId] = useState<string | null>(null);
  const [cmaOverrideConfirmado, setCmaOverrideConfirmado] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aguardandoRevisao, setAguardandoRevisao] = useState(false);
  const [dataInicio, setDataInicio] = useState<string>(
    alocacaoSelecionada?.data_inicio || dataInicioInicial || '',
  );
  const [dataFim, setDataFim] = useState<string>(
    alocacaoSelecionada?.data_fim || dataFimInicial || '',
  );
  const [observacoes, setObservacoes] = useState<string>(alocacaoSelecionada?.observacoes || '');
  const funcaoVisual = getFuncaoVisualToken(funcao);
  const [periodoModo, setPeriodoModo] = useState<PeriodoModo>(() => {
    if (alocacaoSelecionada?.data_inicio) {
      return inferirModoPeriodo(
        alocacaoSelecionada.data_inicio,
        alocacaoSelecionada.data_fim,
        quinzenas,
        mes,
      );
    }
    if (quinzenaInicial) {
      const q = (quinzenas || []).find((item) => item.id === quinzenaInicial);
      if (q) return q.numero === 1 ? '1q' : '2q';
    }
    return '1q';
  });

  function aplicarPeriodoPreset(modo: Exclude<PeriodoModo, 'custom'>) {
    setPeriodoModo(modo);
    const preset = getQuinzenaPreset(modo, quinzenas, mes);
    if (!preset) return;
    setDataInicio(preset.data_inicio);
    setDataFim(preset.data_fim);
  }

  useEffect(() => {
    if (modoEdicao || aeronaveId || aeronaves.length === 0) return;

    if (aeronaveIdInicial && isSemAeronaveValue(aeronaveIdInicial)) {
      setAeronaveId(SEM_AERONAVE_VALUE);
      return;
    }

    // Try direct ID match first (most reliable)
    if (aeronaveIdInicial) {
      const idStr = String(aeronaveIdInicial);
      const match = aeronaves.find((item) => String(item.id) === idStr);
      if (match) {
        setAeronaveId(String(match.id));
        return;
      }
    }

    // Fallback to label match
    if (!aeronaveInicial) return;
    const alvo = normalizeText(aeronaveInicial);
    const aeronave = aeronaves.find((item) => {
      const prefixo = normalizeText(item.prefixo);
      const modelo = normalizeText(item.modelo);
      const descricao = normalizeText(`${item.prefixo || ''} ${item.modelo || ''}`);
      return alvo === prefixo || alvo === modelo || alvo === descricao;
    });

    if (aeronave) {
      setAeronaveId(String(aeronave.id));
    }
  }, [aeronaveId, aeronaveIdInicial, aeronaveInicial, aeronaves, modoEdicao]);

  useEffect(() => {
    if (!alocacaoSelecionada) return;
    setFuncao(alocacaoSelecionada.funcao);
    setDataInicio(alocacaoSelecionada.data_inicio);
    setDataFim(alocacaoSelecionada.data_fim);
    setObservacoes(alocacaoSelecionada.observacoes || '');
    setPeriodoModo(
      inferirModoPeriodo(
        alocacaoSelecionada.data_inicio,
        alocacaoSelecionada.data_fim,
        quinzenas,
        mes,
      ),
    );

    if (modoFluxoB) {
      setFuncionarioId(funcionarioInicialId || alocacaoSelecionada.funcionario_id);
    } else if (modoGestaoAeronave) {
      setFuncionarioId('');
    } else {
      setFuncionarioId(alocacaoSelecionada.funcionario_id);
    }
  }, [alocacaoSelecionada, funcionarioInicialId, mes, modoFluxoB, modoGestaoAeronave, quinzenas]);

  useEffect(() => {
    if (!modoFluxoB) return;
    if (!funcionarioInicialId) return;
    setFuncionarioId(funcionarioInicialId);
  }, [funcionarioInicialId, modoFluxoB]);

  useEffect(() => {
    if (periodoModo === 'custom') return;
    if (dataInicio && dataFim) return;
    const preset = getQuinzenaPreset(periodoModo, quinzenas, mes);
    if (!preset) return;
    setDataInicio(preset.data_inicio);
    setDataFim(preset.data_fim);
  }, [dataFim, dataInicio, periodoModo, quinzenas, mes]);

  const { data: tripulantesData, isLoading: carregandoTripulantes } =
    useTripulantesOperacionaisQuery(
      aeronaveId || null,
      escalaId,
      true,
      funcao,
      dataInicio || null,
      dataFim || null,
      getQuinzenaFiltro(periodoModo),
    );

  const semAeronaveSelecionada = isSemAeronaveValue(aeronaveId);

  useEffect(() => {
    if (!aeronaveId || semAeronaveSelecionada) return;
    if (aeronaves.some((item) => String(item.id) === aeronaveId)) return;
    setAeronaveId('');
  }, [aeronaveId, aeronaves, semAeronaveSelecionada]);

  const tripulantes = useMemo(() => {
    if (modoFluxoB) {
      return tripulanteInicialFluxoB ? [tripulanteInicialFluxoB] : [];
    }

    const items = [...(tripulantesData?.tripulantes || [])];
    if (
      fallbackTripulante &&
      !items.some((item) => item.funcionario_id === fallbackTripulante.funcionario_id)
    ) {
      items.unshift(fallbackTripulante);
    }

    const itemsUnicos = Array.from(
      items.reduce<Map<string, TripulanteOperacional>>((acc, item) => {
        if (!acc.has(item.funcionario_id)) {
          acc.set(item.funcionario_id, item);
        }
        return acc;
      }, new Map()),
    ).map(([, item]) => item);

    const quinzenaSelecionada = getQuinzenaFiltro(periodoModo);
    if (quinzenaSelecionada !== 'primeira' && quinzenaSelecionada !== 'segunda') {
      return itemsUnicos;
    }

    const matchesPreferenciais = itemsUnicos.filter((item) => {
      const quinzenaTripulante = normalizeQuinzena(item.quinzena);
      return (
        !quinzenaTripulante ||
        quinzenaTripulante === 'personalizada' ||
        quinzenaTripulante === quinzenaSelecionada
      );
    });

    return matchesPreferenciais.length > 0 ? matchesPreferenciais : itemsUnicos;
  }, [
    fallbackTripulante,
    modoFluxoB,
    periodoModo,
    tripulanteInicialFluxoB,
    tripulantesData?.tripulantes,
  ]);

  const aeronaveSelecionada = useMemo(
    () =>
      semAeronaveSelecionada
        ? null
        : aeronaves.find((item) => String(item.id) === aeronaveId) || null,
    [aeronaveId, aeronaves],
  );

  const tripulanteSelecionado = useMemo(
    () =>
      tripulantes.find((item) => item.funcionario_id === funcionarioId) ||
      tripulanteInicialFluxoB ||
      fallbackTripulante,
    [fallbackTripulante, funcionarioId, tripulanteInicialFluxoB, tripulantes],
  );

  const funcionarioAtualPermitidoId = alocacaoSelecionada?.funcionario_id || null;

  const conflitoLocal = useMemo(() => {
    if (!funcionarioId || !dataInicio || !dataFim) return null;

    return (
      alocacoesExistentes.find((item) => {
        if (modoEdicao && item.id === alocacaoId) return false;
        if (alocacaoSelecionada?.id && item.id === alocacaoSelecionada.id) return false;
        if (item.funcionario_id !== funcionarioId) return false;
        if (item.situacao_tipo === 'FOLGA') return false;
        return intervaloSobrepoe(item.data_inicio, item.data_fim, dataInicio, dataFim);
      }) || null
    );
  }, [
    alocacaoId,
    alocacaoSelecionada?.id,
    alocacoesExistentes,
    dataFim,
    dataInicio,
    funcionarioId,
    modoEdicao,
  ]);

  const conflitoLocalVisivel = Boolean(conflitoLocal) && !isSubmitting && !loading;

  useEffect(() => {
    if (!aguardandoRevisao || !escalaStatus || escalaStatus === 'publicada') return;

    setAguardandoRevisao(false);
    toast.success('Revisão iniciada. Continue a edição e salve as alterações.');
  }, [aguardandoRevisao, escalaStatus]);

  const slotsGerenciais = useMemo(() => {
    const quinzenasMes = (quinzenas || [])
      .filter((item) => item.mes === mes && item.ano === ano)
      .sort((a, b) => a.numero - b.numero);

    return quinzenasMes.flatMap((quinzena) =>
      (['PIC', 'SIC'] as const).map((slotFuncao) => {
        const atual = alocacoesExistentes.find((item) => {
          if (item.aeronave_id == null) return false;
          if (String(item.aeronave_id) !== String(aeronaveId)) return false;
          if (item.funcao !== slotFuncao) return false;
          if (item.quinzena_id === quinzena.id) return true;
          if (item.quinzena_id != null) return false;
          return intervaloSobrepoe(
            item.data_inicio,
            item.data_fim,
            quinzena.data_inicio,
            quinzena.data_fim,
          );
        });

        return {
          key: `${quinzena.id}-${slotFuncao}`,
          quinzena,
          funcao: slotFuncao,
          atual,
        };
      }),
    );
  }, [alocacoesExistentes, ano, aeronaveId, mes, quinzenas]);

  const slotsGerenciaisOrdenados = useMemo(() => {
    const ordemFuncao: Record<'PIC' | 'SIC', number> = { PIC: 0, SIC: 1 };
    return [...slotsGerenciais].sort((a, b) => {
      return ordemFuncao[a.funcao] - ordemFuncao[b.funcao] || a.quinzena.numero - b.quinzena.numero;
    });
  }, [slotsGerenciais]);

  const [slotEmEdicaoKey, setSlotEmEdicaoKey] = useState<string | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotGerencialDraft>>({});

  useEffect(() => {
    if (!modoGestaoAeronave || modoEdicao) return;
    setSlotDrafts({});
    setSlotEmEdicaoKey(null);
    setAlocacaoGerenciadaId(null);
    setFuncionarioId('');
    setObservacoes('');
    setCmaOverrideConfirmado(false);
  }, [aeronaveId, modoEdicao, modoGestaoAeronave]);

  const slotEmEdicao = useMemo(
    () => slotsGerenciaisOrdenados.find((slot) => slot.key === slotEmEdicaoKey) || null,
    [slotEmEdicaoKey, slotsGerenciaisOrdenados],
  );

  function construirRascunhoSlot(
    slot: (typeof slotsGerenciaisOrdenados)[number],
    overrides?: {
      funcionarioId?: string;
      tripulante?: TripulanteOperacional | null;
      observacoes?: string;
      cmaOverride?: boolean;
    },
  ): SlotGerencialDraft | null {
    const draftAtual = slotDrafts[slot.key];
    const funcionarioSelecionadoId =
      overrides?.funcionarioId ??
      (slot.key === slotEmEdicaoKey
        ? funcionarioId
        : (draftAtual?.funcionarioId ?? slot.atual?.funcionario_id ?? ''));
    const observacoesSelecionadas =
      overrides?.observacoes ??
      (slot.key === slotEmEdicaoKey
        ? observacoes
        : (draftAtual?.observacoes ?? slot.atual?.observacoes ?? ''));
    const cmaOverrideSelecionado =
      overrides?.cmaOverride ??
      (slot.key === slotEmEdicaoKey ? cmaOverrideConfirmado : (draftAtual?.cmaOverride ?? false));

    if (!funcionarioSelecionadoId) return null;

    const tripulanteRascunho =
      overrides?.tripulante ??
      (slot.key === slotEmEdicaoKey &&
      tripulanteSelecionado?.funcionario_id === funcionarioSelecionadoId
        ? tripulanteSelecionado
        : null) ??
      tripulantes.find((item) => item.funcionario_id === funcionarioSelecionadoId) ??
      null;

    const semMudancasPersistiveis =
      slot.atual?.funcionario_id === funcionarioSelecionadoId &&
      (slot.atual?.observacoes || '') === (observacoesSelecionadas || '') &&
      !cmaOverrideSelecionado;

    if (slot.atual?.id && semMudancasPersistiveis) return null;

    return {
      slotKey: slot.key,
      alocacaoId: slot.atual?.id || draftAtual?.alocacaoId || null,
      funcionarioId: funcionarioSelecionadoId,
      funcionarioNome:
        tripulanteRascunho?.nome ||
        draftAtual?.funcionarioNome ||
        slot.atual?.funcionario_nome ||
        'Tripulante',
      funcionarioNomeGuerra:
        tripulanteRascunho?.nome_guerra ||
        draftAtual?.funcionarioNomeGuerra ||
        slot.atual?.funcionario_guerra ||
        null,
      funcao: slot.funcao,
      quinzenaId: slot.quinzena.id,
      dataInicio: slot.quinzena.data_inicio,
      dataFim: slot.quinzena.data_fim,
      observacoes: observacoesSelecionadas || '',
      cmaOverride: cmaOverrideSelecionado,
    };
  }

  const slotDraftAtivo =
    modoGestaoAeronave && !modoEdicao && slotEmEdicao ? construirRascunhoSlot(slotEmEdicao) : null;

  const slotDraftsComAtual = useMemo(() => {
    if (!slotEmEdicao) return slotDrafts;

    if (slotDraftAtivo) {
      return { ...slotDrafts, [slotDraftAtivo.slotKey]: slotDraftAtivo };
    }

    if (!slotDrafts[slotEmEdicao.key]) return slotDrafts;

    const next = { ...slotDrafts };
    delete next[slotEmEdicao.key];
    return next;
  }, [slotDraftAtivo, slotDrafts, slotEmEdicao]);

  const rascunhosPendentes = useMemo(() => {
    const ordemFuncao: Record<'PIC' | 'SIC', number> = { PIC: 0, SIC: 1 };
    return Object.values(slotDraftsComAtual).sort((a, b) => {
      if (a.funcao !== b.funcao) return ordemFuncao[a.funcao] - ordemFuncao[b.funcao];
      return a.dataInicio.localeCompare(b.dataInicio);
    });
  }, [slotDraftsComAtual]);

  const slotsPreparados = useMemo(
    () =>
      slotsGerenciaisOrdenados.filter((slot) => slotDraftsComAtual[slot.key] || slot.atual?.id)
        .length,
    [slotDraftsComAtual, slotsGerenciaisOrdenados],
  );

  const conflitoRascunhosPendentes = useMemo(() => {
    for (let index = 0; index < rascunhosPendentes.length; index += 1) {
      for (
        let compareIndex = index + 1;
        compareIndex < rascunhosPendentes.length;
        compareIndex += 1
      ) {
        const atual = rascunhosPendentes[index];
        const comparado = rascunhosPendentes[compareIndex];
        if (atual.funcionarioId !== comparado.funcionarioId) continue;
        if (
          !intervaloSobrepoe(
            atual.dataInicio,
            atual.dataFim,
            comparado.dataInicio,
            comparado.dataFim,
          )
        ) {
          continue;
        }

        return `${atual.funcionarioNomeGuerra || atual.funcionarioNome} foi pré-salvo em slots sobrepostos.`;
      }
    }

    return null;
  }, [
    alocacaoId,
    alocacaoSelecionada?.id,
    alocacoesExistentes,
    modoEdicao,
    rascunhosPendentes,
    slotsGerenciaisOrdenados,
  ]);

  const quinzenaSelecionada = useMemo(
    () => getQuinzenaSelecionada(periodoModo, quinzenas, mes, dataInicio, dataFim),
    [periodoModo, quinzenas, mes, dataInicio, dataFim],
  );

  const avisoQuinzenaCruzada = useMemo(
    () => getAvisoQuinzenaCruzada(tripulanteSelecionado, getQuinzenaFiltro(periodoModo)),
    [periodoModo, tripulanteSelecionado],
  );

  const periodoResumo = fmtDateRange(dataInicio, dataFim);
  const tituloSlotSelecionado =
    `${quinzenaSelecionada?.numero || ''}${quinzenaSelecionada ? 'Q ' : ''}${funcao}`.trim();
  const podeSalvar = Boolean(
    aeronaveId &&
    (modoGestaoAeronave && !modoEdicao
      ? rascunhosPendentes.length > 0 && !conflitoRascunhosPendentes
      : funcao && funcionarioId && dataInicio && dataFim),
  );

  const slotsFluxoB = useMemo(() => {
    if (!modoFluxoB || !tripulanteSelecionado || !dataInicio || !dataFim) return [];

    const habilitacoes = new Set(
      (tripulanteSelecionado.habilitacoes || []).map((item) =>
        normalizeModeloOperacional(item.modelo_codigo),
      ),
    );
    const funcoesDisponiveis = (['PIC', 'SIC'] as const).filter((item) =>
      isFuncaoCompativelFluxoB(tripulanteSelecionado.role, item),
    );

    return aeronaves
      .filter((aeronave) => {
        if (habilitacoes.size === 0) return true;
        const modelo = normalizeModeloOperacional(aeronave.modelo || aeronave.prefixo);
        return !!modelo && habilitacoes.has(modelo);
      })
      .flatMap((aeronave) =>
        funcoesDisponiveis.map((slotFuncao) => {
          const atual = alocacoesExistentes.find((item) => {
            if (modoEdicao && item.id === alocacaoId) return false;
            if (alocacaoSelecionada?.id && item.id === alocacaoSelecionada.id) return false;
            if (item.aeronave_id == null) return false;
            if (String(item.aeronave_id) !== String(aeronave.id)) return false;
            if (item.funcao !== slotFuncao) return false;
            return intervaloSobrepoe(item.data_inicio, item.data_fim, dataInicio, dataFim);
          });

          return {
            key: `${aeronave.id}-${slotFuncao}`,
            aeronave,
            funcao: slotFuncao,
            atual: atual || null,
            selecionado: String(aeronave.id) === aeronaveId && funcao === slotFuncao,
          };
        }),
      )
      .sort((a, b) => {
        if (a.atual && !b.atual) return 1;
        if (!a.atual && b.atual) return -1;
        return formatarAeronave(a.aeronave.prefixo, a.aeronave.modelo).localeCompare(
          formatarAeronave(b.aeronave.prefixo, b.aeronave.modelo),
          'pt-BR',
        );
      });
  }, [
    aeronaveId,
    aeronaves,
    alocacaoId,
    alocacaoSelecionada,
    alocacoesExistentes,
    dataFim,
    dataInicio,
    funcao,
    modoEdicao,
    modoFluxoB,
    tripulanteSelecionado,
  ]);

  const slotFluxoBSelecionado = useMemo(
    () => slotsFluxoB.find((item) => item.selecionado) || null,
    [slotsFluxoB],
  );

  function aplicarSlotGerencial(
    slot: (typeof slotsGerenciais)[number],
    options?: { persistCurrentDraft?: boolean },
  ) {
    if (
      modoGestaoAeronave &&
      !modoEdicao &&
      options?.persistCurrentDraft !== false &&
      slotEmEdicao
    ) {
      const draftAtual = construirRascunhoSlot(slotEmEdicao);
      setSlotDrafts((current) => {
        const next = { ...current };
        if (draftAtual) next[slotEmEdicao.key] = draftAtual;
        else delete next[slotEmEdicao.key];
        return next;
      });
    }

    setSlotEmEdicaoKey(slot.key);
    setAlocacaoGerenciadaId(slot.atual?.id || null);
    setFuncao(slot.funcao);
    aplicarPeriodoPreset(slot.quinzena.numero === 1 ? '1q' : '2q');
    setDataInicio(slot.quinzena.data_inicio);
    setDataFim(slot.quinzena.data_fim);
    const draft = slotDrafts[slot.key];
    setObservacoes(draft?.observacoes ?? slot.atual?.observacoes ?? '');
    // Se o slot já tem um tripulante, mostra quem está lá.
    // Se o slot está vazio, preserva qualquer seleção já feita no painel direito.
    setFuncionarioId(draft?.funcionarioId ?? slot.atual?.funcionario_id ?? '');
    setCmaOverrideConfirmado(draft?.cmaOverride ?? false);
  }

  function aplicarSlotFluxoB(slot: (typeof slotsFluxoB)[number]) {
    setAeronaveId(String(slot.aeronave.id));
    setFuncao(slot.funcao);
    if (tripulanteSelecionado?.funcionario_id) {
      setFuncionarioId(tripulanteSelecionado.funcionario_id);
    }
  }

  useEffect(() => {
    if (!modoGestaoAeronave || modoEdicao || semAeronaveSelecionada) return;
    if (slotsGerenciaisOrdenados.length === 0) {
      setSlotEmEdicaoKey(null);
      return;
    }
    if (slotEmEdicaoKey && slotsGerenciaisOrdenados.some((slot) => slot.key === slotEmEdicaoKey)) {
      return;
    }

    const primeiroSlot = slotsGerenciaisOrdenados[0];
    const draft = slotDrafts[primeiroSlot.key];
    setSlotEmEdicaoKey(primeiroSlot.key);
    setAlocacaoGerenciadaId(primeiroSlot.atual?.id || null);
    setFuncao(primeiroSlot.funcao);
    aplicarPeriodoPreset(primeiroSlot.quinzena.numero === 1 ? '1q' : '2q');
    setDataInicio(primeiroSlot.quinzena.data_inicio);
    setDataFim(primeiroSlot.quinzena.data_fim);
    setObservacoes(draft?.observacoes ?? primeiroSlot.atual?.observacoes ?? '');
    setFuncionarioId(draft?.funcionarioId ?? primeiroSlot.atual?.funcionario_id ?? '');
    setCmaOverrideConfirmado(draft?.cmaOverride ?? false);
  }, [
    modoGestaoAeronave,
    modoEdicao,
    semAeronaveSelecionada,
    slotDrafts,
    slotEmEdicaoKey,
    slotsGerenciaisOrdenados,
  ]);

  function selecionarTripulanteSlot(
    tripulante: TripulanteOperacional,
    options?: { cmaOverride?: boolean },
  ) {
    setFuncionarioId(tripulante.funcionario_id);
    setCmaOverrideConfirmado(Boolean(options?.cmaOverride));

    if (!modoGestaoAeronave || modoEdicao || !slotEmEdicao) return;

    const draftAtual = construirRascunhoSlot(slotEmEdicao, {
      funcionarioId: tripulante.funcionario_id,
      tripulante,
      cmaOverride: Boolean(options?.cmaOverride),
    });

    setSlotDrafts((current) => {
      const next = { ...current };
      if (draftAtual) next[slotEmEdicao.key] = draftAtual;
      else delete next[slotEmEdicao.key];
      return next;
    });
  }

  async function handleRemover() {
    if (!alocacaoSelecionada?.id) return;

    try {
      await removerAlocacaoOperacional(escalaId, alocacaoSelecionada.id);
      toast.success('Alocação removida');
      await onSaved?.({ id: alocacaoSelecionada.id });

      if (modoGestaoAeronave) {
        setAlocacaoGerenciadaId(null);
        setFuncionarioId('');
        setObservacoes('');
        return;
      }

      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover alocação');
    }
  }

  async function handleSubmit() {
    if (!aeronaveId) {
      toast.error('Selecione a aeronave ou a opção sem aeronave');
      return;
    }
    const extrairConflitoErro = (error: unknown): ConflitoSubstituivel | null => {
      if (!(error instanceof ApiRequestError)) return null;
      const details =
        error.details && typeof error.details === 'object'
          ? (error.details as Record<string, unknown>)
          : null;
      const conflito = details?.conflito;
      if (!conflito || typeof conflito !== 'object') return null;
      return conflito as ConflitoSubstituivel;
    };

    const isErroSobreposicao = (error: unknown) =>
      error instanceof ApiRequestError && error.apiCode === 'SOBREPOSICAO_FUNCIONARIO';

    const obterResumoConfirmacao = (error: unknown, fallback?: ConflitoSubstituivel | null) => {
      const resumo = formatarResumoConflitoSubstituicao(
        extrairConflitoErro(error) || fallback || null,
      );
      if (resumo) return resumo;
      return error instanceof Error ? error.message : 'Já existe uma alocação sobreposta.';
    };

    const salvarLote = async (conflitoOverride = false): Promise<void> => {
      try {
        setIsSubmitting(true);
        const aeronaveIdPayload = semAeronaveSelecionada ? null : Number(aeronaveId);
        const modeloAeronavePayload = aeronaveSelecionada?.modelo || null;
        const result = await salvarLoteAlocacoesOperacionais(escalaId, {
          itens: rascunhosPendentes.map((draft) => ({
            slot_key: draft.slotKey,
            alocacao_id: draft.alocacaoId,
            funcionario_id: draft.funcionarioId,
            aeronave_id: aeronaveIdPayload,
            modelo_aeronave: modeloAeronavePayload,
            funcao: draft.funcao,
            data_inicio: draft.dataInicio,
            data_fim: draft.dataFim,
            observacoes: draft.observacoes || null,
            quinzena_id: draft.quinzenaId,
            ...(draft.cmaOverride ? { cma_override: 1 as const } : {}),
            ...(conflitoOverride ? { conflito_override: 1 as const } : {}),
          })),
        });

        const alertasLote = result?.alertas || [];
        const eventosGeradosLote = result?.eventos_gerados || 0;
        const ultimoId = [...(result?.alocacoes || [])]
          .reverse()
          .find((item) => Boolean(item?.id))?.id;

        toast.success(`${rascunhosPendentes.length} slots gravados`);
        for (const alerta of alertasLote) {
          toast.warning(alerta.detalhe);
        }
        await onSaved?.({ id: ultimoId, eventos_gerados: eventosGeradosLote });
        onClose();
      } catch (error) {
        if (!conflitoOverride && isErroSobreposicao(error)) {
          setIsSubmitting(false);
          const confirmou = await confirmarSubstituicaoExistente(obterResumoConfirmacao(error));
          if (confirmou) {
            await salvarLote(true);
          }
          return;
        }

        throw error;
      } finally {
        setIsSubmitting(false);
      }
    };

    const salvarIndividual = async (conflitoOverride = false): Promise<void> => {
      try {
        if (!conflitoOverride && conflitoLocal) {
          const confirmou = await confirmarSubstituicaoExistente(
            obterResumoConfirmacao(null, conflitoLocal),
          );
          if (!confirmou) return;
          conflitoOverride = true;
        }

        setIsSubmitting(true);
        const aeronaveIdPayload = semAeronaveSelecionada ? null : Number(aeronaveId);

        if ((modoEdicao && alocacaoId) || alocacaoSelecionada?.id) {
          const alvoId = alocacaoId || alocacaoSelecionada?.id;
          const result = await atualizarAlocacaoOperacional(escalaId, alvoId!, {
            funcionario_id: funcionarioId,
            funcao,
            data_inicio: dataInicio,
            data_fim: dataFim,
            observacoes: observacoes || null,
            quinzena_id: quinzenaSelecionada?.id ?? null,
            ...(conflitoOverride ? { conflito_override: 1 as const } : {}),
          });
          toast.success('Alocação atualizada');
          await onSaved?.({ id: result?.id });
          onClose();
        } else {
          const modeloAeronavePayload = aeronaveSelecionada?.modelo || null;
          const result = await adicionarAlocacaoOperacional(escalaId, {
            funcionario_id: funcionarioId,
            aeronave_id: aeronaveIdPayload,
            modelo_aeronave: modeloAeronavePayload,
            funcao,
            data_inicio: dataInicio,
            data_fim: dataFim,
            observacoes: observacoes || null,
            quinzena_id: quinzenaSelecionada?.id ?? null,
            ...(cmaOverrideConfirmado ? { cma_override: 1 as const } : {}),
            ...(conflitoOverride ? { conflito_override: 1 as const } : {}),
          });
          toast.success('Alocação criada');
          for (const alerta of result?.alertas || []) {
            toast.warning(alerta.detalhe);
          }
          await onSaved?.({ id: result?.alocacao?.id, eventos_gerados: result?.eventos_gerados });
          onClose();
        }
      } catch (error) {
        if (!conflitoOverride && isErroSobreposicao(error)) {
          setIsSubmitting(false);
          const confirmou = await confirmarSubstituicaoExistente(obterResumoConfirmacao(error));
          if (confirmou) {
            await salvarIndividual(true);
          }
          return;
        }

        throw error;
      } finally {
        setIsSubmitting(false);
      }
    };

    if (modoGestaoAeronave && !modoEdicao) {
      if (rascunhosPendentes.length === 0) {
        toast.error('Preencha pelo menos um slot antes de salvar');
        return;
      }
      if (conflitoRascunhosPendentes) {
        toast.error(conflitoRascunhosPendentes);
        return;
      }

      if (escalaStatus === 'publicada') {
        if (onIniciarRevisao) {
          setAguardandoRevisao(true);
          onIniciarRevisao();
        } else {
          toast.error('Escala publicada — inicie uma nova revisão antes de fazer alterações.', {
            duration: 5000,
          });
        }
        return;
      }

      try {
        await salvarLote(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao salvar alocações');
      }
      return;
    }
    if (!funcao) {
      toast.error('Selecione a função operacional');
      return;
    }
    if (!funcionarioId) {
      toast.error('Selecione o tripulante');
      return;
    }
    if (!dataInicio || !dataFim) {
      toast.error('Informe o período da alocação');
      return;
    }
    if (dataFim < dataInicio) {
      toast.error('A data final precisa ser maior ou igual à inicial');
      return;
    }

    try {
      await salvarIndividual(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar alocação');
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        modoEdicao
          ? 'Editar alocação operacional'
          : modoFluxoB
            ? `🚁 Alocar em aeronave${tripulanteSelecionado?.nome_guerra || tripulanteSelecionado?.nome ? ` · ${tripulanteSelecionado.nome_guerra || tripulanteSelecionado.nome}` : ''}`
            : modoGestaoAeronave
              ? `Gerenciar alocações${semAeronaveSelecionada ? ` · ${SEM_AERONAVE_LABEL}` : aeronaveSelecionada ? ` · ${formatarAeronave(aeronaveSelecionada.prefixo, aeronaveSelecionada.modelo)}` : ''}`
              : 'Nova alocação operacional'
      }
      size="5xl"
      footer={
        <>
          {alocacaoSelecionada?.id && !modoGestaoAeronave && (
            <Button variant="danger" onClick={handleRemover} disabled={loading}>
              <Trash2 className="mr-1 h-4 w-4" />
              Excluir alocação
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={loading || isSubmitting}>
            {modoGestaoAeronave ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button
            isLoading={loading || isSubmitting}
            onClick={handleSubmit}
            disabled={!podeSalvar || isSubmitting}
          >
            {modoGestaoAeronave && !modoEdicao
              ? `Salvar ${rascunhosPendentes.length} ${rascunhosPendentes.length === 1 ? 'slot' : 'slots'}`
              : modoEdicao || alocacaoSelecionada?.id
                ? 'Salvar alterações'
                : modoGestaoAeronave
                  ? 'Salvar e continuar'
                  : 'Confirmar alocação'}
          </Button>
        </>
      }
    >
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(300px,0.92fr)_minmax(0,1.08fr)]">
        {/* ── Coluna esquerda: Formulário ──────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {!modoFluxoB && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  <Plane className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Equipamento</span>
                </div>
                <select
                  value={aeronaveId}
                  onChange={(event) => setAeronaveId(event.target.value)}
                  disabled={modoEdicao}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Selecione o equipamento</option>
                  <option value={SEM_AERONAVE_VALUE}>{SEM_AERONAVE_LABEL}</option>
                  {/* Agrupa por modelo - mostra modelo como grupo, aeronaves como opções */}
                  {(() => {
                    const porModelo = new Map<string, typeof aeronaves>();
                    aeronaves.forEach((a) => {
                      const m = a.modelo || 'Outros';
                      if (!porModelo.has(m)) porModelo.set(m, []);
                      porModelo.get(m)!.push(a);
                    });
                    return Array.from(porModelo.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([modeloGrupo, aerosDoModelo]) => (
                        <optgroup key={modeloGrupo} label={modeloGrupo}>
                          {aerosDoModelo.map((aeronave) => (
                            <option key={aeronave.id} value={String(aeronave.id)}>
                              {aeronave.prefixo
                                ? `${aeronave.prefixo} (${aeronave.modelo})`
                                : aeronave.modelo}
                            </option>
                          ))}
                        </optgroup>
                      ));
                  })()}
                </select>
              </div>
            )}

            {modoGestaoAeronave &&
              !modoEdicao &&
              !semAeronaveSelecionada &&
              slotsGerenciais.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Slots da aeronave
                    </div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700">
                      {slotsPreparados}/{slotsGerenciaisOrdenados.length} preparados
                    </span>
                  </div>
                  {rascunhosPendentes.length > 0 && (
                    <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                      Os slots preenchidos ficam pré-salvos localmente. Use Salvar para gravar tudo
                      de uma vez e fechar o modal.
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {slotsGerenciaisOrdenados.map((slot) => {
                      const funcaoToken = getFuncaoVisualToken(slot.funcao);
                      const ativo = slotEmEdicaoKey === slot.key;
                      const draft = slotDraftsComAtual[slot.key];
                      const nomeSlot =
                        draft?.funcionarioNomeGuerra ||
                        draft?.funcionarioNome ||
                        slot.atual?.funcionario_guerra ||
                        slot.atual?.funcionario_nome ||
                        'Slot livre';
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => aplicarSlotGerencial(slot)}
                          className={`rounded-xl border px-3 py-2 text-left transition-colors ${ativo ? funcaoToken.selectedCardClassName : draft ? 'border-sky-300 bg-sky-50 text-slate-800 hover:bg-sky-100' : slot.atual ? 'border-emerald-200 bg-emerald-50 text-slate-800 hover:bg-emerald-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              {slot.quinzena.numero}Q
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativo ? 'bg-white/15 text-white' : funcaoToken.badgeClassName}`}
                            >
                              {slot.funcao}
                            </span>
                          </div>
                          <div
                            className={`mt-2 text-sm font-semibold ${ativo ? 'text-white' : 'text-slate-900'}`}
                          >
                            {nomeSlot}
                          </div>
                          {draft && (
                            <div
                              className={`mt-1 text-[11px] ${ativo ? funcaoToken.selectedMutedTextClassName : 'text-sky-700'}`}
                            >
                              Pré-salvo aguardando gravação
                            </div>
                          )}
                          {!draft && !slot.atual && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              Clique para preencher este slot
                            </div>
                          )}
                          {slot.atual && !draft && (
                            <div
                              className={`mt-1 text-[11px] ${ativo ? funcaoToken.selectedMutedTextClassName : 'text-emerald-700'}`}
                            >
                              Já gravado. Clique para trocar o tripulante
                            </div>
                          )}
                          <div
                            className={`mt-1 text-[11px] ${ativo ? 'text-slate-200' : 'text-slate-500'}`}
                          >
                            {fmtDateRange(slot.quinzena.data_inicio, slot.quinzena.data_fim)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {modoFluxoB
              ? null
              : !modoGestaoAeronave && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2 text-slate-500">
                      <CalendarDays className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Período</span>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => aplicarPeriodoPreset('1q')}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-semibold',
                          periodoModo === '1q' ? Q1.pillActive : Q1.pill,
                          periodoModo !== '1q' && Q1.bgHover,
                        )}
                      >
                        {Q1.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarPeriodoPreset('2q')}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-semibold',
                          periodoModo === '2q' ? Q2.pillActive : Q2.pill,
                          periodoModo !== '2q' && Q2.bgHover,
                        )}
                      >
                        {Q2.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodoModo('custom')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${periodoModo === 'custom' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Personalizado
                      </button>
                    </div>
                    <div className="grid gap-3 grid-cols-2">
                      <div>
                        <input
                          type="date"
                          value={dataInicio}
                          onChange={(event) => {
                            setPeriodoModo('custom');
                            setDataInicio(event.target.value);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        {dataInicio && (
                          <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">
                            {fmtDateShort(dataInicio)}
                          </span>
                        )}
                      </div>
                      <div>
                        <input
                          type="date"
                          value={dataFim}
                          onChange={(event) => {
                            setPeriodoModo('custom');
                            setDataFim(event.target.value);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        {dataFim && (
                          <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">
                            {fmtDateShort(dataFim)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{periodoResumo}</p>
                  </div>
                )}
          </div>

          {modoFluxoB ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-slate-500">
                <Plane className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Slots disponíveis
                </span>
              </div>

              {slotsFluxoB.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                  Nenhuma aeronave compatível encontrada para esse tripulante e período.
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {slotsFluxoB.map((slot) => {
                    const ativo = slot.selecionado;
                    const funcaoToken = getFuncaoVisualToken(slot.funcao);
                    const titulo = formatarAeronave(slot.aeronave.prefixo, slot.aeronave.modelo);
                    return (
                      <button
                        key={slot.key}
                        type="button"
                        onClick={() => aplicarSlotFluxoB(slot)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${ativo ? funcaoToken.selectedCardClassName : slot.atual ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className={`font-semibold ${ativo ? 'text-white' : ''}`}>
                              {titulo}
                            </div>
                            <div
                              className={`mt-1 text-xs ${ativo ? funcaoToken.selectedMutedTextClassName : 'text-slate-500'}`}
                            >
                              {slot.aeronave.modelo || 'Modelo não informado'}
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativo ? 'bg-white/15 text-white' : funcaoToken.badgeClassName}`}
                          >
                            {slot.funcao}
                          </span>
                        </div>
                        <div
                          className={`mt-2 text-xs ${ativo ? funcaoToken.selectedMutedTextClassName : slot.atual ? 'text-amber-700' : 'text-emerald-700'}`}
                        >
                          {slot.atual
                            ? `Ocupado por ${slot.atual.funcionario_guerra || slot.atual.funcionario_nome || 'tripulante'} no período selecionado`
                            : 'Slot livre para alocação'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {slotFluxoBSelecionado && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                  Slot selecionado:{' '}
                  {formatarAeronave(
                    slotFluxoBSelecionado.aeronave.prefixo,
                    slotFluxoBSelecionado.aeronave.modelo,
                  )}{' '}
                  · {slotFluxoBSelecionado.funcao}
                </div>
              )}
            </div>
          ) : (
            !modoGestaoAeronave && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-slate-500">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Slot operacional
                  </span>
                </div>
                <div className="grid gap-2 grid-cols-3">
                  {FUNCOES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFuncao(item.value)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${funcao === item.value ? getFuncaoVisualToken(item.value).activeButtonClassName : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Observação operacional
            </label>
            <textarea
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              rows={modoGestaoAeronave ? 2 : 3}
              maxLength={500}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Base, motivo da troca, observações de cobertura..."
            />
          </div>
        </div>

        {/* ── Coluna direita: Tripulante ───────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-slate-500">
                  <User className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Tripulante</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {modoFluxoB
                    ? 'Tripulante fixo para este fluxo de alocação'
                    : semAeronaveSelecionada
                      ? `Tripulantes operacionais livres · ${tituloSlotSelecionado || funcao}`
                      : aeronaveSelecionada
                        ? `Elegibilidade para ${formatarAeronave(aeronaveSelecionada.prefixo, aeronaveSelecionada.modelo)} · ${tituloSlotSelecionado || funcao}`
                        : 'Selecione a aeronave para carregar elegibilidade'}
                </p>
              </div>
              {carregandoTripulantes && (
                <span className="text-xs text-slate-400">Carregando...</span>
              )}
            </div>

            {alocacaoSelecionada && !modoFluxoB && (
              <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                {alocacaoSelecionada.funcionario_guerra ||
                  alocacaoSelecionada.funcionario_nome ||
                  'Tripulante atual'}{' '}
                está na posição atual. Selecione outro tripulante para substituir ou use excluir.
              </div>
            )}

            {modoGestaoAeronave && !modoFluxoB && !funcionarioId && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {slotEmEdicao
                  ? `Selecione um tripulante para ${slotEmEdicao.quinzena.numero}Q ${slotEmEdicao.funcao}. O preenchimento fica pré-salvo até você gravar tudo.`
                  : 'Selecione um slot à esquerda e depois escolha o tripulante.'}
              </div>
            )}

            {rascunhosPendentes.length > 0 && (
              <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                {rascunhosPendentes.length} slot(s) prontos para gravação final.
              </div>
            )}

            {conflitoRascunhosPendentes && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {conflitoRascunhosPendentes}
              </div>
            )}

            {modoFluxoB ? (
              tripulanteSelecionado ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        {tripulanteSelecionado.nome_guerra || tripulanteSelecionado.nome}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {tripulanteSelecionado.nome_guerra
                          ? tripulanteSelecionado.nome
                          : tripulanteSelecionado.matricula}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${funcaoVisual.badgeClassName}`}
                    >
                      {tripulanteSelecionado.role || 'Tripulante'}
                    </span>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          getQuinzenaBadgeClasses(quinzenaSelecionada?.numero || null),
                        )}
                      >
                        {getQuinzenaShortLabel(quinzenaSelecionada?.numero || null) || 'Período'}
                      </span>
                      <span className="text-xs text-slate-500">Período fixo deste fluxo</span>
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-600">{periodoResumo}</div>
                    {avisoQuinzenaCruzada && (
                      <div className="mt-2 text-xs text-amber-700">{avisoQuinzenaCruzada}</div>
                    )}
                  </div>

                  {tripulanteSelecionado.habilitacoes?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tripulanteSelecionado.habilitacoes.map((habilitacao) => (
                        <span
                          key={`${habilitacao.modelo_id}-${habilitacao.modelo_codigo}`}
                          className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          {habilitacao.modelo_codigo}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-slate-500">
                      Nenhuma habilitação detalhada informada. Todos os equipamentos ficarão
                      disponíveis.
                    </div>
                  )}

                  {conflitoLocalVisivel && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      Já existe um registro neste período:{' '}
                      {formatarResumoConflitoSubstituicao(conflitoLocal) || 'outro período'}. Ao
                      confirmar, o sistema pedirá autorização para substituir o registro atual.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-slate-400">
                  <User className="mb-2 h-8 w-8 text-slate-300" />
                  <span className="text-sm font-medium text-slate-600">
                    Nenhum tripulante selecionado
                  </span>
                  <span className="mt-1 text-xs">Tripulante não encontrado para este fluxo.</span>
                </div>
              )
            ) : !aeronaveId ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-slate-400">
                <Plane className="mb-2 h-8 w-8 text-slate-300" />
                <span className="text-sm font-medium text-slate-600">
                  Equipamento não selecionado
                </span>
                <span className="mt-1 text-xs">
                  Escolha a aeronave ou a opção sem aeronave antes de selecionar o tripulante.
                </span>
              </div>
            ) : tripulantes.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-slate-400">
                <User className="mb-2 h-8 w-8 text-slate-300" />
                <span className="text-sm font-medium text-slate-600">Nenhum tripulante livre</span>
                <span className="mt-1 text-xs">
                  Nenhum tripulante retornado para esse slot e período.
                </span>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {pendingCmaFuncionarioId &&
                  (() => {
                    const t = tripulantes.find((t) => t.funcionario_id === pendingCmaFuncionarioId);
                    return (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-red-900">CMA Vencida</p>
                            <p className="text-xs text-red-700 mt-1">
                              {t?.nome_guerra || t?.nome || 'Tripulante'} está com CMA vencida
                              {t?.cma_validade_fim ? ` desde ${t.cma_validade_fim}` : ''}. Ao
                              confirmar, você assume responsabilidade por esta alocação. Esta ação
                              será registrada na auditoria.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingCmaFuncionarioId(null)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const tripulantePendente = tripulantes.find(
                                (item) => item.funcionario_id === pendingCmaFuncionarioId,
                              );
                              if (tripulantePendente) {
                                selecionarTripulanteSlot(tripulantePendente, { cmaOverride: true });
                              }
                              setPendingCmaFuncionarioId(null);
                            }}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                          >
                            Confirmar mesmo assim
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                {tripulantes.map((tripulante) => {
                  const selecionado = funcionarioId === tripulante.funcionario_id;
                  const bloqueadoPorFuncao =
                    !isTripulanteCompativelComFuncao(tripulante.role, funcao) &&
                    tripulante.funcionario_id !== funcionarioAtualPermitidoId;
                  const cmaExpirada =
                    !tripulante.cma_valido &&
                    tripulante.funcionario_id !== funcionarioAtualPermitidoId;
                  const bloqueado =
                    bloqueadoPorFuncao ||
                    (tripulante.pode_ser_alocado === false &&
                      !cmaExpirada &&
                      tripulante.funcionario_id !== funcionarioAtualPermitidoId);
                  const resumoAlocacaoExistente = getResumoAlocacaoExistente(tripulante);
                  const motivoBloqueio = bloqueadoPorFuncao
                    ? 'Requer CMD'
                    : tripulante.motivo_bloqueio;

                  return (
                    <button
                      key={tripulante.funcionario_id}
                      type="button"
                      disabled={bloqueado}
                      onClick={() => {
                        if (cmaExpirada && !selecionado) {
                          setPendingCmaFuncionarioId(tripulante.funcionario_id);
                        } else {
                          selecionarTripulanteSlot(tripulante);
                        }
                      }}
                      className={cn(
                        'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                        selecionado
                          ? cmaExpirada
                            ? 'border-red-400 bg-red-600 text-white'
                            : funcaoVisual.selectedCardClassName
                          : bloqueado
                            ? 'border-slate-200 bg-slate-50 text-slate-400'
                            : cmaExpirada
                              ? 'border-red-300 bg-red-50 text-slate-800 hover:border-red-400 hover:bg-red-100'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className={`font-semibold ${selecionado ? 'text-white' : ''}`}>
                              {tripulante.nome_guerra || tripulante.nome}
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selecionado ? 'bg-white/15 text-white' : funcaoVisual.badgeClassName}`}
                            >
                              {tripulante.role}
                            </span>
                          </div>
                          {tripulante.nome_guerra && (
                            <div
                              className={`text-[11px] ${selecionado ? funcaoVisual.selectedMutedTextClassName : 'text-slate-400'}`}
                            >
                              {tripulante.nome}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {tripulante.cma_valido ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selecionado ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'}`}
                            >
                              CMA ok
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              CMA vencida
                            </span>
                          )}
                          {tripulante.frms_status && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selecionado ? 'bg-white/15 text-white' : tripulante.frms_status === 'critico' ? 'bg-red-50 text-red-700' : tripulante.frms_status === 'atencao' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
                            >
                              Indicador FRMS legado {tripulante.frms_score ?? '—'}
                            </span>
                          )}
                        </div>
                      </div>

                      {(motivoBloqueio || tripulante.ja_alocado_em) && (
                        <div
                          className={`mt-2 text-xs ${selecionado ? funcaoVisual.selectedMutedTextClassName : 'text-slate-500'}`}
                        >
                          {resumoAlocacaoExistente || motivoBloqueio}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {!modoGestaoAeronave && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-slate-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-semibold">Revisão</span>
          </div>
          <div className="grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
            <p>
              Equipamento:{' '}
              <strong>
                {semAeronaveSelecionada
                  ? SEM_AERONAVE_LABEL
                  : aeronaveSelecionada
                    ? aeronaveSelecionada.modelo || aeronaveSelecionada.prefixo || '—'
                    : '—'}
              </strong>
            </p>
            <p>
              Slot: <strong className={funcaoVisual.badgeClassName}>{funcao}</strong>
            </p>
            <p>
              Tripulante:{' '}
              <strong>
                {tripulanteSelecionado?.nome_guerra || tripulanteSelecionado?.nome || '—'}
              </strong>
            </p>
            <p>
              Período: <strong>{periodoResumo}</strong>
            </p>
            {conflitoLocalVisivel && conflitoLocal && (
              <p className="text-red-600 sm:col-span-2">
                Há um registro existente em{' '}
                {formatarResumoConflitoSubstituicao(conflitoLocal) || 'outro período'}. Você poderá
                confirmar a substituição ao salvar.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
