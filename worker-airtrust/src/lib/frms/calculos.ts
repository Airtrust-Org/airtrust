/**
 * FRMS — cálculos puros, determinísticos e com unidades explícitas.
 *
 * A legislação e o RBAC estabelecem limites e princípios de gerenciamento de
 * fadiga. A fórmula interna de effectiveness deste arquivo é um modelo
 * empresarial versionável e ainda depende de validação formal de especialista.
 */

import type {
  EffectivenessResult,
  FrmsFatorizacao,
  FrmsJornada,
  FrmsStatus,
  LimitesMap,
} from './types';
import { FDP_STATUS, FOLGA_STATUS } from './types';
import {
  calcularFatorRepouso,
  calcularPenalidadeWOCL,
  calcularSono,
  isWithinWOCL,
} from './fadiga-score';
import { resolverFrmsConfig } from './frms-config';
import { shouldUseForRolling } from './frms-source-policy';

export type MomentoCalculoHvDia = 'PROJECAO_ANTES_JORNADA' | 'REALIZADO_APOS_JORNADA';
export type RepousoEstado = 'SUFICIENTE' | 'INSUFICIENTE' | 'DESCONHECIDO' | 'NAO_APLICAVEL';

const MINUTOS_DIA = 1440;
const OPERATIONAL_TIMEZONE_DEFAULT = 'America/Sao_Paulo';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Escala em que os fatores configuráveis (`*_FATOR`, `*_PCT`) são interpretados.
 *
 * `LIMITES_DEFAULT` já usa fração assinada (-0,1 = −10 pontos de effectiveness),
 * portanto `FRACAO` é o padrão e preserva o comportamento de produção.
 */
export type EscalaFatores = 'FRACAO' | 'PERCENTUAL';

export function resolverEscalaFatores(limites?: Partial<LimitesMap> | null): EscalaFatores {
  const declarada = (limites as { FATORES_ESCALA?: unknown } | null | undefined)?.FATORES_ESCALA;
  return declarada === 'PERCENTUAL' ? 'PERCENTUAL' : 'FRACAO';
}

/**
 * Converte um fator **configurado** em penalidade fracionária no domínio [-1, 0].
 *
 * A escala é declarada uma única vez por configuração (`FATORES_ESCALA`) e nunca
 * inferida por valor. A inferência anterior (`|v| > 1 ? v/100 : v`) era
 * descontínua e **não monotônica** em torno de |v| = 1: 1,0 → −1,0 enquanto
 * 1,0001 → −0,010001, ou seja, aumentar a severidade configurada *reduzia* a
 * penalidade aplicada em ~99 pontos. Ver D-03 em frms-scientific-audit.md.
 *
 * Valores fora do domínio saturam em −1 (falha fechada, penalidade máxima) em vez
 * de serem reinterpretados silenciosamente em outra unidade.
 */
function toPenalty(value: number | null | undefined, escala: EscalaFatores): number {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(Number(value)) / (escala === 'PERCENTUAL' ? 100 : 1);
  return -Math.min(1, magnitude);
}

/**
 * Satura um valor que **já está** em escala fracionária. Usado em
 * `calcEffectiveness`, onde as entradas são fatores previamente normalizados —
 * aplicar `toPenalty` ali causaria dupla conversão sob `FATORES_ESCALA=PERCENTUAL`.
 */
function clampPenalty(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return -Math.min(1, Math.abs(Number(value)));
}

/** Converte HH:MM válido em minutos; retorna 0 por compatibilidade legada. */
export function hhmmToMinutes(hhmm: string | null | undefined): number {
  return parseHhmm(hhmm) ?? 0;
}

function parseHhmm(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59)
    return null;
  return h * 60 + m;
}

