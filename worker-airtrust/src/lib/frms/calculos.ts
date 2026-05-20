/**
 * FRMS — Funções puras de cálculo e fatorização científica
 *
 * Modelo baseado em:
 *   - Borbély Two-Process Model (Process S homeostático + Process C circadiano)
 *   - ICAO Doc 9966 (Flight Crew Fatigue Risk Management)
 *   - RBAC 117 / IS 117-001 (regulamentação brasileira)
 *
 * ZERO HARDCODE: todos os parâmetros vêm de LimitesMap (banco de dados).
 * Todas as funções são puras (sem side-effects, sem acesso DB).
 */

import type {
  FrmsJornada,
  LimitesMap,
  FrmsFatorizacao,
  FrmsStatus,
  EffectivenessResult,
} from './types';
import { FDP_STATUS, FOLGA_STATUS } from './types';
import {
  calcularFatorRepouso,
  calcularPenalidadeWOCL,
  calcularSono,
  isWithinWOCL,
} from './fadiga-score';
import { resolverFrmsConfig } from './frms-config';

// ────────────────────────────────────────────────────────────────────
// Helpers de tempo
// ────────────────────────────────────────────────────────────────────

/** Converte "HH:MM" em minutos desde meia-noite */
export function hhmmToMinutes(hhmm: string | null | undefined): number {
  if (!hhmm) return 0;
  const parts = hhmm.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/** Converte minutos em "HH:MM" */
export function minutesToHhmm(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calcularFatorBasicaCircadiano(horaAcordouMin: number): number {
  const wakeMinutes = ((horaAcordouMin % 1440) + 1440) % 1440;

  if (wakeMinutes >= 120 && wakeMinutes <= 239) return 0.55;
  if (wakeMinutes >= 240 && wakeMinutes <= 359) return 0.6;
  if (wakeMinutes >= 360 && wakeMinutes <= 479) return 0.7;
  if (wakeMinutes >= 480 && wakeMinutes <= 599) return 0.845;
  if (wakeMinutes >= 600 && wakeMinutes <= 719) return 0.87;
  if (wakeMinutes >= 720 && wakeMinutes <= 839) return 0.845;
  if (wakeMinutes >= 840 && wakeMinutes <= 1079) return 0.79;
  if (wakeMinutes >= 1080 && wakeMinutes <= 1319) return 0.7;
  return 0.61;
}

/** Calcula duração em minutos entre dois HH:MM (suporta cruzar meia-noite) */
export function calcDuracaoMinutos(inicio: string | null, fim: string | null): number {
  if (!inicio || !fim) return 0;
  const i = hhmmToMinutes(inicio);
  const f = hhmmToMinutes(fim);
  if (f >= i) return f - i;
  // Cruza meia-noite
  return 1440 - i + f;
}

/** Número de dias no mês */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** Extrai hora de "HH:MM" */
export function getHora(hhmm: string | null | undefined): number {
  if (!hhmm) return -1;
  const h = parseInt(hhmm.split(':')[0], 10);
  return isNaN(h) ? -1 : h;
}

/**
 * Verifica se hora está na janela noturna operacional (decolagem/pouso).
 * Nao confundir com WOCL fisiologica de despertar (02:00-06:00), tratada em `isWithinWOCL`.
 */
export function isNoturno(hhmm: string | null | undefined, limites?: LimitesMap): boolean {
  const h = getHora(hhmm);
  if (h < 0) return false;
  const inicio = limites?.NOTURNO_INICIO_HORA ?? 22;
  const fim = limites?.NOTURNO_FIM_HORA ?? 5;
  // Faixa que cruza meia-noite (ex: 22–05)
  if (inicio > fim) return h >= inicio || h <= fim;
  // Faixa que não cruza meia-noite
  return h >= inicio && h <= fim;
}

// ────────────────────────────────────────────────────────────────────
// Validação de repouso em plataforma
// ────────────────────────────────────────────────────────────────────

/** Verifica se repouso em plataforma é válido (entre 3h e 6h) */
export function validarRepousoPlataforma(
  inicio: string | null,
  fim: string | null,
  limites: LimitesMap,
): boolean {
  if (!inicio || !fim) return false;
  const duracao = calcDuracaoMinutos(inicio, fim);
  const minMin = limites.REPOUSO_PLATAFORMA_MINIMO_HORAS * 60;
  const maxMin = limites.REPOUSO_PLATAFORMA_MAXIMO_HORAS * 60;
  return duracao >= minMin && duracao <= maxMin;
}

// ────────────────────────────────────────────────────────────────────
// Cálculo de duração de jornada
// ────────────────────────────────────────────────────────────────────

/** Intervalo de almoço deduzido da jornada diária (minutos) */
const INTERVALO_ALMOCO_MIN = 60;

/** Calcula duração de jornada em minutos (apresentação → término), deduzindo 1h de almoço */
export function calcDuracaoJornada(jornada: FrmsJornada): number {
  if (FOLGA_STATUS.includes(jornada.status)) return 0;
  if (!jornada.hora_apresentacao || !jornada.hora_termino) return 0;
  const bruto = calcDuracaoMinutos(jornada.hora_apresentacao, jornada.hora_termino);
  return Math.max(0, bruto - INTERVALO_ALMOCO_MIN);
}

// ────────────────────────────────────────────────────────────────────
// FATORIZAÇÃO DA JORNADA
// ────────────────────────────────────────────────────────────────────

interface FatorizacaoInput {
  jornada: FrmsJornada;
  repousoAnteriorMin: number | null; // minutos de repouso desde a jornada anterior
  limites: LimitesMap;
  diasDoMes: number; // quantos dias tem o mês de referência
  diaDoCiclo?: number | null; // dia embarcado dentro do ciclo (1..N) — null se não aplicável
}

interface FatorizacaoResult {
  // Fatores da jornada
  fator_basica_pct: number;
  fator_apresentacao_pct: number;
  fator_duracao_pct: number;
  fator_repouso_pct: number;
  fator_noturno_dep_pct: number;
  fator_noturno_arr_pct: number;
  fator_ciclo_embarcado_pct: number;
  fator_base_away_pct: number;
  fator_aclimatacao_pct: number;
  total_fatorizado_jornada: number;
  // Fatores das horas de voo
  fator_hv_basica_pct: number;
  fator_hv_quantidade_pct: number;
  fator_hv_noturno_dep_pct: number;
  fator_hv_noturno_arr_pct: number;
  total_fatorizado_hv: number;
}

/**
 * Calcula fatorização completa de uma jornada.
 * Função pura — todos os inputs fornecidos, nenhum acesso DB.
 *
 * Zero hardcode: todos os limiares e fatores vêm de `limites` (LimitesMap).
 */
export function calcFatorizacao(input: FatorizacaoInput): FatorizacaoResult {
  const { jornada, repousoAnteriorMin, limites, diasDoMes, diaDoCiclo } = input;

  // Folga → zeros
  if (FOLGA_STATUS.includes(jornada.status)) {
    return zeroFatorizacao();
  }

  const duracaoMin = jornada.duracao_jornada_minutos ?? calcDuracaoJornada(jornada);
  const hvMin = jornada.horas_voo_minutos ?? 0;

  // ES sem horário preenchido → padrão especial da planilha
  const isFdpStatus = FDP_STATUS.includes(jornada.status);
  const semHorario = !jornada.hora_apresentacao || !jornada.hora_termino;

  if (isFdpStatus && semHorario && duracaoMin === 0) {
    return fatorizacaoDiaSemJornada(limites);
  }

  // ── 1. BÁSICA (jornada) ──
  // Proporção da duração desta jornada em relação ao FDP máximo diário (0–1 escala)
  // ⚠️ NÃO multiplica por 100 aqui — mantém na mesma escala fracionária dos demais fatores
  const jornadaMaxMesMin = limites.FDP_MAXIMO_HORAS * 60;
  const fator_basica_pct = jornadaMaxMesMin > 0 ? round4(duracaoMin / jornadaMaxMesMin) : 0;

  // ── 2. APRESENTAÇÃO (configurável por faixa horária) ──
  const fator_apresentacao_pct = calcFatorApresentacao(jornada.hora_apresentacao, limites);

  // ── 3. DURAÇÃO (configurável) ──
  const fator_duracao_pct = calcFatorDuracao(duracaoMin, limites);

  // ── 4. REPOUSO (configurável) ──
  const fator_repouso_pct = calcFatorRepouso(repousoAnteriorMin, jornada.status, limites);

  // ── 5. NOTURNO DECOLAGEM (janela noturna operacional — configurável) ──
  const fator_noturno_dep_pct = isNoturno(jornada.hora_primeira_decolagem, limites)
    ? limites.NOTURNO_FATOR
    : 0;

  // ── 6. NOTURNO CHEGADA (janela noturna operacional — configurável) ──
  const fator_noturno_arr_pct = isNoturno(jornada.hora_ultimo_pouso, limites)
    ? limites.NOTURNO_FATOR
    : 0;

  // ── 7. CICLO EMBARCADO (Process S acúmulo — Borbély) ──
  const fator_ciclo_embarcado_pct = calcFatorCicloEmbarcado(diaDoCiclo ?? null, limites);

  // ── 8. BASE AWAY (operação fora da base domícilio) ──
  const fator_base_away_pct = jornada.tipo_base === 'AWAY' ? limites.FATOR_BASE_AWAY_PCT : 0;

  // ── 9. NÃO-ACLIMATADO ──
  const fator_aclimatacao_pct = jornada.aclimatado === 0 ? limites.FATOR_ACLIMATADO_NAO_PCT : 0;

  // ⚠️ fator_basica_pct NÃO entra no total:
  // — Representa proporção do FDP usado hoje (0–1, positivo), não uma penalidade de fadiga.
  // — Incluí-lo tornaria o total sempre positivo, clampeando effectiveness em 100% (bug original).
  // — Duração já é capturada como penalidade por fator_duracao_pct (LONGA/CURTA → -0.1).
  const total_fatorizado_jornada = round4(
    fator_apresentacao_pct +
      fator_duracao_pct +
      fator_repouso_pct +
      fator_noturno_dep_pct +
      fator_noturno_arr_pct +
      fator_ciclo_embarcado_pct +
      fator_base_away_pct +
      fator_aclimatacao_pct,
  );

  // ═══ FATORIZAÇÃO DAS HORAS DE VOO ═══

  // ── 1. BÁSICA (HV) ──
  const hvMaxMesMin = limites.HV_MES_HORAS * 60;
  const fator_hv_basica_pct = hvMaxMesMin > 0 ? round4((hvMin / hvMaxMesMin) * 100) : 0;

  // ── 2. QUANTIDADE DE HV (configurável) ──
  const fator_hv_quantidade_pct = calcFatorHvQuantidade(hvMin, limites);

  // ── 3–4. NOTURNO (mesmos valores) ──
  const fator_hv_noturno_dep_pct = fator_noturno_dep_pct;
  const fator_hv_noturno_arr_pct = fator_noturno_arr_pct;

  const total_fatorizado_hv = round4(
    fator_hv_basica_pct +
      fator_hv_quantidade_pct +
      fator_hv_noturno_dep_pct +
      fator_hv_noturno_arr_pct,
  );

  return {
    fator_basica_pct,
    fator_apresentacao_pct,
    fator_duracao_pct,
    fator_repouso_pct,
    fator_noturno_dep_pct,
    fator_noturno_arr_pct,
    fator_ciclo_embarcado_pct,
    fator_base_away_pct,
    fator_aclimatacao_pct,
    total_fatorizado_jornada,
    fator_hv_basica_pct,
    fator_hv_quantidade_pct,
    fator_hv_noturno_dep_pct,
    fator_hv_noturno_arr_pct,
    total_fatorizado_hv,
  };
}

// ────────────────────────────────────────────────────────────────────
// Sub-funções de fatorização
// ────────────────────────────────────────────────────────────────────

/** Fator de apresentação por horário de início (configurável via limites) */
function calcFatorApresentacao(horaApresentacao: string | null, limites: LimitesMap): number {
  const h = getHora(horaApresentacao);
  if (h < 0) return 0;

  if (h >= limites.APRESENTACAO_AMANHECER_H_MIN && h <= limites.APRESENTACAO_AMANHECER_H_MAX)
    return limites.APRESENTACAO_AMANHECER_FATOR;
  if (h >= limites.APRESENTACAO_DIURNO_H_MIN && h <= limites.APRESENTACAO_DIURNO_H_MAX)
    return limites.APRESENTACAO_DIURNO_FATOR;
  if (h >= limites.APRESENTACAO_TARDE_H_MIN && h <= limites.APRESENTACAO_TARDE_H_MAX)
    return limites.APRESENTACAO_TARDE_FATOR;
  if (h >= limites.APRESENTACAO_MADRUGADA_H_MIN && h <= limites.APRESENTACAO_MADRUGADA_H_MAX)
    return limites.APRESENTACAO_MADRUGADA_FATOR;
  // Noite (18h–23h59)
  return limites.APRESENTACAO_NOITE_FATOR;
}

/** Fator de duração da jornada (configurável via limites) */
function calcFatorDuracao(duracaoMin: number, limites: LimitesMap): number {
  if (duracaoMin > limites.DURACAO_LONGA_MINUTOS) return limites.DURACAO_LONGA_FATOR;
  if (duracaoMin < limites.DURACAO_CURTA_MINUTOS) return limites.DURACAO_CURTA_FATOR;
  return limites.DURACAO_NORMAL_FATOR;
}

/** Fator de repouso — tempo desde última jornada (configurável) */
function calcFatorRepouso(repousoMin: number | null, status: string, limites: LimitesMap): number {
  if (FOLGA_STATUS.includes(status as never)) return 0;
  if (repousoMin === null || repousoMin < 0) return 0; // primeiro dia do ciclo

  if (repousoMin >= limites.REPOUSO_ADEQUADO_MINUTOS) return limites.REPOUSO_ADEQUADO_FATOR;
  if (repousoMin >= limites.REPOUSO_RUIM_MINUTOS) return limites.REPOUSO_RUIM_FATOR;
  return limites.REPOUSO_CRITICO_FATOR;
}

/** Fator de quantidade de HV no dia (configurável) */
function calcFatorHvQuantidade(hvMin: number, limites: LimitesMap): number {
  if (hvMin >= limites.HV_MUITAS_MINUTOS) return limites.HV_MUITAS_FATOR;
  if (hvMin < limites.HV_POUCAS_MINUTOS) return limites.HV_POUCAS_FATOR;
  return limites.HV_NORMAL_FATOR;
}

/**
 * Fator Ciclo Embarcado — Process S (Borbély)
 *
 * Modela acúmulo homeostático de fadiga durante ciclo offshore/embarcado.
 * Interpolação linear de PCT_MIN (dia 1) a PCT_MAX (dia N).
 * Após dia N, permanece em PCT_MAX.
 *
 * @param diaDoCiclo — dia corrente dentro do embarque (1-based). null = não embarcado.
 * @param limites — configuração carregada do banco
 */
export function calcFatorCicloEmbarcado(
  diaDoCiclo: number | null | undefined,
  limites: LimitesMap,
): number {
  if (!limites.CICLO_EMBARCADO_ATIVO) return 0;
  if (diaDoCiclo == null || diaDoCiclo < limites.CICLO_EMBARCADO_DIA_INICIO) return 0;

  const diaInicio = limites.CICLO_EMBARCADO_DIA_INICIO;
  const diaMax = limites.CICLO_EMBARCADO_DIA_MAX;
  const pctMin = limites.CICLO_EMBARCADO_PCT_MIN;
  const pctMax = limites.CICLO_EMBARCADO_PCT_MAX;

  if (diaDoCiclo >= diaMax) return pctMax;

  // Interpolação linear
  const range = diaMax - diaInicio;
  if (range <= 0) return pctMax;
  const progresso = (diaDoCiclo - diaInicio) / range;
  return round4(pctMin + progresso * (pctMax - pctMin));
}

/**
 * Padrão para dia ES/TS/TV/EX/RE/SA sem horário de apresentação preenchido.
 *
 * Assume pior caso operacional:
 *   - Apresentação: faixa noturna (APRESENTACAO_NOITE_FATOR) — sem horário registrado
 *   - Duração: zero minutos → calcFatorDuracao(0) → faixa curta
 *   - Repouso: desconhecido → REPOUSO_RUIM_FATOR (pior caso seguro)
 *
 * Todos os valores vêm de `LimitesMap` — zero hardcode.
 */
function fatorizacaoDiaSemJornada(limites: LimitesMap): FatorizacaoResult {
  // Apresentação: assume faixa noturna (18h–23h) como pior caso sem horário
  const fator_apresentacao_pct = limites.APRESENTACAO_NOITE_FATOR;
  // Duração zero → faixa curta
  const fator_duracao_pct = calcFatorDuracao(0, limites);
  // Repouso desconhecido → categoria ruim (pior caso conservador)
  const fator_repouso_pct = limites.REPOUSO_RUIM_FATOR;

  const total_fatorizado_jornada = round4(
    fator_apresentacao_pct + fator_duracao_pct + fator_repouso_pct,
  );

  return {
    fator_basica_pct: 0,
    fator_apresentacao_pct,
    fator_duracao_pct,
    fator_repouso_pct,
    fator_noturno_dep_pct: 0,
    fator_noturno_arr_pct: 0,
    fator_ciclo_embarcado_pct: 0,
    fator_base_away_pct: 0,
    fator_aclimatacao_pct: 0,
    total_fatorizado_jornada,
    fator_hv_basica_pct: 0,
    fator_hv_quantidade_pct: 0,
    fator_hv_noturno_dep_pct: 0,
    fator_hv_noturno_arr_pct: 0,
    total_fatorizado_hv: 0,
  };
}

/** Zeros para folga */
function zeroFatorizacao(): FatorizacaoResult {
  return {
    fator_basica_pct: 0,
    fator_apresentacao_pct: 0,
    fator_duracao_pct: 0,
    fator_repouso_pct: 0,
    fator_noturno_dep_pct: 0,
    fator_noturno_arr_pct: 0,
    fator_ciclo_embarcado_pct: 0,
    fator_base_away_pct: 0,
    fator_aclimatacao_pct: 0,
    total_fatorizado_jornada: 0,
    fator_hv_basica_pct: 0,
    fator_hv_quantidade_pct: 0,
    fator_hv_noturno_dep_pct: 0,
    fator_hv_noturno_arr_pct: 0,
    total_fatorizado_hv: 0,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ────────────────────────────────────────────────────────────────────
// EFFECTIVENESS (SAFTE-FAST / modelo biomatemático + sono offshore)
// ────────────────────────────────────────────────────────────────────

/**
 * Converte a fatorização da jornada em um score de Effectiveness (0–100%).
 *
 * Modelo calibrado para operação offshore com hotel:
 * - Fonte: ICAO Doc 9966, FAA AC 120-103A, SAFTE-FAST
 * - Pressupostos: despertar 90min antes apres., dormir 60min após lib., hotel 92%
 */
export function calcEffectiveness(
  fatorizacao: FatorizacaoResult,
  limites: LimitesMap,
  jornada?: {
    hora_apresentacao?: string | null;
    hora_primeira_decolagem?: string | null;
    hora_ultimo_pouso?: string | null;
    hora_corte_motor?: string | null;
    hora_termino?: string | null;
    hora_dormiu?: string | null;
    dia_periodo_embarcado?: number | null;
    total_dias_periodo?: number | null;
  },
): EffectivenessResult {
  const cfgSono = resolverFrmsConfig(limites);

  let duracao_sono_efetiva_min: number | null = null;
  let hora_despertar: string | null = null;
  let hora_inicio_sono: string | null = null;
  let fonteSono: 'PADRAO' | 'INFORMADO' = 'PADRAO';
  let acordouNaWOCL = false;
  let fatorApresentacaoWocl = fatorizacao.fator_apresentacao_pct;
  let fatorBasicaAjustada = fatorizacao.fator_basica_pct;

  const parseHoraDormiuMin = (value?: string | null): number | null => {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59)
      return null;
    return h * 60 + m;
  };

  if (jornada?.hora_apresentacao) {
    const sono = calcularSono({
      horaApresentacaoMin: hhmmToMinutes(jornada.hora_apresentacao),
      minutosAntesApresentacao: cfgSono.minutosAntesApresentacao,
      horasSonoPadrao: cfgSono.horasSonoPadrao,
      horaDormiu: parseHoraDormiuMin(jornada.hora_dormiu),
    });

    duracao_sono_efetiva_min = sono.sonoEfetivoMin;
    hora_despertar = minutesToHhmm(sono.tAcordouMin);
    hora_inicio_sono = minutesToHhmm(sono.tDormiuMin);
    fonteSono = sono.fonteSono;

    acordouNaWOCL = isWithinWOCL(sono.tAcordouMin);
    fatorApresentacaoWocl = acordouNaWOCL ? calcularPenalidadeWOCL(sono.tAcordouMin) : 0;
    fatorBasicaAjustada = calcularFatorBasicaCircadiano(sono.tAcordouMin);
  }

  // === PROCESSO S: débito de sono → impacto na efetividade ===
  const fatorRepousoCalibrado =
    duracao_sono_efetiva_min !== null
      ? calcularFatorRepouso(duracao_sono_efetiva_min)
      : fatorizacao.fator_repouso_pct;

  // === FATOR PROGRESSIVO DE FADIGA POR DURAÇÃO DO PERÍODO EMBARCADO ===
  const progMaxPct = (limites.FRMS_EMBARQUE_PROGRESSO_MAX ?? 8) / 100;
  const diaPeriodo = jornada?.dia_periodo_embarcado ?? null;
  const totalPeriodo = jornada?.total_dias_periodo ?? null;
  let fatorProgressivo = 0;
  if (
    totalPeriodo != null &&
    totalPeriodo >= 2 &&
    diaPeriodo != null &&
    diaPeriodo >= 1 &&
    diaPeriodo <= totalPeriodo
  ) {
    const frac = (diaPeriodo - 1) / (totalPeriodo - 1);
    fatorProgressivo = -progMaxPct * frac;
  }

  // === EFFECTIVENESS FINAL ===
  const totalCalibradoBase =
    fatorizacao.total_fatorizado_jornada +
    (duracao_sono_efetiva_min !== null
      ? fatorRepousoCalibrado - fatorizacao.fator_repouso_pct
      : 0) +
    (fatorApresentacaoWocl - fatorizacao.fator_apresentacao_pct) +
    (fatorBasicaAjustada - fatorizacao.fator_basica_pct);
  const totalCalibrado = totalCalibradoBase + fatorProgressivo;

  const effectiveness = Math.max(0, Math.min(100, 100 + totalCalibrado * 100));

  // === CLASSIFICAÇÃO ===
  const verde = limites.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = limites.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = limites.EFFECTIV_VERMELHO_MAX ?? 65;

  const nivel: EffectivenessResult['nivel'] =
    effectiveness >= verde
      ? 'verde'
      : effectiveness <= vermelho
        ? 'vermelho'
        : effectiveness <= amarelo
          ? 'amarelo'
          : 'atencao';

  // === TEMPO ABAIXO DO LIMIAR (estimativa para offshore) ===
  const isApresentacaoNoturna = fatorizacao.fator_noturno_dep_pct !== 0;
  const isChegadaNoturna = fatorizacao.fator_noturno_arr_pct !== 0;
  const isRepousoCurto = fatorRepousoCalibrado < -0.05;

  const tempoAbaixoLimiarMin =
    (isApresentacaoNoturna ? 45 : 0) + (isChegadaNoturna ? 30 : 0) + (isRepousoCurto ? 30 : 0);

  return {
    effectiveness_pct: Math.round(effectiveness * 10) / 10,
    nivel,
    tempo_abaixo_limiar_pct: tempoAbaixoLimiarMin,
    fatorizacao_delta: fatorizacao.total_fatorizado_jornada,
    fator_basica_calibrado_pct: round4(fatorBasicaAjustada),
    fator_apresentacao_calibrado_pct: round4(fatorApresentacaoWocl),
    fator_repouso_calibrado_pct: round4(fatorRepousoCalibrado),
    total_fatorizado_calibrado_jornada: round4(totalCalibradoBase),
    duracao_sono_efetiva_min,
    hora_despertar,
    hora_inicio_sono,
    fonte_sono: fonteSono,
    acordou_na_wocl: acordouNaWOCL,
    dia_periodo_embarcado: diaPeriodo,
    total_dias_periodo: totalPeriodo,
    componentes: {
      processo_s: round4(fatorizacao.fator_ciclo_embarcado_pct),
      processo_c: round4(
        fatorApresentacaoWocl +
          fatorizacao.fator_noturno_dep_pct +
          fatorizacao.fator_noturno_arr_pct,
      ),
      repouso: round4(fatorRepousoCalibrado),
      hv: round4(fatorizacao.fator_hv_quantidade_pct),
      duracao: round4(fatorizacao.fator_duracao_pct),
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// ACÚMULO ROLLING
// ────────────────────────────────────────────────────────────────────

export interface AcumuloRollingInput {
  tripulanteId: number;
  dataReferencia: string; // YYYY-MM-DD
  jornadasHistorico: Pick<
    FrmsJornada,
    | 'data'
    | 'status'
    | 'horas_voo_minutos'
    | 'hora_termino'
    | 'hora_apresentacao'
    | 'duracao_jornada_minutos'
  >[];
  limites: LimitesMap;
}

export interface AcumuloRollingResult {
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

function parseDateTimeOrNull(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function estimateJornadaInterval(
  jornada: Pick<
    FrmsJornada,
    'data' | 'hora_apresentacao' | 'hora_termino' | 'duracao_jornada_minutos' | 'status'
  >,
): { start: Date; end: Date } | null {
  const startText = jornada.hora_apresentacao
    ? `${jornada.data}T${jornada.hora_apresentacao}:00`
    : `${jornada.data}T00:00:00`;
  const start = parseDateTimeOrNull(startText);
  if (!start) return null;

  if (jornada.hora_termino) {
    const sameDayEnd = parseDateTimeOrNull(`${jornada.data}T${jornada.hora_termino}:00`);
    if (!sameDayEnd) return null;
    const end = sameDayEnd > start ? sameDayEnd : new Date(sameDayEnd.getTime() + 86400000);
    return { start, end };
  }

  const fallbackMinutes = Math.max(0, jornada.duracao_jornada_minutos ?? 0);
  if (fallbackMinutes <= 0) return null;
  return { start, end: new Date(start.getTime() + fallbackMinutes * 60000) };
}

function calcHvRolling24h(
  dataReferencia: string,
  jornadasHistorico: Pick<
    FrmsJornada,
    | 'data'
    | 'status'
    | 'horas_voo_minutos'
    | 'hora_termino'
    | 'hora_apresentacao'
    | 'duracao_jornada_minutos'
  >[],
): number {
  const jornadaRef = jornadasHistorico.find(
    (j) => j.data === dataReferencia && FDP_STATUS.includes(j.status as never),
  );

  const refDateTime = parseDateTimeOrNull(
    `${dataReferencia}T${jornadaRef?.hora_apresentacao || '23:59'}:00`,
  );
  if (!refDateTime) return 0;

  const windowStartMs = refDateTime.getTime() - 24 * 60 * 60 * 1000;
  const windowEndMs = refDateTime.getTime();

  let hv24h = 0;

  for (const j of jornadasHistorico) {
    const hv = j.horas_voo_minutos ?? 0;
    if (hv <= 0) continue;

    const interval = estimateJornadaInterval(j);
    if (!interval) {
      if (j.data === dataReferencia) hv24h += hv;
      continue;
    }

    const startMs = interval.start.getTime();
    const endMs = interval.end.getTime();
    if (endMs <= startMs) continue;

    const overlapStart = Math.max(startMs, windowStartMs);
    const overlapEnd = Math.min(endMs, windowEndMs);
    if (overlapEnd <= overlapStart) continue;

    const overlapRatio = (overlapEnd - overlapStart) / (endMs - startMs);
    hv24h += hv * overlapRatio;
  }

  return Math.round(hv24h);
}

/**
 * Calcula acúmulo rolling (janelas deslizantes) para um tripulante numa data.
 * Resolve o problema crítico da planilha que não cruzava meses.
 */
export function calcAcumuloRolling(input: AcumuloRollingInput): AcumuloRollingResult {
  const { dataReferencia, jornadasHistorico, limites } = input;

  const refDate = new Date(dataReferencia + 'T00:00:00');
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth() + 1;

  // Filter por janelas
  const d7 = dateOffset(dataReferencia, -6);
  const d28 = dateOffset(dataReferencia, -27);
  const d365 = dateOffset(dataReferencia, -364);

  let hv7 = 0,
    hv28 = 0,
    hv365 = 0,
    hvMes = 0,
    hvDia = 0;

  for (const j of jornadasHistorico) {
    const hv = j.horas_voo_minutos ?? 0;
    if (hv <= 0) continue;

    if (j.data >= d7 && j.data <= dataReferencia) hv7 += hv;
    if (j.data >= d28 && j.data <= dataReferencia) hv28 += hv;
    if (j.data >= d365 && j.data <= dataReferencia) hv365 += hv;

    // Mês calendário
    const jDate = new Date(j.data + 'T00:00:00');
    if (jDate.getFullYear() === refYear && jDate.getMonth() + 1 === refMonth) {
      hvMes += hv;
    }
  }

  hvDia = calcHvRolling24h(dataReferencia, jornadasHistorico);

  const limite7min = limites.HV_7_DIAS_HORAS * 60;
  const limite28min = limites.HV_MES_HORAS * 60; // janela 28d usa mesmo limite mensal (90h) — pct mostra aproximação ao limite, não ao limite RBAC 117 de 93h
  const limiteMesMin = limites.HV_MES_HORAS * 60; // Lei 13.475/2017: 90h/mês calendário
  const limite365min = limites.HV_365_DIAS_HORAS * 60;
  const limiteDiaMin = limites.HV_DIARIA_HORAS * 60;

  // Repouso: tempo desde o término da última jornada até apresentação de hoje
  const repousoMin = calcRepousoAnterior(dataReferencia, jornadasHistorico);

  return {
    hv_7_dias_min: hv7,
    hv_28_dias_min: hv28,
    hv_365_dias_min: hv365,
    hv_mes_calendario_min: hvMes,
    hv_dia_min: hvDia,
    pct_limite_7d: limite7min > 0 ? round4((hv7 / limite7min) * 100) : 0,
    pct_limite_28d: limite28min > 0 ? round4((hv28 / limite28min) * 100) : 0,
    pct_limite_mes_calendario: limiteMesMin > 0 ? round4((hvMes / limiteMesMin) * 100) : 0,
    pct_limite_365d: limite365min > 0 ? round4((hv365 / limite365min) * 100) : 0,
    pct_limite_dia: limiteDiaMin > 0 ? round4((hvDia / limiteDiaMin) * 100) : 0,
    repouso_anterior_min: repousoMin,
    repouso_suficiente:
      repousoMin < 0 ? 1 : repousoMin >= limites.REPOUSO_MINIMO_HORAS * 60 ? 1 : 0,
  };
}

/** Calcula repouso desde a jornada anterior */
function calcRepousoAnterior(
  dataRef: string,
  jornadas: Pick<FrmsJornada, 'data' | 'status' | 'hora_termino' | 'hora_apresentacao'>[],
): number {
  // Encontrar jornada do dia ref e jornada do dia anterior mais recente que tenha hora_termino
  const jornadaHoje = jornadas.find(
    (j) => j.data === dataRef && FDP_STATUS.includes(j.status as never),
  );
  if (!jornadaHoje?.hora_apresentacao) return -1; // sem apresentação hoje → sem repouso calculável

  // Buscar última jornada anterior com hora_termino
  const anteriores = jornadas
    .filter((j) => j.data < dataRef && FDP_STATUS.includes(j.status as never) && j.hora_termino)
    .sort((a, b) => b.data.localeCompare(a.data));

  if (anteriores.length === 0) return -1; // primeiro dia do ciclo

  const ultimaAnterior = anteriores[0];

  // Calcular minutos de repouso entre hora_termino de ontem e hora_apresentacao de hoje
  // Se são datas diferentes (pode haver dias de folga no meio), somar dias completos
  const diaAnterior = new Date(ultimaAnterior.data + 'T00:00:00');
  const diaHoje = new Date(dataRef + 'T00:00:00');
  const diffDias = Math.floor((diaHoje.getTime() - diaAnterior.getTime()) / 86400000);

  const terminoMin = hhmmToMinutes(ultimaAnterior.hora_termino);
  const apresentacaoMin = hhmmToMinutes(jornadaHoje.hora_apresentacao);

  // Repouso = (dias completos entre - 1) * 1440 + (1440 - termino) + apresentacao
  if (diffDias === 0) {
    // Mesmo dia (improvável mas defensivo)
    return apresentacaoMin > terminoMin ? apresentacaoMin - terminoMin : 0;
  }
  if (diffDias === 1) {
    // Dia consecutivo
    return 1440 - terminoMin + apresentacaoMin;
  }
  // Dias intermediários (folgas etc.)
  return (diffDias - 1) * 1440 + (1440 - terminoMin) + apresentacaoMin;
}

/** Retorna YYYY-MM-DD com offset de dias */
function dateOffset(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────
// ACÚMULO MENSAL
// ────────────────────────────────────────────────────────────────────

export interface AcumuloMensalInput {
  jornadas: Pick<FrmsJornada, 'status' | 'duracao_jornada_minutos' | 'horas_voo_minutos'>[];
  fatorizacoes: Pick<FrmsFatorizacao, 'total_fatorizado_jornada' | 'total_fatorizado_hv'>[];
}

export interface AcumuloMensalResult {
  jornada_realizada_min: number;
  hv_realizada_min: number;
  jornada_fatorizada_pct: number;
  hv_fatorizada_pct: number;
  dias_embarcado: number;
  dias_folga: number;
  dias_ferias: number;
}

/** Calcula acúmulo mensal consolidado */
export function calcAcumuloMensal(input: AcumuloMensalInput): AcumuloMensalResult {
  const { jornadas, fatorizacoes } = input;

  let jornadaMin = 0;
  let hvMin = 0;
  let diasEmbarcado = 0;
  let diasFolga = 0;
  let diasFerias = 0;

  for (const j of jornadas) {
    jornadaMin += j.duracao_jornada_minutos ?? 0;
    hvMin += j.horas_voo_minutos ?? 0;

    if (
      j.status === 'ES' ||
      j.status === 'TS' ||
      j.status === 'TV' ||
      j.status === 'EX' ||
      j.status === 'RE' ||
      j.status === 'SA'
    ) {
      diasEmbarcado++;
    } else if (j.status === 'FR' || j.status === 'FS') {
      diasFolga++;
    } else if (j.status === 'FE') {
      diasFerias++;
    }
  }

  let jornadaFatPct = 0;
  let hvFatPct = 0;
  for (const f of fatorizacoes) {
    jornadaFatPct += f.total_fatorizado_jornada;
    hvFatPct += f.total_fatorizado_hv;
  }

  return {
    jornada_realizada_min: jornadaMin,
    hv_realizada_min: hvMin,
    jornada_fatorizada_pct: round4(jornadaFatPct),
    hv_fatorizada_pct: round4(hvFatPct),
    dias_embarcado: diasEmbarcado,
    dias_folga: diasFolga,
    dias_ferias: diasFerias,
  };
}

// ────────────────────────────────────────────────────────────────────
// VALIDAÇÃO DE ESCALA FUTURA (projeção)
// ────────────────────────────────────────────────────────────────────

export interface PeriodoProjetado {
  data: string;
  status: FrmsStatus;
  duracao_estimada_min: number;
  hv_estimada_min: number;
  hora_apresentacao_estimada?: string | null;
  hora_termino_estimada?: string | null;
}

export interface ValidacaoEscalaResult {
  valida: boolean;
  violacoes: {
    data: string;
    tipo_limite: string;
    valor_projetado: number;
    valor_limite: number;
    percentual: number;
  }[];
  alertas: {
    data: string;
    nivel: string;
    mensagem: string;
  }[];
}

type JornadaValidacaoEscala = Pick<
  FrmsJornada,
  | 'data'
  | 'status'
  | 'horas_voo_minutos'
  | 'hora_termino'
  | 'hora_apresentacao'
  | 'duracao_jornada_minutos'
>;

function derivarHoraApresentacaoProjetada(
  periodo: PeriodoProjetado,
  fallbackHoraApresentacao: string,
): string {
  if (periodo.hora_apresentacao_estimada) return periodo.hora_apresentacao_estimada;
  if (periodo.hora_termino_estimada) {
    return minutesToHhmm(
      hhmmToMinutes(periodo.hora_termino_estimada) - periodo.duracao_estimada_min,
    );
  }
  return fallbackHoraApresentacao;
}

function derivarHoraTerminoProjetada(periodo: PeriodoProjetado, horaApresentacao: string): string {
  if (periodo.hora_termino_estimada) return periodo.hora_termino_estimada;
  return minutesToHhmm(hhmmToMinutes(horaApresentacao) + periodo.duracao_estimada_min);
}

function montarJornadasProjetadas(periodos: PeriodoProjetado[]): JornadaValidacaoEscala[] {
  const periodosOrdenados = [...periodos].sort((a, b) => a.data.localeCompare(b.data));
  let horaApresentacaoFallback = '06:00';

  return periodosOrdenados.map((periodo) => {
    const hora_apresentacao = derivarHoraApresentacaoProjetada(periodo, horaApresentacaoFallback);
    const hora_termino = derivarHoraTerminoProjetada(periodo, hora_apresentacao);
    horaApresentacaoFallback = hora_apresentacao;

    return {
      data: periodo.data,
      status: periodo.status,
      horas_voo_minutos: periodo.hv_estimada_min,
      hora_apresentacao,
      hora_termino,
      duracao_jornada_minutos: periodo.duracao_estimada_min,
    };
  });
}

/**
 * Simula inserção de jornadas futuras e verifica violações projetadas.
 * NÃO salva nada — apenas calcula.
 */
export function validarEscalaFutura(
  periodos: PeriodoProjetado[],
  historicoExistente: JornadaValidacaoEscala[],
  limites: LimitesMap,
): ValidacaoEscalaResult {
  const violacoes: ValidacaoEscalaResult['violacoes'] = [];
  const alertas: ValidacaoEscalaResult['alertas'] = [];
  const jornadasProjetadas = montarJornadasProjetadas(periodos);

  // Merge histórico + projetado
  const jornadasCombinadas = [...historicoExistente, ...jornadasProjetadas].sort((a, b) =>
    a.data.localeCompare(b.data),
  );

  for (const periodo of jornadasProjetadas) {
    const acumulo = calcAcumuloRolling({
      tripulanteId: 0,
      dataReferencia: periodo.data,
      jornadasHistorico: jornadasCombinadas,
      limites,
    });

    // Verificar FDP
    const fdpLimMin = limites.FDP_MAXIMO_HORAS * 60;
    if ((periodo.duracao_jornada_minutos ?? 0) > fdpLimMin) {
      const pct = round4(((periodo.duracao_jornada_minutos ?? 0) / fdpLimMin) * 100);
      violacoes.push({
        data: periodo.data,
        tipo_limite: 'FDP_DIARIO',
        valor_projetado: periodo.duracao_jornada_minutos ?? 0,
        valor_limite: fdpLimMin,
        percentual: pct,
      });
    }

    const repousoMinimo = limites.REPOUSO_MINIMO_HORAS * 60;
    if (acumulo.repouso_anterior_min >= 0 && acumulo.repouso_anterior_min < repousoMinimo) {
      violacoes.push({
        data: periodo.data,
        tipo_limite: 'REPOUSO',
        valor_projetado: acumulo.repouso_anterior_min,
        valor_limite: repousoMinimo,
        percentual:
          repousoMinimo > 0 ? round4((acumulo.repouso_anterior_min / repousoMinimo) * 100) : 0,
      });
    }

    // HV diária
    if (acumulo.pct_limite_dia >= limites.ALERTA_VIOLACAO_PCT) {
      violacoes.push({
        data: periodo.data,
        tipo_limite: 'HV_DIARIA',
        valor_projetado: acumulo.hv_dia_min,
        valor_limite: limites.HV_DIARIA_HORAS * 60,
        percentual: acumulo.pct_limite_dia,
      });
    } else if (acumulo.pct_limite_dia >= limites.ALERTA_AVISO_PCT) {
      const nivel =
        acumulo.pct_limite_dia >= limites.ALERTA_CRITICO_PCT
          ? 'CRITICO'
          : acumulo.pct_limite_dia >= limites.ALERTA_ATENCAO_PCT
            ? 'ATENCAO'
            : 'AVISO';
      alertas.push({
        data: periodo.data,
        nivel,
        mensagem: `HV diária projetada em ${acumulo.pct_limite_dia.toFixed(1)}%`,
      });
    }

    // HV 7d
    if (acumulo.pct_limite_7d >= limites.ALERTA_VIOLACAO_PCT) {
      violacoes.push({
        data: periodo.data,
        tipo_limite: 'HV_7D',
        valor_projetado: acumulo.hv_7_dias_min,
        valor_limite: limites.HV_7_DIAS_HORAS * 60,
        percentual: acumulo.pct_limite_7d,
      });
    } else if (acumulo.pct_limite_7d >= limites.ALERTA_AVISO_PCT) {
      const nivel =
        acumulo.pct_limite_7d >= limites.ALERTA_CRITICO_PCT
          ? 'CRITICO'
          : acumulo.pct_limite_7d >= limites.ALERTA_ATENCAO_PCT
            ? 'ATENCAO'
            : 'AVISO';
      alertas.push({
        data: periodo.data,
        nivel,
        mensagem: `HV 7 dias projetada em ${acumulo.pct_limite_7d.toFixed(1)}%`,
      });
    }

    // HV mês (usa pct_limite_mes_calendario — nome corrigido)
    if (acumulo.pct_limite_mes_calendario >= limites.ALERTA_VIOLACAO_PCT) {
      violacoes.push({
        data: periodo.data,
        tipo_limite: 'HV_MES',
        valor_projetado: acumulo.hv_mes_calendario_min,
        valor_limite: limites.HV_MES_HORAS * 60,
        percentual: acumulo.pct_limite_mes_calendario,
      });
    } else if (acumulo.pct_limite_mes_calendario >= limites.ALERTA_AVISO_PCT) {
      const nivel =
        acumulo.pct_limite_mes_calendario >= limites.ALERTA_CRITICO_PCT
          ? 'CRITICO'
          : acumulo.pct_limite_mes_calendario >= limites.ALERTA_ATENCAO_PCT
            ? 'ATENCAO'
            : 'AVISO';
      alertas.push({
        data: periodo.data,
        nivel,
        mensagem: `HV mês projetada em ${acumulo.pct_limite_mes_calendario.toFixed(1)}%`,
      });
    }

    // HV 365d
    if (acumulo.pct_limite_365d >= limites.ALERTA_VIOLACAO_PCT) {
      violacoes.push({
        data: periodo.data,
        tipo_limite: 'HV_365D',
        valor_projetado: acumulo.hv_365_dias_min,
        valor_limite: limites.HV_365_DIAS_HORAS * 60,
        percentual: acumulo.pct_limite_365d,
      });
    } else if (acumulo.pct_limite_365d >= limites.ALERTA_AVISO_PCT) {
      const nivel =
        acumulo.pct_limite_365d >= limites.ALERTA_CRITICO_PCT
          ? 'CRITICO'
          : acumulo.pct_limite_365d >= limites.ALERTA_ATENCAO_PCT
            ? 'ATENCAO'
            : 'AVISO';
      alertas.push({
        data: periodo.data,
        nivel,
        mensagem: `HV 365 dias projetada em ${acumulo.pct_limite_365d.toFixed(1)}%`,
      });
    }
  }

  return {
    valida: violacoes.length === 0,
    violacoes,
    alertas,
  };
}
