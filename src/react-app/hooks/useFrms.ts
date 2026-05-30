/**
 * FRMS — Hook personalizado para chamadas API do módulo FRMS
 */
import { useApi, useApiMutation } from '@/react-app/hooks/useApi';

export interface FrmsJornadaRow {
  id: string;
  tripulante_id: number;
  data: string;
  status: string;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_minutos: number | null;
  horas_voo_minutos: number | null;
  hora_primeiro_acionamento: string | null;
  hora_primeira_decolagem: string | null;
  hora_ultimo_pouso: string | null;
  hora_corte_motor: string | null;
  repouso_plataforma_inicio: string | null;
  repouso_plataforma_fim: string | null;
  repouso_plataforma_valido: number;
  observacao: string | null;
  registrado_por: string;
  origem: string;
  created_at: string;
  hora_dormiu?: string | null;
  hora_acordou?: string | null;
  sono_efetivo_min?: number | null;
  fonte_sono?: 'PADRAO' | 'INFORMADO' | string | null;
  acordou_na_wocl?: number | null;
  repouso_regulatorio_min?: number | null;
  // Campos avançados (migration 0216)
  tipo_base?: 'HOME' | 'AWAY';
  tripulacao_aumentada?: number;
  classe_cabine?: string | null;
  aclimatado?: number;
  fatorizacao?: {
    fator_basica_pct: number;
    fator_apresentacao_pct: number;
    fator_duracao_pct: number;
    fator_repouso_pct: number;
    fator_noturno_dep_pct: number;
    fator_noturno_arr_pct: number;
    total_fatorizado_jornada: number;
    fator_hv_basica_pct: number;
    fator_hv_quantidade_pct: number;
    fator_hv_noturno_dep_pct: number;
    fator_hv_noturno_arr_pct: number;
    total_fatorizado_hv: number;
  };
}

export interface FrmsAcumuloRolling {
  hv_7_dias_min: number;
  hv_28_dias_min: number;
  hv_365_dias_min: number;
  hv_mes_calendario_min: number;
  hv_dia_min: number;
  pct_limite_7d: number;
  pct_limite_28d: number;
  pct_limite_mes_calendario: number;
  pct_limite_365d: number;
  pct_limite_dia: number;
  repouso_anterior_min: number;
  repouso_suficiente: number;
}

export interface FrmsFrotaRow {
  tripulante_id: string;
  nome: string;
  nome_guerra?: string;
  aeronave_id?: string | null;
  aeronave_prefixo?: string | null;
  aeronave_modelo?: string | null;
  quinzena_numero?: number | null;
  quinzena_tipo?: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
  hv_mes_min: number;
  pct_mes: number;
  hv_7d_min: number;
  pct_7d: number;
  hv_365d_min: number;
  pct_365d: number;
  hv_dia_min: number;
  pct_dia: number;
  nivel_max: string;
  // Effectiveness (proxy local não validado) — Painel A
  effectiveness_pct?: number;
  effectiveness_nivel?: string;
  effectiveness_componentes?: {
    processo_s: number;
    processo_c: number;
    repouso: number;
    hv: number;
    duracao: number;
  };
}

export interface FrmsAlertaRow {
  id: string;
  tripulante_id: string;
  jornada_id: string | null;
  data_jornada?: string | null;
  data_fato?: string | null;
  tipo_limite: string;
  nivel: string;
  percentual_atingido: number;
  valor_atual_min: number;
  valor_limite_min: number;
  mensagem: string;
  nome_tripulante?: string;
  visualizado: number;
  visualizado_em: string | null;
  visualizado_por: string | null;
  resolvido: number;
  resolvido_em: string | null;
  resolvido_por: string | null;
  notas_resolucao: string | null;
  created_at: string;
}

export interface FrmsEscalaRow {
  id: string;
  tripulante_id: string;
  ano: number;
  ciclo: number;
  data_inicio_embarque: string;
  data_fim_embarque: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  dias_embarcado: number;
  dias_folga: number;
  status_ciclo: string;
  observacao: string | null;
  created_at: string;
}

export function useFrmsEscalas(tripulanteId: string | undefined) {
  const url = tripulanteId ? `/api/frms/escalas/${tripulanteId}` : null;
  return useApi<FrmsEscalaRow[]>(url || '', { enabled: !!tripulanteId, requireAuth: false });
}

