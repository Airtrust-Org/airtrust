// src/react-app/pages/escalas/views/EscalasDetalheView.tsx
//
// Detail/Gantt-mode view for the Escalas module.
// Consumed only when an escala is selected (escalaAtualId != null).

import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  History,
  Moon,
  MoreHorizontal,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Upload,
  UserX,
  X,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import { Button } from '@/react-app/components/UI';
import { useAuth } from '@/react-app/hooks/useAuth';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
import { STATUS_CONFIG } from '../utils/statusConfig';
import type { EscalaEvento } from '../hooks/queries/useEscalasQuery';
import { MESES, MESES_CURTOS } from '../EscalaPageContext';
import { useEscalaPageCtx } from '../EscalaPageContext';
import FiltroQuinzena from '../components/Filtros/FiltroQuinzena';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { parseSyntheticId } from '../components/EscalaCalendario/GradeTripulantes.utils';

const PainelTripulacoes = lazyWithRetry(
  () => import('../components/Paineis/PainelTripulacoes'),
  'EscalasPainelTripulacoes',
);
const GradeGantt = lazyWithRetry(
  () => import('../components/EscalaCalendario/GradeGantt'),
  'EscalasGradeGantt',
);
const GradeTripulantes = lazyWithRetry(
  () => import('../components/EscalaCalendario/GradeTripulantes'),
  'EscalasGradeTripulantes',
);
const PainelEstatisticas = lazyWithRetry(
  () => import('../components/Paineis/PainelEstatisticas'),
  'EscalasPainelEstatisticas',
);
const PainelLegenda = lazyWithRetry(
  () => import('../components/Paineis/PainelLegenda'),
  'EscalasPainelLegenda',
);
const PainelDisponibilidade = lazyWithRetry(
  () => import('../components/Paineis/PainelDisponibilidade'),
  'EscalasPainelDisponibilidade',
);
const MiniCalendario = lazyWithRetry(
  () => import('../components/Paineis/MiniCalendario'),
  'EscalasMiniCalendario',
);
const WorkloadBalance = lazyWithRetry(
  () => import('../components/Paineis/WorkloadBalance'),
  'EscalasWorkloadBalance',
);
const VistaTripulante = lazyWithRetry(
  () => import('../components/Paineis/VistaTripulante'),
  'EscalasVistaTripulante',
);
const ComparacaoVersao = lazyWithRetry(
  () => import('../components/Paineis/ComparacaoVersao'),
  'EscalasComparacaoVersao',
);
const ModalAdicionarTripulacao = lazyWithRetry(
  () => import('../components/Modais/ModalAdicionarTripulacao'),
  'EscalasModalAdicionarTripulacao',
);
const ModalNovaSituacao = lazyWithRetry(
  () => import('../components/Modais/ModalNovaSituacao'),
  'EscalasModalNovaSituacao',
);
const ModalSelecionarTripulante = lazyWithRetry(
  () => import('../components/Modais/ModalSelecionarTripulante'),
  'EscalasModalSelecionarTripulante',
);
const ModalAlocarTripulante = lazyWithRetry(
  () => import('../components/Modais/ModalAlocarTripulante'),
  'EscalasModalAlocarTripulante',
);
const ModalFuncionario = lazyWithRetry(
  () => import('@/react-app/pages/funcionarios/ModalFuncionario'),
  'EscalasModalFuncionario',
);
const ModalAdicionarEvento = lazyWithRetry(
  () => import('../components/Modais/ModalAdicionarEvento'),
  'EscalasModalAdicionarEvento',
);
const ModalDetalhesEvento = lazyWithRetry(
  () => import('../components/Modais/ModalDetalhesEvento'),
  'EscalasModalDetalhesEvento',
);
const ModalVerificarConflitos = lazyWithRetry(
  () => import('../components/Modais/ModalVerificarConflitos'),
  'EscalasModalVerificarConflitos',
);
const PainelRevisoes = lazyWithRetry(
  () => import('../components/Paineis/PainelRevisoes'),
  'EscalasPainelRevisoes',
);
const ModalPublicarEscala = lazyWithRetry(
  () => import('../components/Modais/ModalPublicarEscala'),
  'EscalasModalPublicarEscala',
);
const ModalSnapshotRevisao = lazyWithRetry(
  () => import('../components/Modais/ModalSnapshotRevisao'),
  'EscalasModalSnapshotRevisao',
);
const ModalExportarEscalaPdf = lazyWithRetry(
  () => import('../components/Modais/ModalExportarEscalaPdf'),
  'EscalasModalExportarEscalaPdf',
);
const ModalConfirmarTransicao = lazyWithRetry(
  () => import('../components/Modais/ModalConfirmarTransicao'),
  'EscalasModalConfirmarTransicao',
);

interface RevisaoExportacaoPdf {
  revisao: number;
  publicado_em: string;
  publicado_por: string | null;
  publicado_por_nome: string | null;
  elaborado_em?: string | null;
  elaborado_por?: string | null;
  elaborado_por_nome?: string | null;
  aprovado_em?: string | null;
  aprovado_por?: string | null;
  aprovado_por_nome?: string | null;
}

type ExportEquipmentOption = {
  modelo: string;
  blockKeys: string[];
};

const panelFallback = (
  <div className="min-h-[240px] animate-pulse rounded-xl bg-slate-50 dark:bg-slate-900" />
);
const gridFallback = (
  <div className="min-h-[320px] animate-pulse rounded-2xl bg-white/80 dark:bg-slate-900/80" />
);

function sanitizeFilePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

