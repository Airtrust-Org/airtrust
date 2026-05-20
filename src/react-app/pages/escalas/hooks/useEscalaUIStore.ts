// src/react-app/pages/escalas/hooks/useEscalaUIStore.ts
//
// Store de ESTADO DE UI do módulo de escalas.
// Não persistido — reseta ao recarregar a página.
// Separado do store de config para minimizar rerenders.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const DEFAULT_TIPOS_EVENTO_VISIVEIS = [
  'VOO',
  'VIM',
  'TSO',
  'SIM',
  'MED',
  'CHK',
  'REA',
  'TRB',
  'FOL',
  'SMH',
  'FER',
  'LIC',
] as const;

export type ModalAberto =
  | { tipo: 'criar-escala' }
  | { tipo: 'ferias-afastamento-global' }
  | {
      tipo: 'nova-situacao';
      escalaId: string;
      situacaoId?: string;
      modoFluxoB?: boolean;
      funcionarioInicialId?: string | null;
      quinzenaInicial?: number;
      dataInicioInicial?: string;
      dataFimInicial?: string;
      fluxo?: 'geral' | 'ferias-afastamento';
      tiposPermitidos?: Array<'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB'>;
      situacaoTipoInicial?: 'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB';
    }
  | {
      tipo: 'adicionar-alocacao';
      escalaId: string;
      aeronaveInicial?: string | null;
      aeronaveIdInicial?: string | number | null;
      modoGestaoAeronave?: boolean;
      modoFluxoB?: boolean;
      funcionarioInicialId?: string | null;
      funcaoInicial?: 'PIC' | 'SIC' | 'PIC_CHK' | 'SIC_CHK' | 'INSTRUTOR' | 'FLEX';
      quinzenaInicial?: number;
      dataInicioInicial?: string;
      dataFimInicial?: string;
    }
  | { tipo: 'selecionar-tripulante'; escalaId: string }
  | {
      tipo: 'alocar-tripulante';
      escalaId: string;
      tripulanteId: string;
      quinzenaNumero?: 1 | 2;
      quinzenaId?: number;
      dataInicio?: string;
      dataFim?: string;
    }
  | { tipo: 'editar-alocacao'; alocacaoId: string; escalaId: string }
  | { tipo: 'adicionar-evento'; escalaId: string; funcionarioId: string; data: string }
  | { tipo: 'detalhes-evento'; eventoId: string }
  | { tipo: 'conflitos'; escalaId: string }
  | { tipo: 'restricoes' }
  | { tipo: 'config-modulo' }
  | null;

export type PainelId =
  | 'tripulacoes'
  | 'estatisticas'
  | 'restricoes'
  | 'disponibilidade'
  | 'workload';

interface CelulaSelecionada {
  funcionarioId: string;
  data: string;
}

interface EscalaUIStore {
  // Escala atualmente aberta
  escalaAtualId: string | null;
  setEscalaAtual: (id: string | null) => void;
  resetEscalaState: (escalaAtualId?: string | null, escalaStatus?: string) => void;

  // Filtros visuais
  filtroNome: string;
  setFiltroNome: (v: string) => void;

  filtroAeronave: string | null;
  setFiltroAeronave: (v: string | null) => void;

  filtroTripulante: string | null;
  setFiltroTripulante: (v: string | null) => void;

  filtroQuinzena: 'todas' | 'q1' | 'q2';
  setFiltroQuinzena: (v: 'todas' | 'q1' | 'q2') => void;

  visaoGrade: 'aeronave' | 'tripulante';
  setVisaoGrade: (v: 'aeronave' | 'tripulante') => void;

  highlightAlocacao: string | null;
  setHighlightAlocacao: (v: string | null) => void;

  tiposEventoVisiveis: string[];
  toggleTipoEvento: (tipo: string) => void;
  mostrarTodosOsTipos: (tipos?: string[]) => void;

  // Vista contínua
  visaoContinua: boolean;
  toggleVisaoContinua: () => void;