export interface FrmsJornadasPaginado {
  data: FrmsJornadaRow[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export function useFrmsJornadas(
  tripulanteId: string | undefined,
  mes?: string,
  page?: number,
  version?: number,
) {
  const params = new URLSearchParams();
  if (mes) {
    const matchMes = mes.match(/^(\d{4})-(\d{1,2})$/);
    if (matchMes) {
      const ano = Number(matchMes[1]);
      const mesNum = Number(matchMes[2]);
      const mesPad = String(mesNum).padStart(2, '0');
      params.set('mes', `${ano}-${mesPad}`);
      const ultimoDia = new Date(ano, mesNum, 0).getDate();
      params.set('data_inicio', `${ano}-${mesPad}-01`);
      params.set('data_fim', `${ano}-${mesPad}-${String(ultimoDia).padStart(2, '0')}`);
    } else {
      params.set('mes', mes);
      params.set('data_inicio', `${mes}-01`);
      params.set('data_fim', `${mes}-31`);
    }
  }
  if (page && page > 1) params.set('page', String(page));
  if (version && version > 0) params.set('_v', String(version));
  const query = params.toString();
  const url = tripulanteId ? `/api/frms/jornadas/${tripulanteId}${query ? `?${query}` : ''}` : null;
  return useApi<FrmsJornadasPaginado>(url || '', {
    enabled: !!tripulanteId,
    dedupeInitial: false,
    requireAuth: false,
    bypassGetCache: true,
  });
}

export function useFrmsUltimaJornada(
  tripulanteId: string | undefined,
  options?: { dataInicio?: string; dataFim?: string },
) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('pageSize', '1');
  if (options?.dataInicio) params.set('data_inicio', options.dataInicio);
  if (options?.dataFim) params.set('data_fim', options.dataFim);
  const query = params.toString();
  const url = tripulanteId ? `/api/frms/jornadas/${tripulanteId}?${query}` : null;
  return useApi<FrmsJornadasPaginado>(url || '', {
    enabled: !!tripulanteId,
    dedupeInitial: false,
    requireAuth: false,
    bypassGetCache: true,
  });
}

export function useFrmsAcumulo(tripulanteId: string | undefined, mes?: string) {
  const params = mes ? `?mes=${mes}` : '';
  const url = tripulanteId ? `/api/frms/acumulo/${tripulanteId}${params}` : null;
  return useApi<{
    nome: string;
    rolling: FrmsAcumuloRolling | null;
    mensal: Record<string, number> | null;
    limites: Record<string, number> | null;
    effectiveness: {
      effectiveness_pct: number;
      effectiveness_nivel: string;
      effectiveness_componentes: Record<string, number> | null;
    } | null;
  }>(url || '', { enabled: !!tripulanteId, requireAuth: false, bypassGetCache: true });
}

export function useFrmsFrota(mes?: string, periodo?: number, quinzena?: 'Q1' | 'Q2' | '') {
  const params = new URLSearchParams();
  if (mes) params.set('mes', mes);
  if (periodo) params.set('periodo', String(periodo));
  if (mes && quinzena) params.set('quinzena', quinzena);
  const query = params.toString();
  return useApi<FrmsFrotaRow[]>(`/api/frms/acumulo-frota${query ? `?${query}` : ''}`, {
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

export function useFrmsAlertas(filtros?: Record<string, string>) {
  const params = filtros ? '?' + new URLSearchParams(filtros).toString() : '';
  return useApi<FrmsAlertaRow[]>(`/api/frms/alertas${params}`, {
    requireAuth: false,
    dedupeInitial: false,
    bypassGetCache: true,
    staleTime: 1 * 60 * 1000, // 1 min
  });
}

// ─── Effectiveness timeline (endpoint /api/frms/tripulante/:id/jornadas?dias=N) ──

export interface FrmsEffectivenessJornadaRow {
  id: string;
  jornada_id: string;
  processado_com_bug: number | null;
  data_apresentacao: string;
  data_liberacao: string;
  effectiveness_pct: number | null;
  effectiveness_nivel: string | null;
  effectiveness_componentes_json: string | null;
  total_fatorizado_jornada: number | null;
  fator_basica_pct: number | null;
  fator_repouso_pct: number | null;
  fator_noturno_dep_pct: number | null;
  fator_noturno_arr_pct: number | null;
  fator_hv_quantidade_pct: number | null;
  fator_apresentacao_pct: number | null;
  fator_ciclo_embarcado_pct: number | null;
  duracao_sono_efetiva_min: number | null;
  hora_despertar_estimada: string | null;
  hora_inicio_sono_estimado: string | null;
  tempo_abaixo_limiar_min: number | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
}

export interface FrmsDayExplanationFactor {
  codigo: 'basica' | 'processo_s' | 'processo_c' | 'repouso' | 'hv' | 'duracao';
  titulo: string;
  impacto_pct: number;
  impacto_abs_pct: number;
  direcao: 'penaliza' | 'favorece' | 'neutro';
  resumo: string;
}

export interface FrmsDayExplanationRecommendation {
  codigo: string;
  prioridade: 'alta' | 'media' | 'baixa';
  titulo: string;
  descricao: string;
}

export interface FrmsDayExplanationResponse {
  tripulante: {
    id: string;
    nome: string;
    cargo: string | null;
  };
  jornada: {
    data: string;
    hora_apresentacao: string | null;
    hora_acordou: string | null;
    effectiveness_pct: number | null;
    effectiveness_nivel: string | null;
    tempo_abaixo_limiar_min: number | null;
    dias_criticos_consecutivos: number;
    duracao_sono_efetiva_min: number | null;
    hora_despertar_estimada: string | null;
    hora_inicio_sono_estimado: string | null;
    dia_periodo_embarcado: number | null;
    total_dias_periodo: number | null;
  };
  diagnostico: {
    faixa: string;
    resumo_executivo: string;
    explicacao_tecnica: string;
    explicacao_didatica: string;
    fator_principal: string;
    fatores: FrmsDayExplanationFactor[];
    recomendacoes: FrmsDayExplanationRecommendation[];
  };
  copiloto: {
    texto: string;
    provider: string;
    model: string;
  };
}

export function useFrmsJornadasEffectiveness(
  tripulanteId: string | null | undefined,
  dias = 30,
  range?: { inicio?: string; fim?: string },
) {
  const params = new URLSearchParams();
  params.set('dias', String(dias));
  if (range?.inicio && range?.fim) {
    params.set('inicio', range.inicio);
    params.set('fim', range.fim);
  }
  const url = tripulanteId
    ? `/api/frms/tripulante/${tripulanteId}/jornadas?${params.toString()}`
    : null;
  return useApi<FrmsEffectivenessJornadaRow[]>(url ?? '', {
    enabled: !!tripulanteId,
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFrmsDayExplanation(
  tripulanteId: string | null | undefined,
  data: string | null | undefined,
  options?: { source?: 'dashboard' | 'ficha' | 'desconhecida' },
) {
  const source = options?.source ?? 'desconhecida';
  const url =
    tripulanteId && data
      ? `/api/frms/tripulante/${tripulanteId}/explicacao-dia?data=${encodeURIComponent(data)}&origem=${encodeURIComponent(source)}`
      : '';
  return useApi<FrmsDayExplanationResponse>(url, {
    enabled: !!tripulanteId && !!data,
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 60 * 1000,
  });
}

export interface FrmsCompareDiasResponse {
  dia_a: {
    data: string;
    effectiveness_pct: number | null;
    nivel: string;
    fatores: Array<{ codigo: string; impacto_pts: number; motivo_simples: string }>;
  };
  dia_b: {
    data: string;
    effectiveness_pct: number | null;
    nivel: string;
    fatores: Array<{ codigo: string; impacto_pts: number; motivo_simples: string }>;
  };
  diferenca_pts: number;
  fatores_pioraram: string[];
  fatores_melhoraram: string[];
  analise_delta: string;
}

export function useFrmsCompararDias(
  tripulanteId: string | null | undefined,
  dataA: string | null | undefined,
  dataB: string | null | undefined,
  source: 'dashboard' | 'ficha' = 'dashboard',
) {
  const url =
    tripulanteId && dataA && dataB
      ? `/api/frms/comparar-dias/${tripulanteId}?data_a=${encodeURIComponent(dataA)}&data_b=${encodeURIComponent(dataB)}&origem=${source}`
      : '';
  return useApi<FrmsCompareDiasResponse>(url, {
    enabled: !!tripulanteId && !!dataA && !!dataB,
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 10 * 1000,
  });
}

export interface FrmsSimulacaoResponse {
  is_simulacao: true;
  parametros_simulados: {
    hora_apresentacao_simulada: string | null;
    hora_acordou_simulada: string | null;
    sono_efetivo_simulado_min: number;
  };
  resultado_real: {
    effectiveness_pct: number | null;
    nivel: string | null;
    fatores: Record<string, number>;
  };
  resultado_simulado: {
    effectiveness_pct: number | null;
    nivel: string | null;
    fatores: Record<string, number>;
  };
  diferenca_pts: number;
  conclusao: string;
}

export interface FrmsJustificativaDocumento {
  tripulante: { id: string; nome: string; matricula: string | null };
  data_voo: string;
  effectiveness_real: number | null;
  nivel_fadiga: string;
  fatores_determinantes: string[];
  decisao_tomada: string;
  fundamentacao: string;
  recomendacao_sistema: string;
  observacoes: string;
  gerado_por: { id: string; nome: string; role: string };
  gerado_em: string;
  texto_formal: string;
}

export interface FrmsJustificativaGeradaResponse {
  documento: FrmsJustificativaDocumento;
  assinatura_hash: string;
  justificativa_id: string;
}

export interface FrmsJustificativaListItem {
  id: string;
  data_voo: string;
  decisao_tomada: string;
  gerado_por_nome: string;
  created_at: string;
}

export function useFrmsJustificativas(tripulanteId: string | null | undefined, enabled = true) {
  const url = tripulanteId ? `/api/frms/justificativas/${tripulanteId}` : '';
  return useApi<FrmsJustificativaListItem[]>(url, {
    enabled: !!tripulanteId && enabled,
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 15 * 1000,
  });
}

export function useFrmsAlertasCount() {
  return useApi<{ count: number }>('/api/frms/alertas/count', {
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 1 * 60 * 1000, // 1 min
  });
}

export function useFrmsLimites() {
  return useApi<Record<string, number>>('/api/frms/limites', {
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 15 * 60 * 1000, // 15 min
  });
}

export interface FrmsConfigRow {
  id: string;
  nome: string;
  valor_numerico: number;
  unidade: string;
  descricao: string | null;
  ativo: number;
}

export function useFrmsConfiguracoes() {
  return useApi<{ configs: FrmsConfigRow[]; limites: Record<string, number> }>(
    '/api/frms/configuracoes',
    { requireAuth: false, bypassGetCache: true, staleTime: 15 * 60 * 1000 },
  );
}

export interface FrmsNotificacaoRow {
  id: string;
  alerta_id: string;
  funcionario_id: number;
  cargo: string;
  lido: number;
  lido_em: string | null;
  created_at: string;
  mensagem: string;
  nivel: string;
}

export function useFrmsNotificacoes(filtros?: Record<string, string>) {
  const params = filtros ? '?' + new URLSearchParams(filtros).toString() : '';
  return useApi<FrmsNotificacaoRow[]>(`/api/frms/notificacoes${params}`, {
    requireAuth: false,
    bypassGetCache: true,
  });
}

export function useFrmsNotificacoesCount() {
  return useApi<{ count: number }>('/api/frms/notificacoes/count', {
    requireAuth: false,
    bypassGetCache: true,
  });
}

export function useFrmsMutation() {
  return useApiMutation();
}

export interface FrmsNotificacaoConfigRow {
  id: string;
  cargo: string;
  nivel_minimo: string;
  ativo: number;
}

export function useFrmsNotificacaoConfig() {
  return useApi<FrmsNotificacaoConfigRow[]>('/api/frms/configuracoes/notificacoes', {
    requireAuth: false,
    bypassGetCache: true,
  });
}

export interface FrmsFadigaCheckinRow {
  id: string;
  empresa_id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  data_checkin: string;
  hora_checkin: string;
  kss_score: number;
  horas_sono: number;
  qualidade_sono: number;
  sintomas_json: string | null;
  observacoes: string | null;
  score_fadiga: number;
  nivel_fadiga: 'BAIXO' | 'MODERADO' | 'ALTO' | 'CRITICO';
  status_operacional: 'APTO' | 'MONITORADO' | 'RESTRITO' | 'NAO_APTO';
  recomendacao: string;
  apto: number;
  fit_for_duty?: boolean;
  wake_time?: string | null;
  horas_sono_48h?: number | null;
  subjective_fatigue_level?: number | null;
  sleepiness_level?: number | null;
  computed_risk_level?: 'normal' | 'attention' | 'critical' | 'unfit_for_duty' | 'not_submitted';
  requires_operational_review?: number;
  data_source?: 'crew_reported' | 'default_estimate' | 'not_applicable';
  requires_frat_review: number;
  frat_sugerido_nivel: string | null;
  associado_frat_avaliacao_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FrmsFadigaConfig {
  ativo: number;
  janela_inicio: string;
  janela_fim: string;
  threshold_amarelo: number;
  threshold_vermelho: number;
  peso_kss: number;
  peso_sono_duracao: number;
  peso_sono_qualidade: number;
  peso_sintomas: number;
}

export interface FrmsFadigaFratSuggestion {
  nivelRiscoSugerido: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  justificativa: string;
  fatores: Array<{
    codigo: string;
    categoria: string;
    resposta: string;
    score_sugerido: number;
    justificativa: string;
  }>;
}

export function useFrmsFadigaCheckinMe(date?: string) {
  const params = date ? `?date=${date}` : '';
  return useApi<FrmsFadigaCheckinRow | null>(`/api/frms/fadiga-checkin/me${params}`, {
    requireAuth: false,
    bypassGetCache: true,
    dedupeInitial: false,
  });
}

export function useFrmsFadigaConfig() {
  return useApi<FrmsFadigaConfig>('/api/frms/fadiga-checkin/config', {
    requireAuth: false,
    bypassGetCache: true,
    staleTime: 10 * 60 * 1000,
  });
}

export function useFrmsFadigaHistorico(filtros?: Record<string, string>) {
  const params = filtros ? '?' + new URLSearchParams(filtros).toString() : '';
  return useApi<FrmsFadigaCheckinRow[]>(`/api/frms/fadiga-checkin/historico${params}`, {
    requireAuth: false,
    bypassGetCache: true,
    dedupeInitial: false,
  });
}

export function useFrmsFadigaPainel(data?: string) {
  const params = data ? `?data=${data}` : '';
  return useApi<{
    data: string;
    resumo: Record<string, number>;
    itens: FrmsFadigaCheckinRow[];
  }>(`/api/frms/fadiga-checkin/painel${params}`, {
    requireAuth: false,
    bypassGetCache: true,
    dedupeInitial: false,
  });
}

export interface FrmsDailyFatigueStatus {
  date: string;
  funcionario_id?: number;
  status: 'normal' | 'attention' | 'critical' | 'unfit_for_duty' | 'not_submitted' | 'no_duty';
  submitted: boolean;
  data_source: 'crew_reported' | 'default_estimate' | 'not_applicable';
  confidence: 'reported' | 'reduced';
  message: string;
  requires_operational_review: boolean | number;
  sleep_hours_24h: number;
  sleep_hours_48h?: number | null;
  wake_time: string;
  fit_for_duty?: boolean | null;
}

export interface FrmsDailyFatigueAlert {
  id: string;
  tripulante_id: number | string;
  tripulante_nome?: string;
  nivel: string;
  tipo_limite: string;
  mensagem: string;
  resolvido: number;
  resolvido_em: string | null;
  created_at: string;
  alert_type?: string;
  requires_operational_review?: number;
}

export function useFrmsDailyFatigue(date?: string, scope?: 'team') {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (scope) params.set('scope', scope);
  const query = params.toString();
  return useApi<{ date: string; items?: FrmsDailyFatigueStatus[] } & FrmsDailyFatigueStatus>(
    `/api/frms/daily-fatigue${query ? `?${query}` : ''}`,
    {
      requireAuth: false,
      bypassGetCache: true,
      dedupeInitial: false,
    },
  );
}

export function useFrmsDailyFatigueAlerts(date?: string) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  const query = params.toString();
  return useApi<{ count: number; items: FrmsDailyFatigueAlert[] }>(
    `/api/frms/daily-fatigue/alerts${query ? `?${query}` : ''}`,
    {
      requireAuth: false,
      bypassGetCache: true,
      dedupeInitial: false,
    },
  );
}

export function useFrmsFadigaAnalytics(dias = 30) {
  return useApi<{ dias: number; serie: Array<Record<string, number | string | null>> }>(
    `/api/frms/fadiga-checkin/analytics?dias=${dias}`,
    {
      requireAuth: false,
      bypassGetCache: true,
    },
  );
}