async function carregarRevisoesExportacao(escalaId: string): Promise<RevisaoExportacaoPdf[]> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/escalas/${escalaId}/revisoes`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error('Não foi possível carregar o histórico de revisões da escala.');
  }

  const result = (await response.json()) as {
    success?: boolean;
    data?: RevisaoExportacaoPdf[];
  };

  return result.success && Array.isArray(result.data) ? result.data : [];
}

export default function EscalasDetalheView() {
  const { empresas, empresaAtualId, user } = useAuth();
  const {
    escalaAtual,
    loadingCalendario,
    dadosCalendario,
    alocacoesOperacionaisVisiveis,
    coberturaOperacional,
    coberturaOperacionalFiltrada,
    tripulantesCoberturaFiltrados,
    resumoCoberturaTripulantes,
    tripulanteModalSelecionado,
    tripulanteInicialAlocacao,
    alocacoesOperacionais,
    aeronavesAtivas,
    aeronavesComTripulacao,
    modelosAeronaveDisponiveis,
    quinzenas,
    prevEscala,
    nextEscala,
    statusConf,
    totalPilotos,
    totalEventos,
    totalConflitos,
    exibirAcoesOperacionais,
    fdpAlertas,
    aeronavePainelDisponibilidade,
    snapshotComparacao,
    filtroNome,
    setFiltroNome,
    filtroTripulante,
    setFiltroTripulante,
    filtroQuinzena,
    setFiltroQuinzena,
    filtroAeronave,
    setFiltroAeronave,
    filtroAeronaveSelecionado,
    filtroModeloAeronave,
    setFiltroModeloAeronave,
    filtroModeloSelecionado,
    visaoGrade,
    setVisaoGrade,
    highlightAlocacao,
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
    painelQuinzenas,
    setPainelQuinzenas,
    editandoQuinzenas,
    setEditandoQuinzenas,
    savingQid,
    fdpModalAberto,
    setFdpModalAberto,
    showVistaTripulante,
    setShowVistaTripulante,
    showComparacao,
    setShowComparacao,
    revisaoComparacaoNum,
    setRevisaoComparacaoNum,
    maisMenuAberto,
    setMaisMenuAberto,
    sincronizandoGrade,
    onboardingFechado,
    setOnboardingFechado,
    confirmarRemoverAlocacao,
    setConfirmarRemoverAlocacao,
    confirmarRemoverSituacao,
    setConfirmarRemoverSituacao,
    mutating,
    podeGerenciarOperacoes,
    refetchCalendario,
    // handlers
    handleSaveQuinzena,
    abrirVistaTripulante,
    abrirEscala,
    abrirAlocacaoTripulante,
    abrirSituacao,
    abrirSelecaoTripulante,
    abrirDecisaoTripulante,
    focarAlocacaoAeronave,
    sincronizarGradeEscala,
    handleAlterarStatus,
    handleRepublicar,
    handleTransicaoStatus,
    handleEventoRemovido,
    handleRemoverSituacao,
    removerAlocacaoOperacional,
    conflitosData,
    navigate,
  } = useEscalaPageCtx();

  const [showRevisoes, setShowRevisoes] = useState(false);
  const [snapshotVerNum, setSnapshotVerNum] = useState<number | null>(null);
  const [dropdownAeronave, setDropdownAeronave] = useState(false);
  const [dropdownModelo, setDropdownModelo] = useState(false);
  const [dropdownTipo, setDropdownTipo] = useState(false);
  const [funcionarioEditandoId, setFuncionarioEditandoId] = useState<number | null>(null);
  const [modalExportarPdfAberto, setModalExportarPdfAberto] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) ?? null;

  const equipamentosExportacao = useMemo<ExportEquipmentOption[]>(() => {
    const source =
      coberturaOperacionalFiltrada.length > 0 ? coberturaOperacionalFiltrada : coberturaOperacional;
    const unique = new Map<string, ExportEquipmentOption>();

    source.forEach((item) => {
      if (!item.modelo || !item.prefixo) return;
      const blockKey = `prefixo:${item.prefixo}`;
      const existing = unique.get(item.modelo);
      if (existing) {
        if (!existing.blockKeys.includes(blockKey)) {
          existing.blockKeys.push(blockKey);
        }
      } else {
        unique.set(item.modelo, { modelo: item.modelo, blockKeys: [blockKey] });
      }
    });

    return [...unique.values()].sort((a, b) => a.modelo.localeCompare(b.modelo, 'pt-BR'));
  }, [coberturaOperacional, coberturaOperacionalFiltrada]);

  const handleEditarSituacao = useCallback(
    (situacaoId: string) => {
      const parsed = parseSyntheticId(situacaoId);
      if (parsed) {
        abrirModal({ tipo: 'detalhes-evento', eventoId: parsed.eventoId });
      } else {
        abrirSituacao(situacaoId);
      }
    },
    [abrirModal, abrirSituacao],
  );

  const abrirExportacaoPdf = async (payload: {
    mode: 'current-view' | 'equipment';
    selectedModelos?: string[];
  }) => {
    if (!escalaAtual) return;

    const mode = payload.mode;
    const equipamentosSelecionados =
      mode === 'equipment'
        ? equipamentosExportacao.filter((item) => payload.selectedModelos?.includes(item.modelo))
        : [];

    if (mode === 'equipment' && equipamentosSelecionados.length === 0) {
      toast.error('Selecione pelo menos um equipamento para gerar os PDFs.');
      return;
    }

    setMaisMenuAberto(false);
    setModalExportarPdfAberto(false);

    try {
      setExportandoPdf(true);
      const [{ exportarEscalaPDF }, revisoes] = await Promise.all([
        import('../utils/exportarEscalaPDF'),
        carregarRevisoesExportacao(escalaAtual.id).catch(() => []),
      ]);

      const commonOptions = {
        mes: escalaAtual.mes,
        ano: escalaAtual.ano,
        status: escalaAtual.status,
        elaboradorNome: escalaAtual.criado_por_nome,
        elaboradoEm: escalaAtual.created_at,
        createdById: escalaAtual.created_by ?? user?.email ?? null,
        aprovadorNome: escalaAtual.aprovado_por_nome,
        aprovadoEm: escalaAtual.aprovado_em,
        aprovadoPorId: escalaAtual.aprovado_por,
        publicadorNome: escalaAtual.publicado_por_nome,
        publicadoEm: escalaAtual.publicado_em,
        publicadoPorId: escalaAtual.publicado_por,
        numeroRevisao: escalaAtual.numero_revisao,
        logoUrl: empresaAtual?.logo_url ?? null,
        revisoes: revisoes.map((item) => ({
          revisao: item.revisao,
          elaboradoEm: item.elaborado_em,
          elaboradoPor: item.elaborado_por,
          elaboradoPorNome: item.elaborado_por_nome,
          aprovadoEm: item.aprovado_em,
          aprovadoPor: item.aprovado_por,
          aprovadoPorNome: item.aprovado_por_nome,
          publicadoEm: item.publicado_em,
          publicadoPor: item.publicado_por,
          publicadoPorNome: item.publicado_por_nome,
        })),
        legendaTipos: tiposAtivos.map((tipo) => ({
          label: configMap[tipo]?.label ?? tipo,
          color: configMap[tipo]?.cor ?? '#64748b',
          visible: tiposEventoVisiveis.includes(tipo),
        })),
      };

      if (mode === 'equipment') {
        for (const equipamento of equipamentosSelecionados) {
          await exportarEscalaPDF({
            ...commonOptions,
            visaoLabel: `Equipamento ${equipamento.modelo}`,
            fileNameSuffix: sanitizeFilePart(equipamento.modelo),
            mode: 'equipment',
            selectedEquipmentIds: equipamento.blockKeys,
          });
        }

        toast.success(
          `${equipamentosSelecionados.length} PDF${equipamentosSelecionados.length === 1 ? '' : 's'} gerado${equipamentosSelecionados.length === 1 ? '' : 's'} por equipamento`,
        );
      } else {
        await exportarEscalaPDF({
          ...commonOptions,
          visaoLabel:
            visaoGrade === 'tripulante' ? 'Cobertura de Tripulantes' : 'Grade por Aeronave',
          mode: 'current-view',
        });
        toast.success('PDF enviado para impressão');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao exportar PDF');
    } finally {
      setExportandoPdf(false);
    }
  };
  const [legendaVisible, setLegendaVisible] = useState(true);
  const [modalPublicar, setModalPublicar] = useState<'publicar' | 'revisao' | null>(null);
  const [modalTransicao, setModalTransicao] = useState<
    'enviar-revisao' | 'aprovar' | 'rejeitar' | 'devolver-revisao' | 'reabrir' | 'arquivar' | null
  >(null);
  const [acaoPendentePosRevisao, setAcaoPendentePosRevisao] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!acaoPendentePosRevisao || escalaAtual?.status === 'publicada') return;

    const acao = acaoPendentePosRevisao;
    setAcaoPendentePosRevisao(null);
    window.setTimeout(() => acao(), 0);
  }, [acaoPendentePosRevisao, escalaAtual?.status]);

  const abrirFluxoRevisao = (acao?: () => void) => {
    setAcaoPendentePosRevisao(() => acao || null);
    setModalTransicao('reabrir');
  };

  const fecharModalTransicao = () => {
    setModalTransicao(null);
    setAcaoPendentePosRevisao(null);
  };

  /** Intercepta qualquer ação de edição quando a escala está publicada,
   *  abrindo o fluxo de "Iniciar Nova Revisão" antes de prosseguir. */
  const interceptarSePublicada = (acao: () => void) => {
    if (escalaAtual?.status === 'publicada') {
      abrirFluxoRevisao(acao);
      return;
    }
    acao();
  };

  const abrirEdicaoFuncionario = (funcionarioId: string | number) => {
    const parsed = Number(funcionarioId);
    if (!Number.isFinite(parsed)) {
      toast.error('Funcionário inválido para edição');
      return;
    }
    setFuncionarioEditandoId(parsed);
  };

  const salvarFuncionarioNaEscala = async (dados: Record<string, unknown>) => {
    if (!funcionarioEditandoId) return;

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/funcionarios/${funcionarioEditandoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(dados),
        cache: 'no-cache',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const mensagem = errorData?.error || errorData?.message || `Erro ${response.status}`;
        toast.error(`Erro ao salvar funcionário: ${mensagem}`);
        return;
      }

      toast.success('Funcionário atualizado com sucesso');
      setFuncionarioEditandoId(null);
      await sincronizarGradeEscala();
    } catch (error) {
      // Erro capturado e exibido via toast — não expor stack em produção
      toast.error('Erro de rede ao salvar funcionário');
    }
  };

  const eventoDetalhes =
    modalAberto?.tipo === 'detalhes-evento'
      ? dadosCalendario?.eventos.find((e) => e.id === modalAberto.eventoId)
      : undefined;
  const tiposVisiveisSelecionados = tiposAtivos.filter((tipo) =>
    tiposEventoVisiveis.includes(tipo),
  ).length;
  const tripulanteInicialOperacional = tripulanteInicialAlocacao
    ? {
        funcionario_id: tripulanteInicialAlocacao.id,
        nome: tripulanteInicialAlocacao.nome,
        nome_guerra: tripulanteInicialAlocacao.nome_guerra,
        matricula: tripulanteInicialAlocacao.matricula || '—',
        empresa_id: 0,
        role: tripulanteInicialAlocacao.cargo,
        cma_valido: true,
        cma_dias_restantes: null,
        cma_validade_fim: null,
        frms_score: null,
        frms_status: null,
        frms_avaliacao_data: null,
        simuladores_pendentes: 0,
        proximo_simulador_data: null,
        habilitacoes: (tripulanteInicialAlocacao.modelos_habilitados || []).map((codigo) => ({
          modelo_id: codigo,
          modelo_codigo: codigo,
          validade_fim: null,
        })),
        status_operacional: 'APTO' as const,
        pode_ser_alocado: true,
        ja_alocado_nesta_escala: tripulanteInicialAlocacao.status_geral !== 'livre',
        motivo_bloqueio: null,
        ja_alocado_em: null,
        quinzena: null,
      }
    : null;

  return (
    <AppLayout>
      {/* Usa negative margins para aproveitar toda a área abaixo do header da AppLayout */}
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-none"
        style={{ height: 'calc(100vh - var(--header-height, 48px) - 3rem)' }}
      >
        {/* ── Barra Superior ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-shrink-0 flex-wrap items-start gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:flex-nowrap sm:items-center dark:border-slate-800 dark:bg-slate-900">
          {/* Voltar */}
          <button
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            onClick={() => {
              abrirEscala(null);
              setModoEdicao(false);
              limparSelecao();
            }}
            title="Voltar para lista de escalas"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {loadingCalendario ? (
            <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
          ) : (
            escalaAtual && (
              <>
                {/* Breadcrumb + info */}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    className="text-sm text-slate-400 hover:text-primary transition-colors hidden sm:block"
                    onClick={() => {
                      abrirEscala(null);
                      setModoEdicao(false);
                      limparSelecao();
                    }}
                  >
                    Escalas
                  </button>
                  <span className="text-slate-300 hidden sm:block">/</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Escala {escalaAtual.mes}/{escalaAtual.ano}
                    </h2>
                    <span
                      className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_CONFIG[escalaAtual.status].className}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[escalaAtual.status].dotColor}`}
                      />
                      {STATUS_CONFIG[escalaAtual.status].label}
                    </span>
                    {escalaAtual.status === 'publicada' && (
                      <button
                        type="button"
                        title="Ver histórico de revisões"
                        onClick={() => setShowRevisoes((v) => !v)}
                        className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
                          showRevisoes
                            ? 'bg-slate-800 text-white border-slate-800 dark:border-slate-600 dark:bg-slate-700'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        <History className="w-3 h-3" />
                        {(escalaAtual.numero_revisao ?? 0) === 0
                          ? 'Revisão 0'
                          : `Revisão ${escalaAtual.numero_revisao}`}
                      </button>
                    )}
                    {escalaAtual.status !== 'publicada' &&
                      (escalaAtual.numero_revisao ?? 0) > 0 && (
                        <span className="shrink-0 flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <History className="w-3 h-3" />
                          Revisão {escalaAtual.numero_revisao}
                        </span>
                      )}
                    {/* Elaborador / Aprovador */}
                    {escalaAtual.criado_por_nome && (
                      <span
                        className="hidden shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 xl:inline-flex"
                        title="Elaborador da escala"
                      >
                        Elab: {escalaAtual.criado_por_nome}
                      </span>
                    )}
                    {escalaAtual.aprovado_por_nome && (
                      <span
                        className="hidden shrink-0 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200 xl:inline-flex"
                        title={`Aprovado em ${escalaAtual.aprovado_em ? new Date(escalaAtual.aprovado_em).toLocaleDateString('pt-BR') : '—'}`}
                      >
                        Aprov: {escalaAtual.aprovado_por_nome}
                      </span>
                    )}
                  </div>
                </div>

                <div className="ml-auto flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap">
                  {/* Contexto resumido */}
                  <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 2xl:flex">
                    <span
                      className={
                        resumoCoberturaTripulantes.completos <
                        (resumoCoberturaTripulantes.total || totalPilotos)
                          ? 'text-red-600 font-semibold'
                          : 'text-emerald-600'
                      }
                    >
                      {resumoCoberturaTripulantes.completos}/
                      {resumoCoberturaTripulantes.total || totalPilotos} tripulantes
                    </span>
                    <span>·</span>
                    <span>{totalEventos} eventos</span>
                    <span>·</span>
                    {totalConflitos > 0 ? (
                      <button
                        type="button"
                        onClick={() => abrirModal({ tipo: 'conflitos', escalaId: escalaAtual.id })}
                        className="text-red-600 font-semibold hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {totalConflitos} conflito{totalConflitos > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sem conflitos
                      </span>
                    )}
                  </div>

                  {/* Ações primárias */}
                  {escalaAtual && exibirAcoesOperacionais && (
                    <div className="relative flex items-center gap-2">
                      <Button
                        size="sm"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => interceptarSePublicada(() => abrirSelecaoTripulante())}
                      >
                        Por Tripulante
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Plane className="w-4 h-4" />}
                        onClick={() =>
                          interceptarSePublicada(() =>
                            abrirAlocacaoTripulante({ modoGestaoAeronave: true }),
                          )
                        }
                      >
                        Por Aeronave
                      </Button>
                      {!onboardingFechado && (dadosCalendario?.tripulacoes.length ?? 0) === 0 && (
                        <div className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-blue-200 bg-white p-3 text-xs text-slate-600 shadow-xl dark:border-blue-500/30 dark:bg-slate-900 dark:text-slate-300">
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-800 dark:text-slate-100">Primeiro passo</p>
                              <p>
                                Comece por <strong>Tripulante</strong> para escolher a quinzena e
                                depois decidir aeronave ou situação.
                              </p>
                              <button
                                type="button"
                                className="text-blue-600 font-semibold hover:underline"
                                onClick={() => {
                                  localStorage.setItem('escala-onboarding-alocar-v1', '1');
                                  setOnboardingFechado(true);
                                }}
                              >
                                Entendi
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Conflicts badge (small screens) */}
                  <button
                    onClick={() => abrirModal({ tipo: 'conflitos', escalaId: escalaAtual.id })}
                    className={`lg:hidden relative flex items-center gap-1 px-2 py-1.5 border rounded-lg text-xs font-medium transition-colors ${totalConflitos > 0 ? 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {totalConflitos > 0 && <span className="font-semibold">{totalConflitos}</span>}
                  </button>

                  {/* Botão de ação principal por status */}
                  {podeGerenciarOperacoes && escalaAtual.status === 'rascunho' && (
                    <Button
                      size="sm"
                      isLoading={mutating}
                      leftIcon={<Send className="w-4 h-4" />}
                      onClick={() => setModalTransicao('enviar-revisao')}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      Enviar para Revisão
                    </Button>
                  )}
                  {podeGerenciarOperacoes && escalaAtual.status === 'em_revisao' && (
                    <Button
                      size="sm"
                      isLoading={mutating}
                      leftIcon={<CheckCircle className="w-4 h-4" />}
                      onClick={() => setModalTransicao('aprovar')}
                      className="bg-sky-600 hover:bg-sky-700 text-white"
                    >
                      Aprovar Escala
                    </Button>
                  )}
                  {podeGerenciarOperacoes &&
                    escalaAtual.status === 'aprovada' &&
                    (escalaAtual.publicado_em ? (
                      /* Re-publicação após revisão: mostra número da próxima revisão */
                      <Button
                        size="sm"
                        isLoading={mutating}
                        leftIcon={<RefreshCw className="w-4 h-4" />}
                        onClick={() => setModalPublicar('revisao')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        title={`Publica a Revisão ${(escalaAtual.numero_revisao ?? 0) + 1} mantendo o histórico`}
                      >
                        Publicar Revisão {(escalaAtual.numero_revisao ?? 0) + 1}
                      </Button>
                    ) : (
                      /* Primeira publicação */
                      <Button
                        size="sm"
                        isLoading={mutating}
                        leftIcon={<Upload className="w-4 h-4" />}
                        onClick={() => setModalPublicar('publicar')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Publicar Escala
                      </Button>
                    ))}

                  {/* Mais menu */}
                  <div className="relative">
                    {maisMenuAberto && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMaisMenuAberto(false)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setMaisMenuAberto((v) => !v)}
                      className="list-none cursor-pointer select-none flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                      <span className="hidden md:inline">Mais</span>
                    </button>
                    {maisMenuAberto && (
                      <div className="absolute right-0 mt-1 z-50 min-w-[220px] space-y-0.5 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        {podeGerenciarOperacoes && exibirAcoesOperacionais && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                              Ações
                            </div>
                            {escalaAtual?.status === 'publicada' ? (
                              /* Escala publicada: opções de revisão */
                              <>
                                <button
                                  onClick={() => {
                                    setMaisMenuAberto(false);
                                    setModalTransicao('reabrir');
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-indigo-700 flex items-center gap-2"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                  Iniciar Nova Revisão para Editar
                                </button>
                                <button
                                  onClick={() => {
                                    setMaisMenuAberto(false);
                                    setModalPublicar('revisao');
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 flex items-center gap-2"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  Publicar Revisão {(escalaAtual.numero_revisao ?? 0) + 1} (direto)
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setMaisMenuAberto(false);
                                    abrirSituacao();
                                  }}
                                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  Nova Situação
                                </button>
                                <button
                                  onClick={() => {
                                    const firstCrew = dadosCalendario?.tripulacoes?.[0];
                                    if (!firstCrew?.pic_id) {
                                      toast.warning('Adicione uma alocação primeiro');
                                      setMaisMenuAberto(false);
                                      return;
                                    }
                                    setMaisMenuAberto(false);
                                    abrirModal({
                                      tipo: 'adicionar-evento',
                                      escalaId: escalaAtual!.id,
                                      funcionarioId: firstCrew.pic_id,
                                      data: `${escalaAtual!.ano}-${String(escalaAtual!.mes).padStart(2, '0')}-01`,
                                    });
                                  }}
                                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  Adicionar Evento
                                </button>
                                <button
                                  onClick={() => {
                                    setMaisMenuAberto(false);
                                    abrirModal({ tipo: 'conflitos', escalaId: escalaAtual!.id });
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  <span>Verificar Conflitos</span>
                                  {totalConflitos > 0 && (
                                    <span className="bg-red-100 text-red-700 text-[10px] font-bold rounded-full px-1.5 py-px">
                                      {totalConflitos}
                                    </span>
                                  )}
                                </button>
                              </>
                            )}
                          </>
                        )}
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                          Views
                        </div>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setShowVistaTripulante(true);
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Vista Tripulante
                        </button>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            navigate('/escalas/minha-escala');
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Minha Escala
                        </button>
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                          Análises
                        </div>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setPainelAberto('estatisticas');
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Estatísticas
                        </button>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setPainelAberto('workload');
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Distribuição de Carga
                        </button>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setFdpModalAberto(true);
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Verificar FDP
                        </button>
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                          Dados
                        </div>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setPainelAberto('disponibilidade');
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Disponibilidade
                        </button>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setShowComparacao(true);
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Comparar Versões
                        </button>
                        <button
                          onClick={async () => {
                            setMaisMenuAberto(false);
                            await abrirVistaTripulante();
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                        >
                          Exportar HTML Tripulante
                        </button>
                        <button
                          onClick={() => {
                            setMaisMenuAberto(false);
                            setModalExportarPdfAberto(true);
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Exportar PDF
                        </button>

                        {/* ── Ações de fluxo de status ── */}
                        {(escalaAtual.status === 'em_revisao' ||
                          escalaAtual.status === 'aprovada' ||
                          escalaAtual.status === 'publicada') && (
                          <>
                            <div className="my-1 border-t border-slate-100" />
                            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                              Fluxo de Status
                            </div>
                            {escalaAtual.status === 'em_revisao' && (
                              <button
                                onClick={() => {
                                  setMaisMenuAberto(false);
                                  setModalTransicao('rejeitar');
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-700 flex items-center gap-2"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Rejeitar e Devolver para Rascunho
                              </button>
                            )}
                            {escalaAtual.status === 'aprovada' && (
                              <button
                                onClick={() => {
                                  setMaisMenuAberto(false);
                                  setModalTransicao('devolver-revisao');
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-amber-50 text-amber-700 flex items-center gap-2"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Devolver para Revisão
                              </button>
                            )}
                            {escalaAtual.status === 'publicada' && (
                              <button
                                onClick={() => {
                                  setMaisMenuAberto(false);
                                  setModalTransicao('reabrir');
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-indigo-700 flex items-center gap-2"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reabrir para Edição
                              </button>
                            )}
                            {escalaAtual.status === 'publicada' && (
                              <button
                                onClick={() => {
                                  setMaisMenuAberto(false);
                                  setModalTransicao('arquivar');
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-stone-50 text-stone-700 flex items-center gap-2"
                              >
                                <X className="w-3.5 h-3.5" />
                                Arquivar Escala
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => navigate('/escalas/configuracoes')}
                    title="Configurações do módulo de escalas"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </>
            )
          )}
        </div>

        {/* ── Painel Quinzenas ──────────────────────────────────────────── */}
        {painelQuinzenas && quinzenas.length > 0 && (
          <div className="flex-shrink-0 overflow-x-auto border-b border-slate-200 bg-indigo-50/40 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Quinzenas — {escalaAtual?.ano}
              </h3>
              <button
                onClick={() => setPainelQuinzenas(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {[...quinzenas]
                .sort((a, b) => a.mes - b.mes || a.numero - b.numero)
                .map((q) => {
                  const edit = editandoQuinzenas[q.id];
                  const di = edit?.data_inicio ?? q.data_inicio;
                  const df = edit?.data_fim ?? q.data_fim;
                  const isDirty = !!edit;
                  return (
                    <div
                      key={q.id}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
                    >
                      <div className="mb-1 font-semibold text-slate-700 dark:text-slate-100">
                        {MESES_CURTOS[q.mes - 1]}
                        <span
                          className={[
                            'ml-1 px-1 py-0.5 rounded text-[10px] font-bold',
                            q.numero === 1
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-violet-100 text-violet-700',
                          ].join(' ')}
                        >
                          Q{q.numero}
                        </span>
                      </div>
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400">Início</label>
                      <input
                        type="date"
                        value={di}
                        onChange={(e) =>
                          setEditandoQuinzenas((prev) => ({
                            ...prev,
                            [q.id]: { data_inicio: e.target.value, data_fim: df },
                          }))
                        }
                        className="mb-1 w-full rounded border border-slate-200 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <label className="block text-[10px] text-slate-500 dark:text-slate-400">Fim</label>
                      <input
                        type="date"
                        value={df}
                        onChange={(e) =>
                          setEditandoQuinzenas((prev) => ({
                            ...prev,
                            [q.id]: { data_inicio: di, data_fim: e.target.value },
                          }))
                        }
                        className="mb-1.5 w-full rounded border border-slate-200 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      {isDirty && (
                        <button
                          onClick={() => handleSaveQuinzena(q, { data_inicio: di, data_fim: df })}
                          disabled={savingQid === q.id}
                          className="w-full bg-indigo-600 text-white rounded py-0.5 text-[10px] font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {savingQid === q.id ? '...' : 'Salvar'}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Barra de filtros unificada ───────────────────────── */}
        {escalaAtual &&
          (() => {
            const hasActiveFilters =
              filtroAeronaveSelecionado !== null ||
              filtroModeloSelecionado !== null ||
              filtroTripulante !== null ||
              filtroQuinzena !== 'todas' ||
              tiposEventoVisiveis.length !== tiposAtivos.length;
            return (
              <div className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-2.5 py-1 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                {/* Controles — linha única com scroll horizontal, nunca quebra */}
                <div className="flex flex-nowrap gap-1.5 items-center min-w-0">
                  <div className="flex flex-1 flex-nowrap gap-1.5 items-center overflow-x-auto scrollbar-none min-w-0">
                    <div className="inline-flex flex-shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setVisaoGrade('aeronave')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${visaoGrade === 'aeronave' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100'}`}
                      >
                        Aeronaves
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisaoGrade('tripulante')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${visaoGrade === 'tripulante' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100'}`}
                      >
                        Tripulantes
                      </button>
                    </div>

                    <div className="relative flex-1 min-w-[140px] max-w-xs">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Filtrar tripulante..."
                        value={filtroNome}
                        onChange={(e) => {
                          setFiltroNome(e.target.value);
                          setFiltroTripulante(e.target.value || null);
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-3 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                    </div>

                    {/* Filtro de quinzena (Q1/Q2) */}
                    <div className="flex-shrink-0">
                      <FiltroQuinzena />
                    </div>
                  </div>
                  {/* /overflow-x-auto */}

                  {/* Dropdowns — fora do container com overflow para não serem ocultados por clip */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {resumoCoberturaTripulantes.pendentes > 0 && (
                      <button
                        onClick={() => setVisaoGrade('tripulante')}
                        className="flex-shrink-0 flex items-center gap-1 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 hover:bg-red-100 whitespace-nowrap"
                        title="Resolver pendências de alocação"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {resumoCoberturaTripulantes.pendentes} pendente
                        {resumoCoberturaTripulantes.pendentes > 1 ? 's' : ''}
                      </button>
                    )}
                    <div className={`flex-shrink-0 relative ${dropdownAeronave ? 'z-30' : ''}`}>
                      {dropdownAeronave && (
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setDropdownAeronave(false)}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownAeronave((v) => !v);
                          setDropdownModelo(false);
                          setDropdownTipo(false);
                        }}
                        className={`list-none cursor-pointer select-none flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                          filtroAeronaveSelecionado
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {filtroAeronaveSelecionado ? filtroAeronaveSelecionado : 'Aeronave'}
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {dropdownAeronave && (
                        <div className="absolute left-0 mt-1 z-40 min-w-[180px] space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <button
                            onClick={() => {
                              setFiltroAeronave(null);
                              setDropdownAeronave(false);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Todas
                          </button>
                          {aeronavesAtivas.map((aeronave) => {
                            const prefixo = aeronave.prefixo ?? aeronave.modelo;
                            const ativa = filtroAeronave === prefixo;
                            const temTripulacao = aeronavesComTripulacao.has(prefixo);
                            return (
                              <button
                                key={aeronave.id}
                                onClick={() => {
                                  setFiltroAeronave(ativa ? null : prefixo);
                                  setDropdownAeronave(false);
                                }}
                                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <span>{prefixo}</span>
                                <span className="flex items-center gap-1">
                                  {!temTripulacao && <span>⚠️</span>}
                                  {ativa && <span>✓</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className={`flex-shrink-0 relative ${dropdownModelo ? 'z-30' : ''}`}>
                      {dropdownModelo && (
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setDropdownModelo(false)}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownModelo((v) => !v);
                          setDropdownAeronave(false);
                          setDropdownTipo(false);
                        }}
                        className={`list-none cursor-pointer select-none flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                          filtroModeloSelecionado
                            ? 'border-sky-300 bg-sky-50 text-sky-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {filtroModeloSelecionado ? filtroModeloSelecionado : 'Equipamento'}
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {dropdownModelo && (
                        <div className="absolute left-0 mt-1 z-40 min-w-[180px] space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <button
                            onClick={() => {
                              setFiltroModeloAeronave(null);
                              setDropdownModelo(false);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Todos
                          </button>
                          {modelosAeronaveDisponiveis.map((modelo) => {
                            const ativa = filtroModeloAeronave === modelo;
                            return (
                              <button
                                key={modelo}
                                onClick={() => {
                                  setFiltroModeloAeronave(ativa ? null : modelo);
                                  setDropdownModelo(false);
                                }}
                                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <span>{modelo}</span>
                                {ativa && <span>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className={`flex-shrink-0 relative ${dropdownTipo ? 'z-30' : ''}`}>
                      {dropdownTipo && (
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setDropdownTipo(false)}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDropdownTipo((v) => !v);
                          setDropdownAeronave(false);
                          setDropdownModelo(false);
                        }}
                        className={`list-none cursor-pointer select-none flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                          tiposEventoVisiveis.length !== tiposAtivos.length
                            ? 'border-amber-300 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {tiposEventoVisiveis.length !== tiposAtivos.length
                            ? `${tiposVisiveisSelecionados}/${tiposAtivos.length} tipos`
                            : `${tiposAtivos.length} de ${tiposAtivos.length} tipos`}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {dropdownTipo && (
                        <div className="absolute left-0 mt-1 z-40 max-h-72 min-w-[200px] space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {tiposAtivos.map((tipo) => {
                            const conf = configMap[tipo];
                            const checked = tiposEventoVisiveis.includes(tipo);
                            return (
                              <label
                                key={tipo}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTipoEvento(tipo)}
                                  className="rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: conf.cor ?? '#64748b' }}
                                />
                                <span>{conf.label ?? tipo}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          setFiltroAeronave(null);
                          setFiltroModeloAeronave(null);
                          setFiltroTripulante(null);
                          setFiltroNome('');
                          setFiltroQuinzena('todas');
                          mostrarTodosOsTipos(tiposAtivos);
                        }}
                        className="ml-auto flex-shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Limpar todos
                      </button>
                    )}
                  </div>
                  {/* /dropdowns */}
                </div>

                {/* Chips de filtros ativos removidos — os botões acima já indicam o estado ativo */}
              </div>
            );
          })()}
        {/* Alerta pendentes — compactado como chip na barra de filtros acima */}

        {/* ── Layout principal ─────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden min-h-0 2xl:flex-row">
          {/* Grade Gantt */}
          {loadingCalendario ? (
            <div className="flex flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
              <div className="text-center">
                <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Carregando grade...</p>
              </div>
            </div>
          ) : dadosCalendario && escalaAtual ? (
            <>
              {visaoGrade === 'tripulante' && (
                <div className="flex-1 overflow-auto bg-slate-50 p-2 dark:bg-slate-950 sm:p-4">
                  <div className="mx-auto w-full">
                    <Suspense fallback={gridFallback}>
                      <GradeTripulantes
                        cobertura={{
                          tripulantes: tripulantesCoberturaFiltrados,
                          resumo: resumoCoberturaTripulantes,
                        }}
                        alocacoes={alocacoesOperacionaisVisiveis}
                        eventos={dadosCalendario.eventos}
                        escalaId={String(escalaAtual.id)}
                        quinzenas={quinzenas}
                        escalaMes={escalaAtual.mes}
                        escalaAno={escalaAtual.ano}
                        filtroQuinzena={filtroQuinzena}
                        tripulanteFocadoId={filtroTripulante}
                        onAlocarLivre={({
                          tripulanteId,
                          quinzenaNumero,
                          quinzenaId,
                          dataInicio,
                          dataFim,
                        }) =>
                          interceptarSePublicada(() =>
                            abrirDecisaoTripulante({
                              tripulanteId,
                              quinzenaNumero,
                              quinzenaId,
                              dataInicio,
                              dataFim,
                            }),
                          )
                        }
                        onEditarSituacao={(situacaoId) => {
                          const parsed = parseSyntheticId(situacaoId);
                          if (parsed) {
                            abrirModal({ tipo: 'detalhes-evento', eventoId: parsed.eventoId });
                          } else {
                            interceptarSePublicada(() => abrirSituacao(situacaoId));
                          }
                        }}
                        onEditarFuncionario={abrirEdicaoFuncionario}
                        onFocarAlocacaoAeronave={focarAlocacaoAeronave}
                      />
                    </Suspense>
                  </div>
                </div>
              )}
              {visaoGrade !== 'tripulante' && (
                <div className="flex-1 overflow-auto bg-slate-50 p-2 dark:bg-slate-950 sm:p-4">
                  <div className="mx-auto w-full">
                    <Suspense fallback={gridFallback}>
                      <GradeGantt
                        escala={escalaAtual}
                        tripulacoes={dadosCalendario.tripulacoes}
                        alocacoes={alocacoesOperacionaisVisiveis}
                        cobertura={coberturaOperacionalFiltrada}
                        tripulantesCobertura={tripulantesCoberturaFiltrados}
                        eventos={dadosCalendario.eventos}
                        quinzenas={quinzenas}
                        conflitosData={conflitosData}
                        filtroAeronave={filtroAeronaveSelecionado}
                        filtroModelo={filtroModeloSelecionado}
                        filtroQuinzena={filtroQuinzena}
                        filtroNome={filtroNome}
                        isRefreshingAlocacao={sincronizandoGrade}
                        highlightAlocacao={highlightAlocacao}
                        onPrevMes={
                          prevEscala
                            ? () => abrirEscala(prevEscala.id, prevEscala.status)
                            : undefined
                        }
                        onNextMes={
                          nextEscala
                            ? () => abrirEscala(nextEscala.id, nextEscala.status)
                            : undefined
                        }
                        onAlocarTripulante={abrirAlocacaoTripulante}
                        onEditarFuncionario={undefined}
                        onEditarAlocacao={(alocacaoId) => {
                          const alocacao = alocacoesOperacionaisVisiveis.find(
                            (item) => item.id === alocacaoId,
                          );
                          abrirAlocacaoTripulante({
                            aeronaveLabel:
                              alocacao?.aeronave_prefixo || alocacao?.aeronave?.prefixo || null,
                            aeronaveId: alocacao?.aeronave_id ?? null,
                            funcao: alocacao?.funcao || undefined,
                            modoGestaoAeronave: true,
                            quinzenaId: alocacao?.quinzena_id ?? undefined,
                          });
                        }}
                        onRemoverAlocacao={(alocacaoId, nome) =>
                          setConfirmarRemoverAlocacao({
                            escalaId: escalaAtual.id,
                            alocacaoId,
                            nome,
                          })
                        }
                        onEditarSituacao={handleEditarSituacao}
                        onRegistrarSituacao={(payload) => abrirSituacao(undefined, payload)}
                        onRemoverSituacao={(situacaoId, nome) =>
                          setConfirmarRemoverSituacao({
                            escalaId: escalaAtual.id,
                            situacaoId,
                            nome,
                          })
                        }
                        onMoverEvento={async (eventoId, novaDataInicio, novaDataFim) => {
                          try {
                            const token = getAccessToken();
                            const base = (
                              await import('@/react-app/config/api')
                            ).API_BASE_URL.replace(/\/api$/, '');
                            await fetch(
                              `${base}/api/escalas/${escalaAtual.id}/eventos/${eventoId}`,
                              {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({
                                  data_inicio: novaDataInicio,
                                  data_fim: novaDataFim,
                                }),
                              },
                            );
                            refetchCalendario();
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : 'Erro ao mover evento',
                            );
                          }
                        }}
                        onAlocarPrimeiraTripulacao={() =>
                          interceptarSePublicada(() => abrirSelecaoTripulante())
                        }
                        onAlocarPrimeiraAeronave={() =>
                          interceptarSePublicada(() =>
                            abrirAlocacaoTripulante({ modoGestaoAeronave: true }),
                          )
                        }
                      />
                    </Suspense>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
              <div className="py-16">
                <EmptyState
                  icon={<CalendarDays size={48} className="text-slate-300" />}
                  title="Sem dados"
                  description="Nenhum dado disponível"
                />
              </div>
            </div>
          )}

          {/* Painel lateral (bottom sheet em telas menores, sidebar em 2xl+) */}
          {painelAberto && dadosCalendario && (
            <div className="max-h-[28vh] flex-shrink-0 overflow-y-auto border-t border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900 dark:shadow-none 2xl:h-auto 2xl:max-h-none 2xl:w-64 2xl:border-l 2xl:border-t-0">
              {painelAberto === 'tripulacoes' && (
                <Suspense fallback={panelFallback}>
                  <PainelTripulacoes
                    tripulacoes={dadosCalendario.tripulacoes}
                    escalaId={escalaAtual!.id}
                    modoEdicao={modoEdicao}
                    onClose={() => setPainelAberto(null)}
                  />
                </Suspense>
              )}
              {painelAberto === 'estatisticas' && (
                <Suspense fallback={panelFallback}>
                  <PainelEstatisticas
                    eventos={dadosCalendario.eventos}
                    tripulacoes={dadosCalendario.tripulacoes}
                    onClose={() => setPainelAberto(null)}
                  />
                </Suspense>
              )}
              {painelAberto === 'disponibilidade' && escalaAtual && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Disponibilidade</h3>
                    <button
                      onClick={() => setPainelAberto(null)}
                      className="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-800"
                    >
                      <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                    </button>
                  </div>
                  <Suspense fallback={panelFallback}>
                    <PainelDisponibilidade
                      mes={escalaAtual.mes}
                      ano={escalaAtual.ano}
                      escalaId={escalaAtual.id}
                      aeronaveHint={aeronavePainelDisponibilidade}
                    />
                    <MiniCalendario
                      mes={escalaAtual.mes}
                      ano={escalaAtual.ano}
                      eventosCount={
                        new Map(
                          dadosCalendario.eventos.reduce(
                            (acc: [string, number][], e: EscalaEvento) => {
                              const d = e.data_inicio?.slice(0, 10);
                              if (d) {
                                const found = acc.find(([k]) => k === d);
                                if (found) found[1]++;
                                else acc.push([d, 1]);
                              }
                              return acc;
                            },
                            [] as [string, number][],
                          ),
                        )
                      }
                    />
                  </Suspense>
                </div>
              )}
              {painelAberto === 'workload' && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Carga de Trabalho</h3>
                    <button
                      onClick={() => setPainelAberto(null)}
                      className="rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-800"
                    >
                      <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                    </button>
                  </div>
                  <Suspense fallback={panelFallback}>
                    <WorkloadBalance
                      tripulacoes={dadosCalendario.tripulacoes}
                      eventos={dadosCalendario.eventos}
                      diasNoMes={new Date(escalaAtual!.ano, escalaAtual!.mes, 0).getDate()}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Legenda (colapsada por padrão) ──────────────────────────────── */}
        <div className="hidden xl:block flex-shrink-0">
          <div className="flex items-center border-t border-slate-200 bg-white px-4 py-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setLegendaVisible((v) => !v)}
              className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              {legendaVisible ? 'Ocultar legenda' : 'Legenda'}
              {legendaVisible ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          </div>
          {legendaVisible && (
            <Suspense fallback={null}>
              <PainelLegenda />
            </Suspense>
          )}
        </div>

        {/* ── Modais ──────────────────────────────────────────────────────── */}
        {modalAberto?.tipo === 'adicionar-alocacao' && (
          <Suspense fallback={null}>
            <ModalAdicionarTripulacao
              escalaId={modalAberto.escalaId}
              mes={escalaAtual?.mes ?? new Date().getMonth() + 1}
              ano={escalaAtual?.ano ?? new Date().getFullYear()}
              escalaStatus={escalaAtual?.status}
              quinzenas={quinzenas}
              aeronaveInicial={modalAberto.aeronaveInicial ?? null}
              aeronaveIdInicial={modalAberto.aeronaveIdInicial ?? null}
              modoGestaoAeronave={modalAberto.modoGestaoAeronave ?? false}
              modoFluxoB={modalAberto.modoFluxoB ?? false}
              funcionarioInicialId={modalAberto.funcionarioInicialId ?? null}
              tripulanteInicial={tripulanteInicialOperacional}
              funcaoInicial={modalAberto.funcaoInicial}
              quinzenaInicial={modalAberto.quinzenaInicial}
              dataInicioInicial={modalAberto.dataInicioInicial}
              dataFimInicial={modalAberto.dataFimInicial}
              alocacoesExistentes={alocacoesOperacionaisVisiveis}
              onSaved={sincronizarGradeEscala}
              onIniciarRevisao={() => abrirFluxoRevisao()}
              onClose={fecharModal}
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'editar-alocacao' && (
          <Suspense fallback={null}>
            <ModalAdicionarTripulacao
              escalaId={modalAberto.escalaId}
              mes={escalaAtual?.mes ?? new Date().getMonth() + 1}
              ano={escalaAtual?.ano ?? new Date().getFullYear()}
              escalaStatus={escalaAtual?.status}
              quinzenas={quinzenas}
              alocacaoId={modalAberto.alocacaoId}
              alocacaoInicial={alocacoesOperacionaisVisiveis.find(
                (a) => a.id === modalAberto.alocacaoId,
              )}
              alocacoesExistentes={alocacoesOperacionaisVisiveis}
              onSaved={sincronizarGradeEscala}
              onIniciarRevisao={() => abrirFluxoRevisao()}
              onClose={fecharModal}
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'nova-situacao' && escalaAtual && (
          <Suspense fallback={null}>
            <ModalNovaSituacao
              escalaId={modalAberto.escalaId}
              mes={escalaAtual.mes}
              ano={escalaAtual.ano}
              quinzenas={quinzenas}
              modoFluxoB={modalAberto.modoFluxoB}
              funcionarioInicialId={modalAberto.funcionarioInicialId}
              quinzenaInicial={modalAberto.quinzenaInicial}
              dataInicioInicial={modalAberto.dataInicioInicial}
              dataFimInicial={modalAberto.dataFimInicial}
              fluxo={modalAberto.fluxo}
              tiposPermitidos={modalAberto.tiposPermitidos}
              situacaoTipoInicial={modalAberto.situacaoTipoInicial}
              situacaoInicial={
                modalAberto.situacaoId
                  ? alocacoesOperacionais.find((item) => item.id === modalAberto.situacaoId) || null
                  : null
              }
              onSaved={sincronizarGradeEscala}
              onClose={fecharModal}
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'selecionar-tripulante' && (
          <Suspense fallback={null}>
            <ModalSelecionarTripulante
              tripulantes={tripulantesCoberturaFiltrados}
              onSelect={(tripulanteId) => abrirDecisaoTripulante({ tripulanteId })}
              onClose={fecharModal}
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'alocar-tripulante' && tripulanteModalSelecionado && escalaAtual && (
          <Suspense fallback={null}>
            <ModalAlocarTripulante
              tripulante={tripulanteModalSelecionado}
              quinzenas={quinzenas}
              escalaMes={escalaAtual.mes}
              escalaAno={escalaAtual.ano}
              quinzenaNumeroInicial={modalAberto.quinzenaNumero}
              quinzenaIdInicial={modalAberto.quinzenaId}
              dataInicioInicial={modalAberto.dataInicio}
              dataFimInicial={modalAberto.dataFim}
              onAlocarAeronave={({ tripulanteId, quinzenaId, dataInicio, dataFim }) => {
                abrirModal({
                  tipo: 'adicionar-alocacao',
                  escalaId: escalaAtual.id,
                  modoFluxoB: true,
                  funcionarioInicialId: tripulanteId,
                  funcaoInicial: tripulanteModalSelecionado.cargo === 'copiloto' ? 'SIC' : 'PIC',
                  quinzenaInicial: quinzenaId,
                  dataInicioInicial: dataInicio,
                  dataFimInicial: dataFim,
                });
              }}
              onRegistrarSituacao={({ tripulanteId, quinzenaId, dataInicio, dataFim }) => {
                abrirSituacao(undefined, {
                  modoFluxoB: true,
                  funcionarioInicialId: tripulanteId,
                  quinzenaInicial: quinzenaId,
                  dataInicioInicial: dataInicio,
                  dataFimInicial: dataFim,
                });
              }}
              onClose={fecharModal}
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'adicionar-evento' && (
          <Suspense fallback={null}>
            <ModalAdicionarEvento
              escalaId={modalAberto.escalaId}
              funcionarioId={modalAberto.funcionarioId}
              dataInicial={modalAberto.data}
              onSaved={sincronizarGradeEscala}
              onClose={fecharModal}
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'detalhes-evento' && (
          <Suspense fallback={null}>
            <ModalDetalhesEvento
              eventoId={modalAberto.eventoId}
              escalaId={escalaAtual?.id}
              evento={eventoDetalhes}
              escalaStatus={escalaAtual?.status}
              onClose={fecharModal}
              onRemover={handleEventoRemovido}
              onAtualizado={sincronizarGradeEscala}
              onIniciarRevisao={
                escalaAtual?.status === 'publicada' ? () => abrirFluxoRevisao() : undefined
              }
            />
          </Suspense>
        )}
        {modalAberto?.tipo === 'conflitos' && (
          <Suspense fallback={null}>
            <ModalVerificarConflitos escalaId={modalAberto.escalaId} onClose={fecharModal} />
          </Suspense>
        )}

        {/* ── Modais de publicação e transição de status ── */}
        {modalPublicar && escalaAtual && (
          <Suspense fallback={null}>
            <ModalPublicarEscala
              modo={modalPublicar}
              escalaLabel={`Escala ${MESES[escalaAtual.mes - 1]}/${escalaAtual.ano}`}
              cobertura={resumoCoberturaTripulantes}
              totalConflitos={totalConflitos}
              totalAlocacoes={alocacoesOperacionaisVisiveis.length}
              numeroRevisaoAtual={escalaAtual.numero_revisao ?? 0}
              onConfirmar={async (justificativa) => {
                if (escalaAtual.status === 'aprovada') {
                  // aprovada → publicada (seja primeira publicação ou revisão após reabrir)
                  await handleAlterarStatus(justificativa);
                } else {
                  // publicada → publicada (re-publicação direta pelo atalho no Mais menu)
                  await handleRepublicar(justificativa);
                }
                setModalPublicar(null);
              }}
              onClose={() => setModalPublicar(null)}
            />
          </Suspense>
        )}

        {modalTransicao && escalaAtual && (
          <Suspense fallback={null}>
            <ModalConfirmarTransicao
              tipo={modalTransicao}
              escalaLabel={`Escala ${MESES[escalaAtual.mes - 1]}/${escalaAtual.ano}`}
              onConfirmar={async (novoStatus, justificativa) => {
                await handleTransicaoStatus(novoStatus, justificativa);
                setModalTransicao(null);
              }}
              onClose={fecharModalTransicao}
            />
          </Suspense>
        )}

        {funcionarioEditandoId && (
          <Suspense fallback={null}>
            <ModalFuncionario
              aberto={!!funcionarioEditandoId}
              funcionario={{ id: funcionarioEditandoId }}
              onFechar={() => setFuncionarioEditandoId(null)}
              onSalvar={salvarFuncionarioNaEscala}
              mostrarConfiguracaoEscala
            />
          </Suspense>
        )}

        {/* Confirmação de remoção de alocação */}
        {confirmarRemoverAlocacao && (
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/30">
            <div className="mx-4 w-full max-w-sm space-y-4 rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-slate-100">Remover alocação?</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {confirmarRemoverAlocacao.nome} será removido desta escala. Eventos automáticos
                    (VOO/FOL) também serão removidos.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmarRemoverAlocacao(null)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    try {
                      await removerAlocacaoOperacional(
                        confirmarRemoverAlocacao.escalaId,
                        confirmarRemoverAlocacao.alocacaoId,
                      );
                      toast.success('Alocação removida');
                      // refreshEscalaData() inside removerAlocacaoOperacional already
                      // invalidates + refetches all escalas query keys (calendario,
                      // alocacoes, cobertura, coberturaTripulantes, conflitos, detail).
                      // No additional manual refetch needed here.
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Erro ao remover alocação');
                    } finally {
                      setConfirmarRemoverAlocacao(null);
                    }
                  }}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmarRemoverSituacao && (
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/30">
            <div className="mx-4 w-full max-w-sm space-y-4 rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-slate-100">Remover situação?</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {confirmarRemoverSituacao.nome} será removido da seção de situações da escala.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmarRemoverSituacao(null)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    try {
                      await handleRemoverSituacao(
                        confirmarRemoverSituacao.escalaId,
                        confirmarRemoverSituacao.situacaoId,
                      );
                      toast.success('Situação removida');
                      await sincronizarGradeEscala();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Erro ao remover situação');
                    } finally {
                      setConfirmarRemoverSituacao(null);
                    }
                  }}
                  className="px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600 rounded-lg"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal FDP / Fadiga */}
        {fdpModalAberto && (
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Moon className="w-5 h-5 text-red-600" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    FDP / Limite de Fadiga — {MESES[(escalaAtual?.mes ?? 1) - 1]} {escalaAtual?.ano}
                  </h2>
                </div>
                <button
                  onClick={() => setFdpModalAberto(false)}
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                {fdpAlertas.length === 0 ? (
                  <div className="py-8">
                    <EmptyState
                      icon={<CheckCircle size={48} className="text-emerald-400" />}
                      title="Nenhum alerta de fadiga"
                      description="Todos os tripulantes estão dentro dos limites."
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                      Critérios: &gt;20 dias voo no mês <strong>ou</strong> ≥6 dias consecutivos de
                      voo
                    </p>
                    {fdpAlertas.map((a) => (
                      <div
                        key={`fdp-${a.nome}-${a.diasVoo}`}
                        className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10"
                      >
                        <UserX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{a.nome}</p>
                          <p className="mt-0.5 text-xs text-red-700 dark:text-red-200">{a.alerta}</p>
                          <div className="mt-1 flex gap-3">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Total dias voo: <strong>{a.diasVoo}</strong>
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Max consecutivo: <strong>{a.maxConsec}</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-800">
                <button
                  onClick={() => setFdpModalAberto(false)}
                  className="px-4 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vista por Tripulante modal */}
        {showVistaTripulante && dadosCalendario && escalaAtual && (
          <Suspense fallback={null}>
            <VistaTripulante
              escalaId={escalaAtual.id}
              mes={escalaAtual.mes}
              ano={escalaAtual.ano}
              tripulacoes={dadosCalendario.tripulacoes}
              eventos={dadosCalendario.eventos}
              onClose={() => setShowVistaTripulante(false)}
            />
          </Suspense>
        )}

        {/* Comparação de Versões */}
        {showComparacao && dadosCalendario && (
          <Suspense fallback={null}>
            <ComparacaoVersao
              tripulacoes={dadosCalendario.tripulacoes}
              eventos={dadosCalendario.eventos}
              snapshot={snapshotComparacao ?? null}
              revisaoLabel={
                revisaoComparacaoNum !== null
                  ? revisaoComparacaoNum === 0
                    ? 'publicação inicial'
                    : `Revisão ${revisaoComparacaoNum}`
                  : undefined
              }
              onClose={() => {
                setShowComparacao(false);
                setRevisaoComparacaoNum(null);
              }}
            />
          </Suspense>
        )}

        {modalExportarPdfAberto && escalaAtual && (
          <Suspense fallback={null}>
            <ModalExportarEscalaPdf
              isOpen={modalExportarPdfAberto}
              visaoGrade={visaoGrade}
              equipamentos={equipamentosExportacao}
              loading={exportandoPdf}
              onClose={() => setModalExportarPdfAberto(false)}
              onConfirm={abrirExportacaoPdf}
            />
          </Suspense>
        )}

        {/* Snapshot completo de revisão específica */}
        {snapshotVerNum !== null && escalaAtual && (
          <Suspense fallback={null}>
            <ModalSnapshotRevisao
              escalaId={escalaAtual.id}
              revisaoNum={snapshotVerNum}
              revisaoLabel={
                snapshotVerNum === 0 ? 'Publicação inicial' : `Revisão ${snapshotVerNum}`
              }
              escalaLabel={`Escala ${MESES[escalaAtual.mes - 1]}/${escalaAtual.ano}`}
              onClose={() => setSnapshotVerNum(null)}
            />
          </Suspense>
        )}

        {/* Histórico de Revisões */}
        {showRevisoes && escalaAtual && (
          <div className="fixed inset-0 z-modal bg-black/40 flex items-center justify-center p-4">
            <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
              <Suspense fallback={panelFallback}>
                <PainelRevisoes
                  escalaId={escalaAtual.id}
                  onClose={() => setShowRevisoes(false)}
                  onVerCompleto={(revisaoNum) => {
                    setSnapshotVerNum(revisaoNum);
                    setShowRevisoes(false);
                  }}
                  onComparar={(revisaoNum) => {
                    setRevisaoComparacaoNum(revisaoNum);
                    setShowComparacao(true);
                    setShowRevisoes(false);
                  }}
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
