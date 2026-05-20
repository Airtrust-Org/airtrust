/**
 * useEscalas — Hooks para o módulo de Escalas Mensais
 *
 * Segue o mesmo padrão de useApi / useApiMutation de useFrms.ts
 */

import { useApi, useApiMutation } from '@/react-app/hooks/useApi';

// ================================================================
// TYPES
// ================================================================

export type TipoEvento =
  | 'voo'
  | 'viagem'
  | 'treinamento_solo'
  | 'treinamento_simulador'
  | 'medico'
  | 'cheque'
  | 'reaquisi'
  | 'trabalho'
  | 'folga'
  | 'standby'
  | 'ferias'
  | 'licenca';

export type StatusEscala = 'rascunho' | 'em_revisao' | 'aprovada' | 'publicada';

export interface EscalaMensal {
  id: string;
  mes: number;
  ano: number;
  titulo: string;
  status: StatusEscala;
  aprovado_por: string | null;
  aprovado_em: string | null;
  publicado_por: string | null;
  publicado_em: string | null;
  observacoes: string | null;
  criado_por_nome: string | null;
  aprovado_por_nome: string | null;
  total_tripulacoes: number;
  total_eventos: number;
  created_at: string;
}

export interface EscalaTripulacao {
  id: string;
  escala_id: string;
  pic_id: string;
  pic_nome: string;
  pic_matricula: string;
  sic_id: string | null;
  sic_nome: string | null;
  sic_matricula: string | null;
  data_inicio: string;
  data_fim: string;
  padrao_nome: string | null;
  padrao_escala_id: string | null;
  dias_trabalho: number | null;
  dias_folga: number | null;
  aeronave: string | null;
  base: string | null;
}

export interface EscalaEvento {
  id: string;
  escala_id: string;
  tripulacao_id: string | null;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_matricula: string;
  funcionario_cargo: string | null;
  tipo_evento: TipoEvento;
  data_inicio: string;
  data_fim: string;
  turno: string;
  local: string | null;
  aeronave: string | null;
  gerado_automaticamente: number;
  motivo_automatico: string | null;
  status: 'confirmado' | 'pendente' | 'cancelado';
  observacoes: string | null;
}

export interface PadraoEscala {
  id: string;
  nome: string;
  dias_trabalho: number;
  dias_folga: number;
  descricao: string | null;
  ativo: number;
}

export interface PilotoOption {
  id: string;
  nome: string;
  matricula: string;
  cargo: string | null;
}

export interface AlertaCMA {
  id: string;
  funcionario_nome: string;
  matricula: string;
  data_inicio: string;
  data_fim: string;
  cma_vencimento: string | null;
  dias_para_vencer: number | null;
}

export interface CalendarioData {
  escala: EscalaMensal;
  range: { inicio: string; fim: string };
  tripulacoes: EscalaTripulacao[];
  eventos: EscalaEvento[];
  alertas_cma: AlertaCMA[];
}

// ================================================================
// HOOKS — leitura (useApi)
// ================================================================

export function useEscalas() {
  return useApi<EscalaMensal[]>('/api/escalas');
}

export function useEscalaDetalhes(id: string | null) {
  return useApi<{
    escala: EscalaMensal;
    tripulacoes: EscalaTripulacao[];
    eventos: EscalaEvento[];
    alertas_cma: AlertaCMA[];
  }>(id ? `/api/escalas/${id}` : '', { enabled: !!id });
}

export function useEscalaCalendario(id: string | null, showContinuo = false) {
  const params = new URLSearchParams({
    incluir_mes_anterior: showContinuo ? 'true' : 'false',
    incluir_mes_seguinte: showContinuo ? 'true' : 'false',
  });
  return useApi<CalendarioData>(id ? `/api/escalas/${id}/calendario?${params}` : '', {
    enabled: !!id,
  });
}

export function useEscalaConflitos(id: string | null) {
  return useApi<{
    conflitos_eventos: unknown[];
    restricoes_violadas: unknown[];
    tem_conflitos: boolean;
  }>(id ? `/api/escalas/${id}/conflitos` : '', { enabled: !!id });
}

export function usePadroesEscala() {
  return useApi<PadraoEscala[]>('/api/escalas/padroes');
}

export function usePilotosDisponiveis() {
  return useApi<PilotoOption[]>('/api/escalas/funcionarios/pilotos');
}

// ================================================================
// HOOK — mutações (useApiMutation)
// ================================================================

export function useEscalaMutation() {
  return useApiMutation();
}
