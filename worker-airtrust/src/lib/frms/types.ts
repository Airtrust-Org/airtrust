/**
 * FRMS — Tipos compartilhados entre backend e lógica de cálculo
 */

// ─── Status de jornada ─────────────────────────────────────────────
export const FRMS_STATUS = [
  // Em Serviço
  'ES', // Escala de Serviço
  'TS', // Treinamento de Solo
  'TV', // Treinamento de Voo
  'EX', // Exame de Voo
  'RE', // Reserva
  'SA', // Sobreaviso
  // Fora de Serviço
  'FE', // Férias
  'FR', // Folga Regulamentar
  'FS', // Folga Social
  'AM', // Atestado Médico
  'DM', // Dispensa Médica
  'OT', // Outra
] as const;
export type FrmsStatus = (typeof FRMS_STATUS)[number];

// Status que contam como FDP (Flight Duty Period)
export const FDP_STATUS: FrmsStatus[] = ['ES', 'TS', 'TV', 'EX', 'RE', 'SA'];

// Status de folga (zeros em tudo)
export const FOLGA_STATUS: FrmsStatus[] = ['FE', 'FR', 'FS', 'AM', 'DM', 'OT'];

// ─── Origens de lançamento ─────────────────────────────────────────
export const ORIGENS = ['MANUAL', 'APUS', 'SIMULADOR', 'FIRA', 'SIGVOOS'] as const;
export type Origem = (typeof ORIGENS)[number];

// ─── Níveis de alerta ──────────────────────────────────────────────
export const NIVEIS_ALERTA = ['AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'] as const;
export type NivelAlerta = (typeof NIVEIS_ALERTA)[number];

// ─── Tipos de limite monitorados ───────────────────────────────────
export const TIPOS_LIMITE = [
  'FDP_DIARIO',
  'HV_DIARIA',
  'HV_7D',
  'HV_MES',
  'HV_365D',
  'REPOUSO',
] as const;
export type TipoLimite = (typeof TIPOS_LIMITE)[number];

// ─── Status de ciclo de escala ─────────────────────────────────────
export const STATUS_CICLO = ['ATIVO', 'ENCERRADO', 'CANCELADO'] as const;
export type StatusCiclo = (typeof STATUS_CICLO)[number];

// ─── Interfaces de dados ───────────────────────────────────────────

export interface FrmsJornada {
  id: string;
  tripulante_id: number;
  data: string; // YYYY-MM-DD
  status: FrmsStatus;
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
  origem: Origem;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Campos avançados (migration 0216)
  tipo_base?: 'HOME' | 'AWAY' | null;
  tripulacao_aumentada: number;
  classe_cabine: 'ECONOMY' | 'BUSINESS' | null;
  aclimatado?: number | null;
  // Campo FIRA (migration 0217)
  local_base: string | null;
  // Premissa de sono (migration 0353)
  hora_dormiu?: string | null;
  hora_acordou?: string | null;
  sono_efetivo_min?: number | null;
  fonte_sono?: 'PADRAO' | 'INFORMADO' | null;
  acordou_na_wocl?: number | null;
  repouso_regulatorio_min?: number | null;
}

export interface FrmsFatorizacao {
  id: string;
  jornada_id: string;
  processado_com_bug?: number;
  fator_basica_pct: number;
  fator_apresentacao_pct: number;
  fator_duracao_pct: number;
  fator_repouso_pct: number;
  fator_noturno_dep_pct: number;
  fator_noturno_arr_pct: number;
  fator_ciclo_embarcado_pct: number;
  total_fatorizado_jornada: number;
  fator_hv_basica_pct: number;
  fator_hv_quantidade_pct: number;
  fator_hv_noturno_dep_pct: number;
  fator_hv_noturno_arr_pct: number;
  total_fatorizado_hv: number;
  // Campos avançados (migration 0216)
  fator_base_away_pct: number;
  fator_aclimatacao_pct: number;
}