export function minutesToHhmm(min: number): string {
  const normalized = ((Math.round(min) % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calcDuracaoMinutos(inicio: string | null, fim: string | null): number {
  const i = parseHhmm(inicio);
  const f = parseHhmm(fim);
  if (i == null || f == null) return 0;
  return f >= i ? f - i : MINUTOS_DIA - i + f;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function getHora(hhmm: string | null | undefined): number {
  const min = parseHhmm(hhmm);
  return min == null ? -1 : Math.floor(min / 60);
}

export function isNoturno(hhmm: string | null | undefined, limites?: LimitesMap): boolean {
  const h = getHora(hhmm);
  if (h < 0) return false;
  const inicio = limites?.NOTURNO_INICIO_HORA ?? 22;
  const fim = limites?.NOTURNO_FIM_HORA ?? 5;
  return inicio > fim ? h >= inicio || h <= fim : h >= inicio && h <= fim;
}

export function validarRepousoPlataforma(
  inicio: string | null,
  fim: string | null,
  limites: LimitesMap,
): boolean {
  if (!inicio || !fim) return false;
  const duracao = calcDuracaoMinutos(inicio, fim);
  return (
    duracao >= limites.REPOUSO_PLATAFORMA_MINIMO_HORAS * 60 &&
    duracao <= limites.REPOUSO_PLATAFORMA_MAXIMO_HORAS * 60
  );
}

/**
 * Jornada é apresentação → encerramento. Pausa só é deduzida quando registrada
 * explicitamente em `intervalo_pausa_minutos`/`pausa_minutos`; não existe mais
 * dedução fixa de almoço.
 */
export function calcDuracaoJornada(jornada: FrmsJornada): number {
  if (FOLGA_STATUS.includes(jornada.status)) return 0;
  if (!jornada.hora_apresentacao || !jornada.hora_termino) return 0;
  const bruto = calcDuracaoMinutos(jornada.hora_apresentacao, jornada.hora_termino);
  const extensao = jornada as FrmsJornada & {
    intervalo_pausa_minutos?: number | null;
    pausa_minutos?: number | null;
  };
  const pausa = Math.max(0, extensao.intervalo_pausa_minutos ?? extensao.pausa_minutos ?? 0);
  return Math.max(0, bruto - pausa);
}

interface FatorizacaoInput {
  jornada: FrmsJornada;
  repousoAnteriorMin: number | null;
  limites: LimitesMap;
  diasDoMes: number;
  diaDoCiclo?: number | null;
}

export interface FatorizacaoResult {
  /** Campos `_pct` históricos; todos os fatores abaixo estão em escala fracionária 0–1. */
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
  fator_hv_basica_pct: number;
  fator_hv_quantidade_pct: number;
  fator_hv_noturno_dep_pct: number;
  fator_hv_noturno_arr_pct: number;
  total_fatorizado_hv: number;
}

export function calcFatorizacao(input: FatorizacaoInput): FatorizacaoResult {
  const { jornada, repousoAnteriorMin, limites, diaDoCiclo } = input;
  if (FOLGA_STATUS.includes(jornada.status)) return zeroFatorizacao();

  const duracaoMin = jornada.duracao_jornada_minutos ?? calcDuracaoJornada(jornada);
  const hvMin = Math.max(0, jornada.horas_voo_minutos ?? 0);
  const semHorario = !jornada.hora_apresentacao || !jornada.hora_termino;
  if (FDP_STATUS.includes(jornada.status) && semHorario && duracaoMin === 0) {
    return fatorizacaoDiaSemJornada(limites);
  }

  const escala = resolverEscalaFatores(limites);
  const fdpMaxMin = limites.FDP_MAXIMO_HORAS * 60;
  const fator_basica_pct = fdpMaxMin > 0 ? round4(duracaoMin / fdpMaxMin) : 0;
  const fator_apresentacao_pct = calcFatorApresentacao(jornada.hora_apresentacao, limites);
  const fator_duracao_pct = calcFatorDuracao(duracaoMin, limites);
  const fator_repouso_pct = calcFatorRepousoConfigurado(
    repousoAnteriorMin,
    jornada.status,
    limites,
  );
  const fator_noturno_dep_pct = isNoturno(jornada.hora_primeira_decolagem, limites)
    ? toPenalty(limites.NOTURNO_FATOR, escala)
    : 0;
  const fator_noturno_arr_pct = isNoturno(jornada.hora_ultimo_pouso, limites)
    ? toPenalty(limites.NOTURNO_FATOR, escala)
    : 0;
  const fator_ciclo_embarcado_pct = calcFatorCicloEmbarcado(diaDoCiclo ?? null, limites);
  const fator_base_away_pct =
    jornada.tipo_base === 'AWAY' ? toPenalty(limites.FATOR_BASE_AWAY_PCT, escala) : 0;
  const fator_aclimatacao_pct =
    jornada.aclimatado === 0 ? toPenalty(limites.FATOR_ACLIMATADO_NAO_PCT, escala) : 0;

  // A básica é apenas razão diagnóstica de utilização do limite; não é somada como risco.
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

  const hvDiaLimiteMin = limites.HV_DIARIA_HORAS * 60;
  const fator_hv_basica_pct = hvDiaLimiteMin > 0 ? round4(hvMin / hvDiaLimiteMin) : 0;
  const fator_hv_quantidade_pct = calcFatorHvQuantidade(hvMin, limites);
  const fator_hv_noturno_dep_pct = fator_noturno_dep_pct;
  const fator_hv_noturno_arr_pct = fator_noturno_arr_pct;
  // Também exclui a razão básica diagnóstica, evitando mistura 0–1 com 0–100.
  const total_fatorizado_hv = round4(
    fator_hv_quantidade_pct + fator_hv_noturno_dep_pct + fator_hv_noturno_arr_pct,
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

function calcFatorApresentacao(hora: string | null, limites: LimitesMap): number {
  const escala = resolverEscalaFatores(limites);
  const h = getHora(hora);
  if (h < 0) return toPenalty(limites.APRESENTACAO_NOITE_FATOR, escala);
  if (h >= limites.APRESENTACAO_AMANHECER_H_MIN && h <= limites.APRESENTACAO_AMANHECER_H_MAX)
    return toPenalty(limites.APRESENTACAO_AMANHECER_FATOR, escala);
  if (h >= limites.APRESENTACAO_DIURNO_H_MIN && h <= limites.APRESENTACAO_DIURNO_H_MAX)
    return toPenalty(limites.APRESENTACAO_DIURNO_FATOR, escala);
  if (h >= limites.APRESENTACAO_TARDE_H_MIN && h <= limites.APRESENTACAO_TARDE_H_MAX)
    return toPenalty(limites.APRESENTACAO_TARDE_FATOR, escala);
  if (h >= limites.APRESENTACAO_MADRUGADA_H_MIN && h <= limites.APRESENTACAO_MADRUGADA_H_MAX)
    return toPenalty(limites.APRESENTACAO_MADRUGADA_FATOR, escala);
  return toPenalty(limites.APRESENTACAO_NOITE_FATOR, escala);
}

/**
 * Duração não recebe bônus; jornadas longas recebem a penalidade configurada.
 *
 * `DURACAO_CURTA_MINUTOS`/`DURACAO_CURTA_FATOR` permanecem em `LimitesMap` por
 * compatibilidade de schema mas **não são lidos** — jornada curta não atenua
 * fadiga. Ver D-05 em frms-scientific-audit.md.
 */
function calcFatorDuracao(duracaoMin: number, limites: LimitesMap): number {
  const escala = resolverEscalaFatores(limites);
  if (duracaoMin > limites.DURACAO_LONGA_MINUTOS)
    return toPenalty(limites.DURACAO_LONGA_FATOR, escala);
  return toPenalty(limites.DURACAO_NORMAL_FATOR, escala);
}

function calcFatorRepousoConfigurado(
  repousoMin: number | null,
  status: string,
  limites: LimitesMap,
): number {
  const escala = resolverEscalaFatores(limites);
  if (FOLGA_STATUS.includes(status as FrmsStatus)) return 0;
  if (repousoMin == null || repousoMin < 0) return toPenalty(limites.REPOUSO_CRITICO_FATOR, escala);
  if (repousoMin >= limites.REPOUSO_ADEQUADO_MINUTOS)
    return toPenalty(limites.REPOUSO_ADEQUADO_FATOR, escala);
  if (repousoMin >= limites.REPOUSO_RUIM_MINUTOS)
    return toPenalty(limites.REPOUSO_RUIM_FATOR, escala);
  return toPenalty(limites.REPOUSO_CRITICO_FATOR, escala);
}

function calcFatorHvQuantidade(hvMin: number, limites: LimitesMap): number {
  const escala = resolverEscalaFatores(limites);
  const fatoresOrdenados = [
    toPenalty(limites.HV_POUCAS_FATOR, escala),
    toPenalty(limites.HV_NORMAL_FATOR, escala),
    toPenalty(limites.HV_MUITAS_FATOR, escala),
  ].sort((a, b) => b - a);
  if (hvMin >= limites.HV_MUITAS_MINUTOS) return fatoresOrdenados[2];
  if (hvMin < limites.HV_POUCAS_MINUTOS) return fatoresOrdenados[0];
  return fatoresOrdenados[1];
}

export function calcFatorCicloEmbarcado(
  diaDoCiclo: number | null | undefined,
  limites: LimitesMap,
): number {
  if (!limites.CICLO_EMBARCADO_ATIVO) return 0;
  if (diaDoCiclo == null || diaDoCiclo < limites.CICLO_EMBARCADO_DIA_INICIO) return 0;
  const escala = resolverEscalaFatores(limites);
  const inicio = limites.CICLO_EMBARCADO_DIA_INICIO;
  const max = limites.CICLO_EMBARCADO_DIA_MAX;
  const fatorInicial = toPenalty(limites.CICLO_EMBARCADO_PCT_MIN, escala);
  const fatorMaximo = toPenalty(limites.CICLO_EMBARCADO_PCT_MAX, escala);
  if (diaDoCiclo >= max || max <= inicio) return fatorMaximo;
  const progresso = (diaDoCiclo - inicio) / (max - inicio);
  return round4(fatorInicial + progresso * (fatorMaximo - fatorInicial));
}

function fatorizacaoDiaSemJornada(limites: LimitesMap): FatorizacaoResult {
  const escala = resolverEscalaFatores(limites);
  const fator_apresentacao_pct = toPenalty(limites.APRESENTACAO_NOITE_FATOR, escala);
  const fator_repouso_pct = toPenalty(limites.REPOUSO_CRITICO_FATOR, escala);
  return {
    ...zeroFatorizacao(),
    fator_apresentacao_pct,
    fator_repouso_pct,
    total_fatorizado_jornada: round4(fator_apresentacao_pct + fator_repouso_pct),
  };
}

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
    hora_acordou?: string | null;
    dia_periodo_embarcado?: number | null;
    total_dias_periodo?: number | null;
  },
): EffectivenessResult {
  // Mantém o contrato histórico para consumidores que fornecem apenas a fatorização.
  if (!jornada) return calcEffectivenessLegado(fatorizacao, limites);

  const cfgSono = resolverFrmsConfig(limites);
  const apresentacaoMin = parseHhmm(jornada.hora_apresentacao);
  const acordouMin = parseHhmm(jornada.hora_acordou);
  const dormiuMin = parseHhmm(jornada.hora_dormiu);

  let duracaoSono: number | null = null;
  let horaDespertar: string | null = null;
  let horaInicioSono: string | null = null;
  let fonteSono: 'PADRAO' | 'INFORMADO' = 'PADRAO';
  let despertarEstimado = true;
  let acordouNaWocl = false;
  let fatorCircadiano = fatorizacao.fator_apresentacao_pct;

  if (apresentacaoMin != null || acordouMin != null) {
    const sono = calcularSono({
      horaApresentacaoMin: apresentacaoMin ?? acordouMin ?? 0,
      minutosAntesApresentacao: cfgSono.minutosAntesApresentacao,
      horasSonoPadrao: cfgSono.horasSonoPadrao,
      horaDormiu: dormiuMin,
      horaAcordou: acordouMin,
    });
    duracaoSono = sono.sonoEfetivoMin;
    horaDespertar = minutesToHhmm(sono.tAcordouMin);
    horaInicioSono = minutesToHhmm(sono.tDormiuMin);
    fonteSono = sono.fonteSono;
    despertarEstimado = sono.despertarEstimado;
    acordouNaWocl = isWithinWOCL(sono.tAcordouMin);
    fatorCircadiano = acordouNaWocl ? calcularPenalidadeWOCL(sono.tAcordouMin) : 0;
  }

  const fatorRepouso =
    duracaoSono == null
      ? clampPenalty(fatorizacao.fator_repouso_pct)
      : calcularFatorRepouso(duracaoSono);

  const diaPeriodo = jornada.dia_periodo_embarcado ?? null;
  const totalPeriodo = jornada.total_dias_periodo ?? null;
  let fatorProgressivo = 0;
  if (
    totalPeriodo != null &&
    totalPeriodo >= 2 &&
    diaPeriodo != null &&
    diaPeriodo >= 1 &&
    diaPeriodo <= totalPeriodo
  ) {
    const max = -Math.abs(limites.FRMS_EMBARQUE_PROGRESSO_MAX ?? 8) / 100;
    fatorProgressivo = max * ((diaPeriodo - 1) / (totalPeriodo - 1));
  }

  // Fórmula empresarial v2: soma somente grandezas adimensionais fracionárias
  // com sinal de penalidade. Razões diagnósticas e percentuais 0–100 ficam fora.
  const totalCalibrado = round4(
    clampPenalty(fatorCircadiano) +
      clampPenalty(fatorizacao.fator_duracao_pct) +
      clampPenalty(fatorRepouso) +
      clampPenalty(fatorizacao.fator_noturno_dep_pct) +
      clampPenalty(fatorizacao.fator_noturno_arr_pct) +
      clampPenalty(fatorizacao.fator_ciclo_embarcado_pct) +
      clampPenalty(fatorizacao.fator_base_away_pct) +
      clampPenalty(fatorizacao.fator_aclimatacao_pct) +
      clampPenalty(fatorizacao.fator_hv_quantidade_pct) +
      fatorProgressivo,
  );
  const rawEffectiveness = 100 + totalCalibrado * 100;
  const effectiveness = Math.max(0, Math.min(100, rawEffectiveness));
  const nivel = classificarEffectiveness(effectiveness, limites);
  const tempoAbaixoLimiarMin =
    (fatorizacao.fator_noturno_dep_pct < 0 ? 45 : 0) +
    (fatorizacao.fator_noturno_arr_pct < 0 ? 30 : 0) +
    (fatorRepouso < -0.05 ? 30 : 0);

  return {
    effectiveness_pct: Math.round(effectiveness * 10) / 10,
    nivel,
    tempo_abaixo_limiar_pct: tempoAbaixoLimiarMin,
    fatorizacao_delta: fatorizacao.total_fatorizado_jornada,
    fator_basica_calibrado_pct: 0,
    fator_apresentacao_calibrado_pct: round4(fatorCircadiano),
    fator_repouso_calibrado_pct: round4(fatorRepouso),
    total_fatorizado_calibrado_jornada: totalCalibrado,
    duracao_sono_efetiva_min: duracaoSono,
    hora_despertar: horaDespertar,
    hora_inicio_sono: horaInicioSono,
    fonte_sono: fonteSono,
    despertar_estimado: despertarEstimado,
    acordou_na_wocl: acordouNaWocl,
    dia_periodo_embarcado: diaPeriodo,
    total_dias_periodo: totalPeriodo,
    componentes: {
      processo_s: round4(fatorizacao.fator_ciclo_embarcado_pct + fatorProgressivo),
      processo_c: round4(
        fatorCircadiano + fatorizacao.fator_noturno_dep_pct + fatorizacao.fator_noturno_arr_pct,
      ),
      repouso: round4(fatorRepouso),
      hv: round4(fatorizacao.fator_hv_quantidade_pct),
      duracao: round4(fatorizacao.fator_duracao_pct),
    },
  };
}

function calcEffectivenessLegado(
  fatorizacao: FatorizacaoResult,
  limites: LimitesMap,
): EffectivenessResult {
  const effectiveness = Math.max(
    0,
    Math.min(100, 100 + fatorizacao.total_fatorizado_jornada * 100),
  );
  return {
    effectiveness_pct: Math.round(effectiveness * 10) / 10,
    nivel: classificarEffectiveness(effectiveness, limites),
    tempo_abaixo_limiar_pct:
      (fatorizacao.fator_noturno_dep_pct !== 0 ? 45 : 0) +
      (fatorizacao.fator_noturno_arr_pct !== 0 ? 30 : 0) +
      (fatorizacao.fator_repouso_pct < -0.05 ? 30 : 0),
    fatorizacao_delta: fatorizacao.total_fatorizado_jornada,
    fator_basica_calibrado_pct: fatorizacao.fator_basica_pct,
    fator_apresentacao_calibrado_pct: fatorizacao.fator_apresentacao_pct,
    fator_repouso_calibrado_pct: fatorizacao.fator_repouso_pct,
    total_fatorizado_calibrado_jornada: fatorizacao.total_fatorizado_jornada,
    duracao_sono_efetiva_min: null,
    hora_despertar: null,
    hora_inicio_sono: null,
    fonte_sono: 'PADRAO',
    despertar_estimado: true,
    acordou_na_wocl: false,
    dia_periodo_embarcado: null,
    total_dias_periodo: null,
    componentes: {
      processo_s: fatorizacao.fator_ciclo_embarcado_pct,
      processo_c:
        fatorizacao.fator_apresentacao_pct +
        fatorizacao.fator_noturno_dep_pct +
        fatorizacao.fator_noturno_arr_pct,
      repouso: fatorizacao.fator_repouso_pct,
      hv: fatorizacao.fator_hv_quantidade_pct,
      duracao: fatorizacao.fator_duracao_pct,
    },
  };
}

function classificarEffectiveness(
  effectiveness: number,
  limites: LimitesMap,
): EffectivenessResult['nivel'] {
  const verde = limites.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = limites.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = limites.EFFECTIV_VERMELHO_MAX ?? 65;
  if (effectiveness >= verde) return 'verde';
  if (effectiveness <= vermelho) return 'vermelho';
  if (effectiveness <= amarelo) return 'amarelo';
  return 'atencao';
}

type JornadaRolling = Pick<
  FrmsJornada,
  | 'data'
  | 'status'
  | 'horas_voo_minutos'
  | 'hora_termino'
  | 'hora_apresentacao'
  | 'duracao_jornada_minutos'
> & { origem?: string | null };

export interface AcumuloRollingInput {
  tripulanteId: number;
  dataReferencia: string;
  jornadasHistorico: JornadaRolling[];
  limites: LimitesMap;
  momentoCalculoHvDia?: MomentoCalculoHvDia;
  timeZone?: string;
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
  repouso_estado?: RepousoEstado;
  /** Mínimo exigido para esta jornada (RBAC 117 A117.23(b)), em minutos. */
  repouso_minimo_requerido_min?: number;
  /** Duração da jornada anterior usada para escolher o patamar de repouso. */
  duracao_jornada_anterior_min?: number | null;
  momento_calculo_hv_dia?: MomentoCalculoHvDia;
  timezone_operacional?: string;
}

function parseIsoDay(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return null;
  return Math.floor(ms / 86400000);
}

function civilMinute(date: string, hhmm: string | null): number | null {
  const day = parseIsoDay(date);
  const minute = parseHhmm(hhmm);
  return day == null || minute == null ? null : day * MINUTOS_DIA + minute;
}

function resolveJornadaInterval(jornada: JornadaRolling): { start: number; end: number } | null {
  const start = civilMinute(jornada.data, jornada.hora_apresentacao);
  if (start == null) return null;
  const fimMin = parseHhmm(jornada.hora_termino);
  if (fimMin != null) {
    const dia = parseIsoDay(jornada.data);
    if (dia == null) return null;
    let end = dia * MINUTOS_DIA + fimMin;
    if (end <= start) end += MINUTOS_DIA;
    return { start, end };
  }
  const duracao = jornada.duracao_jornada_minutos ?? 0;
  return duracao > 0 ? { start, end: start + duracao } : null;
}

function findReferenceJornada(data: string, jornadas: JornadaRolling[]): JornadaRolling | null {
  return (
    jornadas.find((j) => j.data === data && FDP_STATUS.includes(j.status as FrmsStatus)) ?? null
  );
}

function calcHvRolling24h(
  dataReferencia: string,
  jornadas: JornadaRolling[],
  momento: MomentoCalculoHvDia,
): number {
  const referencia = findReferenceJornada(dataReferencia, jornadas);
  if (!referencia) return 0;
  const intervaloRef = resolveJornadaInterval(referencia);
  if (!intervaloRef) return 0;
  const windowEnd = momento === 'PROJECAO_ANTES_JORNADA' ? intervaloRef.start : intervaloRef.end;
  const windowStart = windowEnd - MINUTOS_DIA;
  let hv = 0;

  for (const jornada of jornadas) {
    const minutosVoo = Math.max(0, jornada.horas_voo_minutos ?? 0);
    if (minutosVoo === 0) continue;
    const intervalo = resolveJornadaInterval(jornada);
    if (!intervalo || intervalo.end <= intervalo.start) continue;
    const inicioSobreposicao = Math.max(intervalo.start, windowStart);
    const fimSobreposicao = Math.min(intervalo.end, windowEnd);
    if (fimSobreposicao <= inicioSobreposicao) continue;
    hv += minutosVoo * ((fimSobreposicao - inicioSobreposicao) / (intervalo.end - intervalo.start));
  }
  return Math.round(hv);
}

/**
 * Repouso mínimo regulamentar exigido, em minutos.
 *
 * Fonte: RBAC nº 117 EMD 01, Apêndice A, seção **A117.23(b)** — "O tempo mínimo
 * de repouso tem duração relacionada ao tempo da jornada anterior":
 *
 * | Jornada anterior      | Repouso mínimo |
 * | --------------------- | -------------- |
 * | até 12 h              | 12 h           |
 * | > 12 h e até 15 h     | 16 h           |
 * | > 15 h                | 24 h           |
 *
 * A117.23(c) permite limites diferentes aprovados pela ANAC e constantes do
 * manual do operador; por isso os patamares são configuráveis. `Math.max` com
 * `REPOUSO_MINIMO_HORAS` garante que a configuração do operador só possa ser
 * **mais** restritiva que o piso declarado, nunca menos.
 *
 * Não modelado aqui: A117.23(d) (+2 h por fuso quando cruzados 3 ou mais) —
 * o schema não registra fusos cruzados. Ver D-09 em frms-scientific-audit.md.
 */
export function repousoMinimoRequeridoMin(
  duracaoJornadaAnteriorMin: number | null,
  limites: LimitesMap,
): number {
  const base = Math.max(0, limites.REPOUSO_MINIMO_HORAS * 60);
  if (duracaoJornadaAnteriorMin == null || !Number.isFinite(duracaoJornadaAnteriorMin)) {
    return base;
  }
  const cfg = limites as LimitesMap & {
    REPOUSO_MINIMO_APOS_JORNADA_12_15_HORAS?: number;
    REPOUSO_MINIMO_APOS_JORNADA_MAIOR_15_HORAS?: number;
  };
  if (duracaoJornadaAnteriorMin > 15 * 60) {
    return Math.max(base, (cfg.REPOUSO_MINIMO_APOS_JORNADA_MAIOR_15_HORAS ?? 24) * 60);
  }
  if (duracaoJornadaAnteriorMin > 12 * 60) {
    return Math.max(base, (cfg.REPOUSO_MINIMO_APOS_JORNADA_12_15_HORAS ?? 16) * 60);
  }
  return base;
}

function calcRepousoAnterior(
  dataReferencia: string,
  jornadas: JornadaRolling[],
): {
  minutos: number;
  duracaoAnteriorMin: number | null;
  estadoBase: 'CALCULADO' | 'DESCONHECIDO' | 'NAO_APLICAVEL';
} {
  const atual = findReferenceJornada(dataReferencia, jornadas);
  if (!atual) return { minutos: -1, duracaoAnteriorMin: null, estadoBase: 'NAO_APLICAVEL' };
  const intervaloAtual = resolveJornadaInterval(atual);
  if (!intervaloAtual) {
    return { minutos: -1, duracaoAnteriorMin: null, estadoBase: 'DESCONHECIDO' };
  }

  let ultimoFim: number | null = null;
  let duracaoAnteriorMin: number | null = null;
  let integridadeComprometida = false;
  for (const jornada of jornadas) {
    if (!FDP_STATUS.includes(jornada.status as FrmsStatus) || jornada === atual) continue;
    const dia = parseIsoDay(jornada.data);
    const diaAtual = parseIsoDay(dataReferencia);
    if (dia == null || diaAtual == null || dia > diaAtual) continue;
    const intervalo = resolveJornadaInterval(jornada);
    if (!intervalo) {
      // Jornada anterior sem horários utilizáveis: o repouso não é observável.
      if (dia < diaAtual) integridadeComprometida = true;
      continue;
    }
    // D-07: jornada anterior que invade a apresentação atual. Ignorá-la e usar
    // uma jornada mais antiga produziria um repouso MAIOR que o real (falha
    // aberta). Sobreposição é defeito de dado, não folga.
    if (intervalo.end > intervaloAtual.start && intervalo.start < intervaloAtual.start) {
      integridadeComprometida = true;
      continue;
    }
    if (intervalo.end <= intervaloAtual.start && (ultimoFim == null || intervalo.end > ultimoFim)) {
      ultimoFim = intervalo.end;
      duracaoAnteriorMin = intervalo.end - intervalo.start;
    }
  }

  if (ultimoFim == null || integridadeComprometida) {
    return { minutos: -1, duracaoAnteriorMin: null, estadoBase: 'DESCONHECIDO' };
  }
  return {
    minutos: Math.max(0, intervaloAtual.start - ultimoFim),
    duracaoAnteriorMin,
    estadoBase: 'CALCULADO',
  };
}

export function calcAcumuloRolling(input: AcumuloRollingInput): AcumuloRollingResult {
  const {
    dataReferencia,
    limites,
    momentoCalculoHvDia = 'PROJECAO_ANTES_JORNADA',
    timeZone = OPERATIONAL_TIMEZONE_DEFAULT,
  } = input;
  const jornadas = input.jornadasHistorico.filter((j) =>
    'origem' in j ? shouldUseForRolling(j) : true,
  );
  const d7 = dateOffset(dataReferencia, -6);
  const d28 = dateOffset(dataReferencia, -27);
  const d365 = dateOffset(dataReferencia, -364);
  const mes = dataReferencia.slice(0, 7);

  let hv7 = 0;
  let hv28 = 0;
  let hv365 = 0;
  let hvMes = 0;
  for (const jornada of jornadas) {
    if (!FDP_STATUS.includes(jornada.status as FrmsStatus)) continue;
    const hv = Math.max(0, jornada.horas_voo_minutos ?? 0);
    if (jornada.data >= d7 && jornada.data <= dataReferencia) hv7 += hv;
    if (jornada.data >= d28 && jornada.data <= dataReferencia) hv28 += hv;
    if (jornada.data >= d365 && jornada.data <= dataReferencia) hv365 += hv;
    if (jornada.data.startsWith(mes) && jornada.data <= dataReferencia) hvMes += hv;
  }

  const hvDia = calcHvRolling24h(dataReferencia, jornadas, momentoCalculoHvDia);
  const repouso = calcRepousoAnterior(dataReferencia, jornadas);
  // RBAC 117 A117.23(b): o mínimo depende da duração da jornada anterior.
  const minimoRepouso = repousoMinimoRequeridoMin(repouso.duracaoAnteriorMin, limites);
  const repousoEstado: RepousoEstado =
    repouso.estadoBase === 'NAO_APLICAVEL'
      ? 'NAO_APLICAVEL'
      : repouso.estadoBase === 'DESCONHECIDO'
        ? 'DESCONHECIDO'
        : repouso.minutos >= minimoRepouso
          ? 'SUFICIENTE'
          : 'INSUFICIENTE';

  const pct = (valor: number, limiteHoras: number) =>
    limiteHoras > 0 ? round4((valor / (limiteHoras * 60)) * 100) : 0;
  return {
    hv_7_dias_min: hv7,
    hv_28_dias_min: hv28,
    hv_365_dias_min: hv365,
    hv_mes_calendario_min: hvMes,
    hv_dia_min: hvDia,
    pct_limite_7d: pct(hv7, limites.HV_7_DIAS_HORAS),
    pct_limite_28d: pct(hv28, limites.HV_28_DIAS_HORAS),
    pct_limite_mes_calendario: pct(hvMes, limites.HV_MES_HORAS),
    pct_limite_365d: pct(hv365, limites.HV_365_DIAS_HORAS),
    pct_limite_dia: pct(hvDia, limites.HV_DIARIA_HORAS),
    repouso_anterior_min: repouso.minutos,
    // Compatibilidade com persistência 0/1: desconhecido falha fechado como 0.
    repouso_suficiente: repousoEstado === 'SUFICIENTE' ? 1 : 0,
    repouso_estado: repousoEstado,
    repouso_minimo_requerido_min: minimoRepouso,
    duracao_jornada_anterior_min: repouso.duracaoAnteriorMin,
    momento_calculo_hv_dia: momentoCalculoHvDia,
    timezone_operacional: timeZone,
  };
}

function dateOffset(dateStr: string, days: number): string {
  const day = parseIsoDay(dateStr);
  if (day == null) return dateStr;
  return new Date((day + days) * 86400000).toISOString().slice(0, 10);
}

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

export function calcAcumuloMensal(input: AcumuloMensalInput): AcumuloMensalResult {
  let jornadaMin = 0;
  let hvMin = 0;
  let diasEmbarcado = 0;
  let diasFolga = 0;
  let diasFerias = 0;
  for (const jornada of input.jornadas) {
    jornadaMin += jornada.duracao_jornada_minutos ?? 0;
    hvMin += jornada.horas_voo_minutos ?? 0;
    if (FDP_STATUS.includes(jornada.status)) diasEmbarcado++;
    else if (jornada.status === 'FR' || jornada.status === 'FS') diasFolga++;
    else if (jornada.status === 'FE') diasFerias++;
  }
  return {
    jornada_realizada_min: jornadaMin,
    hv_realizada_min: hvMin,
    jornada_fatorizada_pct: round4(
      input.fatorizacoes.reduce((sum, f) => sum + f.total_fatorizado_jornada, 0),
    ),
    hv_fatorizada_pct: round4(
      input.fatorizacoes.reduce((sum, f) => sum + f.total_fatorizado_hv, 0),
    ),
    dias_embarcado: diasEmbarcado,
    dias_folga: diasFolga,
    dias_ferias: diasFerias,
  };
}

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
  alertas: { data: string; nivel: string; mensagem: string }[];
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

function montarJornadasProjetadas(periodos: PeriodoProjetado[]): JornadaValidacaoEscala[] {
  return [...periodos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((periodo) => {
      const apresentacao = periodo.hora_apresentacao_estimada ?? '06:00';
      // D-06: HH:MM não representa duração >= 24 h. Sintetizar o término faria
      // `minutesToHhmm` dar a volta no relógio e encurtar a jornada (ex.: 1500
      // min viraria 60 min). Sem término, `resolveJornadaInterval` usa a duração.
      const termino =
        periodo.hora_termino_estimada ??
        (periodo.duracao_estimada_min < MINUTOS_DIA
          ? minutesToHhmm(hhmmToMinutes(apresentacao) + periodo.duracao_estimada_min)
          : null);
      return {
        data: periodo.data,
        status: periodo.status,
        horas_voo_minutos: periodo.hv_estimada_min,
        hora_apresentacao: apresentacao,
        hora_termino: termino,
        duracao_jornada_minutos: periodo.duracao_estimada_min,
      };
    });
}

export function validarEscalaFutura(
  periodos: PeriodoProjetado[],
  historicoExistente: JornadaValidacaoEscala[],
  limites: LimitesMap,
): ValidacaoEscalaResult {
  const violacoes: ValidacaoEscalaResult['violacoes'] = [];
  const alertas: ValidacaoEscalaResult['alertas'] = [];
  const projetadas = montarJornadasProjetadas(periodos);
  const combinadas = [...historicoExistente, ...projetadas].sort((a, b) =>
    a.data.localeCompare(b.data),
  );

  for (const jornada of projetadas) {
    const acumulo = calcAcumuloRolling({
      tripulanteId: 0,
      dataReferencia: jornada.data,
      jornadasHistorico: combinadas,
      limites,
      momentoCalculoHvDia: 'REALIZADO_APOS_JORNADA',
    });
    const fdpLimite = limites.FDP_MAXIMO_HORAS * 60;
    if ((jornada.duracao_jornada_minutos ?? 0) > fdpLimite) {
      violacoes.push({
        data: jornada.data,
        tipo_limite: 'FDP_DIARIO',
        valor_projetado: jornada.duracao_jornada_minutos ?? 0,
        valor_limite: fdpLimite,
        percentual:
          fdpLimite > 0 ? round4(((jornada.duracao_jornada_minutos ?? 0) / fdpLimite) * 100) : 0,
      });
    }
    // Mínimo efetivamente exigido para esta jornada (A117.23(b)), não a constante.
    const repousoLimite = acumulo.repouso_minimo_requerido_min ?? limites.REPOUSO_MINIMO_HORAS * 60;
    if (acumulo.repouso_estado === 'DESCONHECIDO') {
      violacoes.push({
        data: jornada.data,
        tipo_limite: 'REPOUSO_DESCONHECIDO',
        valor_projetado: -1,
        valor_limite: repousoLimite,
        percentual: 0,
      });
    } else if (acumulo.repouso_estado === 'INSUFICIENTE') {
      violacoes.push({
        data: jornada.data,
        tipo_limite: 'REPOUSO',
        valor_projetado: acumulo.repouso_anterior_min,
        valor_limite: repousoLimite,
        percentual:
          repousoLimite > 0 ? round4((acumulo.repouso_anterior_min / repousoLimite) * 100) : 0,
      });
    }

    const verificar = (tipo: string, valor: number, limiteHoras: number, percentual: number) => {
      if (percentual >= limites.ALERTA_VIOLACAO_PCT) {
        violacoes.push({
          data: jornada.data,
          tipo_limite: tipo,
          valor_projetado: valor,
          valor_limite: limiteHoras * 60,
          percentual,
        });
      } else if (percentual >= limites.ALERTA_AVISO_PCT) {
        const nivel =
          percentual >= limites.ALERTA_CRITICO_PCT
            ? 'CRITICO'
            : percentual >= limites.ALERTA_ATENCAO_PCT
              ? 'ATENCAO'
              : 'AVISO';
        alertas.push({
          data: jornada.data,
          nivel,
          mensagem: `${tipo} projetada em ${percentual.toFixed(1)}%`,
        });
      }
    };
    verificar('HV_DIARIA', acumulo.hv_dia_min, limites.HV_DIARIA_HORAS, acumulo.pct_limite_dia);
    verificar('HV_7D', acumulo.hv_7_dias_min, limites.HV_7_DIAS_HORAS, acumulo.pct_limite_7d);
    verificar(
      'HV_MES',
      acumulo.hv_mes_calendario_min,
      limites.HV_MES_HORAS,
      acumulo.pct_limite_mes_calendario,
    );
    verificar(
      'HV_365D',
      acumulo.hv_365_dias_min,
      limites.HV_365_DIAS_HORAS,
      acumulo.pct_limite_365d,
    );
  }
  return { valida: violacoes.length === 0, violacoes, alertas };
}