  // Painel lateral
  painelAberto: PainelId | null;
  setPainelAberto: (p: PainelId | null) => void;

  // Multi-seleção
  celulasSelecionadas: CelulaSelecionada[];
  selecionarCelula: (funcionarioId: string, data: string, multi: boolean) => void;
  limparSelecao: () => void;

  // Modo de edição inline
  modoEdicao: boolean;
  setModoEdicao: (v: boolean) => void;

  // Modal ativo
  modalAberto: ModalAberto;
  abrirModal: (modal: ModalAberto) => void;
  fecharModal: () => void;
}

export const useEscalaUIStore = create<EscalaUIStore>()(
  devtools(
    (set) => ({
      escalaAtualId: null,
      setEscalaAtual: (id) => set({ escalaAtualId: id }),
      resetEscalaState: (escalaAtualId = null, escalaStatus?: string) =>
        set({
          escalaAtualId,
          filtroNome: '',
          filtroAeronave: null,
          filtroTripulante: null,
          filtroQuinzena: 'todas',
          visaoGrade: 'aeronave',
          highlightAlocacao: null,
          tiposEventoVisiveis: [...DEFAULT_TIPOS_EVENTO_VISIVEIS],
          visaoContinua: false,
          painelAberto: null,
          celulasSelecionadas: [],
          modoEdicao: escalaStatus !== 'aprovada',
          modalAberto: null,
        }),

      filtroNome: '',
      setFiltroNome: (v) => set({ filtroNome: v }),

      filtroAeronave: null,
      setFiltroAeronave: (v) => set({ filtroAeronave: v }),

      filtroTripulante: null,
      setFiltroTripulante: (v) => set({ filtroTripulante: v }),

      filtroQuinzena: 'todas',
      setFiltroQuinzena: (v) => set({ filtroQuinzena: v }),

      visaoGrade: 'aeronave',
      setVisaoGrade: (v) => set({ visaoGrade: v }),

      highlightAlocacao: null,
      setHighlightAlocacao: (v) => set({ highlightAlocacao: v }),

      tiposEventoVisiveis: [...DEFAULT_TIPOS_EVENTO_VISIVEIS],
      toggleTipoEvento: (tipo) =>
        set((s) => {
          const atual = s.tiposEventoVisiveis;
          const existe = atual.includes(tipo);

          if (existe) {
            if (atual.length <= 1) return { tiposEventoVisiveis: atual };
            return { tiposEventoVisiveis: atual.filter((t) => t !== tipo) };
          }

          return { tiposEventoVisiveis: [...atual, tipo] };
        }),
      mostrarTodosOsTipos: (tipos) =>
        set({
          tiposEventoVisiveis:
            tipos && tipos.length > 0 ? tipos : [...DEFAULT_TIPOS_EVENTO_VISIVEIS],
        }),

      visaoContinua: false,
      toggleVisaoContinua: () => set((s) => ({ visaoContinua: !s.visaoContinua })),

      painelAberto: null,
      setPainelAberto: (p) => set((s) => ({ painelAberto: s.painelAberto === p ? null : p })),

      celulasSelecionadas: [],
      selecionarCelula: (funcionarioId, data, multi) =>
        set((s) => {
          if (!multi) return { celulasSelecionadas: [{ funcionarioId, data }] };
          const existe = s.celulasSelecionadas.some(
            (c) => c.funcionarioId === funcionarioId && c.data === data,
          );
          return {
            celulasSelecionadas: existe
              ? s.celulasSelecionadas.filter(
                  (c) => !(c.funcionarioId === funcionarioId && c.data === data),
                )
              : [...s.celulasSelecionadas, { funcionarioId, data }],
          };
        }),
      limparSelecao: () => set({ celulasSelecionadas: [] }),

      modoEdicao: false,
      setModoEdicao: (v) => set({ modoEdicao: v }),

      modalAberto: null,
      abrirModal: (modal) => set({ modalAberto: modal }),
      fecharModal: () => set({ modalAberto: null }),
    }),
    { name: 'escala-ui-store' },
  ),
);
