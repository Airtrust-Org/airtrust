// src/react-app/pages/escalas/hooks/useEscalaStore.ts
//
// FIX-09: Store Facade — delegates to split stores (useEscalaUIStore + useEscalaConfigStore).
// All consumers import from here — no code changes needed.
// The split stores manage the actual state; this hook is a thin combiner.

import { useEscalaUIStore } from './useEscalaUIStore';
import { useEscalaConfigStore, type TipoEvento } from './useEscalaConfigStore';
export type { TipoEvento } from './useEscalaConfigStore';
export type { ModalAberto, PainelId } from './useEscalaUIStore';
export { DEFAULT_TIPOS_EVENTO_VISIVEIS } from './useEscalaUIStore';

/**
 * Combined facade hook — merges UI store + Config store into a single
 * object with the same API surface as the original monolithic store.
 * All 6+ consumers keep working unchanged.
 */
export function useEscalaStore() {
  // Pull everything from split stores
  const ui = useEscalaUIStore();
  const config = useEscalaConfigStore();

  return {
    // From UI store
    escalaAtualId: ui.escalaAtualId,
    setEscalaAtual: ui.setEscalaAtual,
    resetEscalaState: ui.resetEscalaState,
    filtroNome: ui.filtroNome,
    setFiltroNome: ui.setFiltroNome,
    filtroAeronave: ui.filtroAeronave,
    setFiltroAeronave: ui.setFiltroAeronave,
    filtroTripulante: ui.filtroTripulante,
    setFiltroTripulante: ui.setFiltroTripulante,
    filtroQuinzena: ui.filtroQuinzena,
    setFiltroQuinzena: ui.setFiltroQuinzena,
    visaoGrade: ui.visaoGrade,
    setVisaoGrade: ui.setVisaoGrade,
    highlightAlocacao: ui.highlightAlocacao,
    setHighlightAlocacao: ui.setHighlightAlocacao,
    tiposEventoVisiveis: ui.tiposEventoVisiveis,
    toggleTipoEvento: ui.toggleTipoEvento,
    mostrarTodosOsTipos: ui.mostrarTodosOsTipos,
    visaoContinua: ui.visaoContinua,
    toggleVisaoContinua: ui.toggleVisaoContinua,
    painelAberto: ui.painelAberto,
    setPainelAberto: ui.setPainelAberto,
    celulasSelecionadas: ui.celulasSelecionadas,
    selecionarCelula: ui.selecionarCelula,
    limparSelecao: ui.limparSelecao,
    modoEdicao: ui.modoEdicao,
    setModoEdicao: ui.setModoEdicao,
    modalAberto: ui.modalAberto,
    abrirModal: ui.abrirModal,
    fecharModal: ui.fecharModal,

    // From Config store (persisted)
    alertasCMAMinimizados: config.alertasCMAMinimizados,
    toggleAlertasCMA: config.toggleAlertasCMA,
    eventoConfigOverrides: config.eventoConfigOverrides,
    setEventoConfigOverride: config.setEventoConfigOverride,
    resetEventoConfigOverrides: config.resetEventoConfigOverrides,
    exibirNome: config.exibirNome,
    setExibirNome: config.setExibirNome,
  };
}