export interface FrmsAcumuloRolling {
  id: string;
  tripulante_id: number;
  data_referencia: string;
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

export interface FrmsAlerta {
  id: string;
  tripulante_id: number;
  jornada_id: string | null;
  tipo_limite: TipoLimite;
  nivel: NivelAlerta;
  percentual_atingido: number;
  valor_atual_min: number;
  valor_limite_min: number;
  mensagem: string;
  visualizado: number;
  visualizado_em: string | null;
  visualizado_por: string | null;
  resolvido: number;
  resolvido_em: string | null;
  resolvido_por: string | null;
  notas_resolucao: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FrmsEscala {
  id: string;
  tripulante_id: number;
  ano: number;
  ciclo: number;
  data_inicio_embarque: string;
  data_fim_embarque: string;
  data_inicio_folga: string;
  data_fim_folga: string;
  dias_embarcado: number;
  dias_folga: number;
  status_ciclo: StatusCiclo;
  observacao: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FrmsConfigLimite {
  id: string;
  nome: string;
  valor_numerico: number;
  unidade: string;
  descricao: string | null;
  ativo: number;
}

// ─── Mapa de limites (carregado do banco) ──────────────────────────

export interface LimitesMap {
  // ── Limites regulatórios (originais 14) ──
  FDP_MAXIMO_HORAS: number;
  REPOUSO_MINIMO_HORAS: number;
  HV_7_DIAS_HORAS: number; // política interna FRMS (RBAC 117 não define HV/7d para helicópteros)
  HV_28_DIAS_HORAS: number; // RBAC 117 Apêndice C: 93 h em 28 dias consecutivos
  HV_MES_HORAS: number; // Lei 13.475/2017 art. 30 IV: 90 h/mês calendário
  HV_365_DIAS_HORAS: number; // RBAC 117 Apêndice C: 930 h/365 dias (mais restritivo que Lei: 960 h)
  HV_DIARIA_HORAS: number;
  ALERTA_AVISO_PCT: number;
  ALERTA_ATENCAO_PCT: number;
  ALERTA_CRITICO_PCT: number;
  ALERTA_VIOLACAO_PCT: number;
  FDP_ALERTA_RESTANTE_HORAS: number;
  HV_DIA_ALERTA_RESTANTE_HORAS: number;
  REPOUSO_PLATAFORMA_MINIMO_HORAS: number;
  REPOUSO_PLATAFORMA_MAXIMO_HORAS: number;

  // ── Fator Ciclo Embarcado ──
  CICLO_EMBARCADO_DIA_INICIO: number;
  CICLO_EMBARCADO_DIA_MAX: number;
  CICLO_EMBARCADO_PCT_MIN: number;
  CICLO_EMBARCADO_PCT_MAX: number;
  CICLO_EMBARCADO_ATIVO: number;

  // ── Fator Apresentação (faixas horárias) ──
  APRESENTACAO_MADRUGADA_H_MIN: number;
  APRESENTACAO_MADRUGADA_H_MAX: number;
  APRESENTACAO_MADRUGADA_FATOR: number;
  APRESENTACAO_AMANHECER_H_MIN: number;
  APRESENTACAO_AMANHECER_H_MAX: number;
  APRESENTACAO_AMANHECER_FATOR: number;
  APRESENTACAO_DIURNO_H_MIN: number;
  APRESENTACAO_DIURNO_H_MAX: number;
  APRESENTACAO_DIURNO_FATOR: number;
  APRESENTACAO_TARDE_H_MIN: number;
  APRESENTACAO_TARDE_H_MAX: number;
  APRESENTACAO_TARDE_FATOR: number;
  APRESENTACAO_NOITE_FATOR: number;

  // ── Fator Duração ──
  DURACAO_LONGA_MINUTOS: number;
  DURACAO_LONGA_FATOR: number;
  DURACAO_CURTA_MINUTOS: number;
  DURACAO_CURTA_FATOR: number;
  DURACAO_NORMAL_FATOR: number;

  // ── Fator Repouso ──
  REPOUSO_ADEQUADO_MINUTOS: number;
  REPOUSO_ADEQUADO_FATOR: number;
  REPOUSO_RUIM_MINUTOS: number;
  REPOUSO_RUIM_FATOR: number;
  REPOUSO_CRITICO_FATOR: number;

  // ── Noturno (WOCL) ──
  NOTURNO_INICIO_HORA: number;
  NOTURNO_FIM_HORA: number;
  NOTURNO_FATOR: number;

  // ── Fator HV Quantidade ──
  HV_MUITAS_MINUTOS: number;
  HV_MUITAS_FATOR: number;
  HV_POUCAS_MINUTOS: number;
  HV_POUCAS_FATOR: number;
  HV_NORMAL_FATOR: number;

  // ── Fatores Operacionais avançados (migration 0216) ──
  FATOR_BASE_AWAY_PCT: number;
  FATOR_ACLIMATADO_NAO_PCT: number;
  FATOR_TRIPULACAO_AUM_HORAS: number;

  // ── Thresholds visuais (early warning — migration 0215) ──
  // Separados dos limites regulatórios (ALERTA_*_PCT).
  // Permitem semaforizar o dashboard ANTES de atingir o limite regulatório.
  VISUAL_AVISO_PCT: number;
  VISUAL_ATENCAO_PCT: number;
  VISUAL_CRITICO_PCT: number;

  // ── Thresholds Científicos de Effectiveness (SAFTE-FAST — migration 0263) ──
  EFFECTIV_VERDE_MIN: number;
  EFFECTIV_AMARELO_MAX: number;
  EFFECTIV_VERMELHO_MAX: number;
  EFFECTIV_PERIODO_PCT: number;

  // ── Modelo de sono offshore (migration 0267) ──
  REPOUSO_MIN_PRE_APRESENTACAO: number;
  REPOUSO_MIN_POS_LIBERACAO: number;
  REPOUSO_QUALIDADE_HOTEL: number;

  // ── Período embarcado — degradação progressiva (migration 0268) ──
  FRMS_EMBARQUE_PROGRESSO_MAX: number;

  // ── Premissa operacional de sono (migration 0353) ──
  MINUTOS_ANTES_APRESENTACAO: number;
  HORAS_SONO_PADRAO: number;
}

/** Valores padrão (fallback se banco estiver vazio) */
export const LIMITES_DEFAULT: LimitesMap = {
  // Regulatórios
  FDP_MAXIMO_HORAS: 11,
  REPOUSO_MINIMO_HORAS: 12,
  HV_7_DIAS_HORAS: 45, // política interna (conservadora) — RBAC 117 não define HV/7d
  HV_28_DIAS_HORAS: 93, // RBAC 117 Apêndice C — 28 dias consecutivos
  HV_MES_HORAS: 90, // Lei 13.475/2017 — mês calendário
  HV_365_DIAS_HORAS: 930, // RBAC 117 — mais restritivo que Lei (960 h/ano)
  HV_DIARIA_HORAS: 8,
  ALERTA_AVISO_PCT: 80,
  ALERTA_ATENCAO_PCT: 90,
  ALERTA_CRITICO_PCT: 95,
  ALERTA_VIOLACAO_PCT: 101,
  FDP_ALERTA_RESTANTE_HORAS: 3,
  HV_DIA_ALERTA_RESTANTE_HORAS: 2,
  REPOUSO_PLATAFORMA_MINIMO_HORAS: 3,
  REPOUSO_PLATAFORMA_MAXIMO_HORAS: 6,

  // Ciclo Embarcado
  CICLO_EMBARCADO_DIA_INICIO: 1,
  CICLO_EMBARCADO_DIA_MAX: 15,
  CICLO_EMBARCADO_PCT_MIN: 0,
  CICLO_EMBARCADO_PCT_MAX: -0.15, // negativo: penalidade crescente ao longo do ciclo
  CICLO_EMBARCADO_ATIVO: 1,

  // Apresentação
  APRESENTACAO_MADRUGADA_H_MIN: 0,
  APRESENTACAO_MADRUGADA_H_MAX: 4,
  APRESENTACAO_MADRUGADA_FATOR: -0.2,
  APRESENTACAO_AMANHECER_H_MIN: 5,
  APRESENTACAO_AMANHECER_H_MAX: 6,
  APRESENTACAO_AMANHECER_FATOR: -0.05, // pequena penalidade circadiana ao amanhecer
  APRESENTACAO_DIURNO_H_MIN: 7,
  APRESENTACAO_DIURNO_H_MAX: 11,
  APRESENTACAO_DIURNO_FATOR: 0,
  APRESENTACAO_TARDE_H_MIN: 12,
  APRESENTACAO_TARDE_H_MAX: 17,
  APRESENTACAO_TARDE_FATOR: -0.1,
  APRESENTACAO_NOITE_FATOR: -0.2,

  // Duração
  DURACAO_LONGA_MINUTOS: 600,
  DURACAO_LONGA_FATOR: -0.1,
  DURACAO_CURTA_MINUTOS: 360,
  DURACAO_CURTA_FATOR: -0.1,
  DURACAO_NORMAL_FATOR: 0,

  // Repouso
  REPOUSO_ADEQUADO_MINUTOS: 720,
  REPOUSO_ADEQUADO_FATOR: 0,
  REPOUSO_RUIM_MINUTOS: 480,
  REPOUSO_RUIM_FATOR: -0.1,
  REPOUSO_CRITICO_FATOR: -0.2,

  // Noturno
  NOTURNO_INICIO_HORA: 22,
  NOTURNO_FIM_HORA: 5,
  NOTURNO_FATOR: -0.1, // negativo: WOCL penaliza efetividade

  // HV Quantidade
  HV_MUITAS_MINUTOS: 300,
  HV_MUITAS_FATOR: -0.1, // negativo: excesso de HV = fadiga
  HV_POUCAS_MINUTOS: 120,
  HV_POUCAS_FATOR: -0.1,
  HV_NORMAL_FATOR: 0,

  // Fatores Operacionais avançados
  FATOR_BASE_AWAY_PCT: -0.1, // negativo: operação fora da base = penalidade
  FATOR_ACLIMATADO_NAO_PCT: -0.1, // negativo: não-aclimatado = penalidade
  FATOR_TRIPULACAO_AUM_HORAS: 2.0,

  // Thresholds visuais (early warning)
  VISUAL_AVISO_PCT: 40,
  VISUAL_ATENCAO_PCT: 85,
  VISUAL_CRITICO_PCT: 95,

  // Thresholds Científicos de Effectiveness (SAFTE-FAST)
  EFFECTIV_VERDE_MIN: 90,
  EFFECTIV_AMARELO_MAX: 77,
  EFFECTIV_VERMELHO_MAX: 65,
  EFFECTIV_PERIODO_PCT: 30,

  // Modelo de sono offshore
  REPOUSO_MIN_PRE_APRESENTACAO: 90,
  REPOUSO_MIN_POS_LIBERACAO: 60,
  REPOUSO_QUALIDADE_HOTEL: 92,

  // Período embarcado — degradação progressiva
  FRMS_EMBARQUE_PROGRESSO_MAX: 8,

  // Premissa operacional de sono
  MINUTOS_ANTES_APRESENTACAO: 90,
  HORAS_SONO_PADRAO: 8,
};

// ─── Effectiveness Result (SAFTE-FAST) ─────────────────────────────

export type EffectivenessNivel = 'verde' | 'amarelo' | 'atencao' | 'vermelho';

export interface EffectivenessResult {
  effectiveness_pct: number;
  nivel: EffectivenessNivel;
  tempo_abaixo_limiar_pct: number;
  fatorizacao_delta: number;
  fator_basica_calibrado_pct: number;
  fator_apresentacao_calibrado_pct: number;
  fator_repouso_calibrado_pct: number;
  total_fatorizado_calibrado_jornada: number;
  duracao_sono_efetiva_min: number | null;
  hora_despertar: string | null;
  hora_inicio_sono: string | null;
  fonte_sono: 'PADRAO' | 'INFORMADO';
  acordou_na_wocl: boolean;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
  componentes: {
    processo_s: number;
    processo_c: number;
    repouso: number;
    hv: number;
    duracao: number;
  };
}
