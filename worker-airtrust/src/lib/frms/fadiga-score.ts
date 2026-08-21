export interface FadigaScoreInput {
  kss_score: number;
  horas_sono: number | null;
  qualidade_sono: number | null;
  sintomas_json: Record<string, number> | null;
  apto: number;
  meds_ult_12h: number | boolean | null;
  alcool_ult_12h: number | boolean | null;
}

export interface FadigaScoreConfig {
  threshold_amarelo: number;
  threshold_vermelho: number;
  peso_kss: number;
  peso_sono_duracao: number;
  peso_sono_qualidade: number;
  peso_sintomas: number;
}

/** Values are bootstrap compatibility only; governed callers must supply a revision-backed policy. */
export interface FadigaBusinessPolicy {
  medicationBonus: number;
  alcoholBonus: number;
  woclStartMinute: number;
  woclEndMinute: number;
  woclCenterPenalty: number;
  woclEdgePenalty: number;
  kssNormLe2: number;
  kssNormLe4: number;
  kssNormLe6: number;
  kssNormEq7: number;
  kssNormEq8: number;
  kssNormGe9: number;
  sleepDurationMissingNorm: number;
  sleepDurationGe8Norm: number;
  sleepDurationGe7Norm: number;
  sleepDurationGe6Norm: number;
  sleepDurationGe5Norm: number;
  sleepDurationGe4Norm: number;
  sleepDurationLt4Norm: number;
  sleepQualityMissingNorm: number;
  sleepQualityGe5Norm: number;
  sleepQualityEq4Norm: number;
  sleepQualityEq3Norm: number;
  sleepQualityEq2Norm: number;
  sleepQualityLt2Norm: number;
}

export const LEGACY_FADIGA_BUSINESS_POLICY: Readonly<FadigaBusinessPolicy> = Object.freeze({
  medicationBonus: 8,
  alcoholBonus: 15,
  woclStartMinute: 120,
  woclEndMinute: 360,
  woclCenterPenalty: 0.3,
  woclEdgePenalty: 0.15,
  kssNormLe2: 0, kssNormLe4: 0.15, kssNormLe6: 0.4, kssNormEq7: 0.7, kssNormEq8: 0.85, kssNormGe9: 1,
  sleepDurationMissingNorm: 0.6, sleepDurationGe8Norm: 0, sleepDurationGe7Norm: 0.15,
  sleepDurationGe6Norm: 0.35, sleepDurationGe5Norm: 0.6, sleepDurationGe4Norm: 0.8, sleepDurationLt4Norm: 1,
  sleepQualityMissingNorm: 0.4, sleepQualityGe5Norm: 0, sleepQualityEq4Norm: 0.2,
  sleepQualityEq3Norm: 0.45, sleepQualityEq2Norm: 0.7, sleepQualityLt2Norm: 1,
});

export function resolveFadigaBusinessPolicy(values: Readonly<Record<string, number>>): FadigaBusinessPolicy {
  const required = [
    'FATIGUE_MEDICATION_BONUS', 'FATIGUE_ALCOHOL_BONUS', 'WOCL_START_MINUTE',
    'WOCL_END_MINUTE', 'WOCL_CENTER_PENALTY', 'WOCL_EDGE_PENALTY',
    'KSS_NORM_LE_2', 'KSS_NORM_LE_4', 'KSS_NORM_LE_6', 'KSS_NORM_EQ_7', 'KSS_NORM_EQ_8', 'KSS_NORM_GE_9',
    'SLEEP_DURATION_MISSING_NORM', 'SLEEP_DURATION_GE_8_NORM', 'SLEEP_DURATION_GE_7_NORM',
    'SLEEP_DURATION_GE_6_NORM', 'SLEEP_DURATION_GE_5_NORM', 'SLEEP_DURATION_GE_4_NORM', 'SLEEP_DURATION_LT_4_NORM',
    'SLEEP_QUALITY_MISSING_NORM', 'SLEEP_QUALITY_GE_5_NORM', 'SLEEP_QUALITY_EQ_4_NORM',
    'SLEEP_QUALITY_EQ_3_NORM', 'SLEEP_QUALITY_EQ_2_NORM', 'SLEEP_QUALITY_LT_2_NORM',
  ];
  for (const key of required) {
    if (!Number.isFinite(values[key])) throw new Error(`FRMS_PARAMETER_REQUIRED_MISSING:${key}`);
  }
  if (values.WOCL_END_MINUTE <= values.WOCL_START_MINUTE) {
    throw new Error('FRMS_PARAMETER_INVALID_VALUE:WOCL window');
  }
  return {
    medicationBonus: values.FATIGUE_MEDICATION_BONUS,
    alcoholBonus: values.FATIGUE_ALCOHOL_BONUS,
    woclStartMinute: values.WOCL_START_MINUTE,
    woclEndMinute: values.WOCL_END_MINUTE,
    woclCenterPenalty: values.WOCL_CENTER_PENALTY,
    woclEdgePenalty: values.WOCL_EDGE_PENALTY,
    kssNormLe2: values.KSS_NORM_LE_2, kssNormLe4: values.KSS_NORM_LE_4, kssNormLe6: values.KSS_NORM_LE_6,
    kssNormEq7: values.KSS_NORM_EQ_7, kssNormEq8: values.KSS_NORM_EQ_8, kssNormGe9: values.KSS_NORM_GE_9,
    sleepDurationMissingNorm: values.SLEEP_DURATION_MISSING_NORM, sleepDurationGe8Norm: values.SLEEP_DURATION_GE_8_NORM,
    sleepDurationGe7Norm: values.SLEEP_DURATION_GE_7_NORM, sleepDurationGe6Norm: values.SLEEP_DURATION_GE_6_NORM,
    sleepDurationGe5Norm: values.SLEEP_DURATION_GE_5_NORM, sleepDurationGe4Norm: values.SLEEP_DURATION_GE_4_NORM,
    sleepDurationLt4Norm: values.SLEEP_DURATION_LT_4_NORM,
    sleepQualityMissingNorm: values.SLEEP_QUALITY_MISSING_NORM, sleepQualityGe5Norm: values.SLEEP_QUALITY_GE_5_NORM,
    sleepQualityEq4Norm: values.SLEEP_QUALITY_EQ_4_NORM, sleepQualityEq3Norm: values.SLEEP_QUALITY_EQ_3_NORM,
    sleepQualityEq2Norm: values.SLEEP_QUALITY_EQ_2_NORM, sleepQualityLt2Norm: values.SLEEP_QUALITY_LT_2_NORM,
  };
}

export interface FadigaScoreResult {
  score_fadiga: number;
  nivel_fadiga: 'VERDE' | 'AMARELO' | 'LARANJA' | 'VERMELHO';
  status_operacional: 'APTO' | 'APTO_COM_RESSALVA' | 'INAPTO';
  recomendacao: string;
  frat_sugerido_nivel: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  requires_frat_review: number;
  componentes: {
    kss_norm: number;
    sono_norm: number;
    qualidade_norm: number;
    sintomas_norm: number;
    bonus_meds: number;
    bonus_alcool: number;
  };
}

export interface LegacyFadigaInput {
  kssScore: number;
  horasSono: number | null;
  qualidadeSono: number;
  sintomas: string[];
  apto?: boolean;
  medsUlt12h?: boolean;
  alcoolUlt12h?: boolean;
}

export interface LegacyFadigaConfig {
  thresholdAmarelo?: number;
  thresholdVermelho?: number;
}

export interface LegacyFadigaResult {
  scoreFadiga: number;
  nivelFadiga: 'BAIXO' | 'MODERADO' | 'ALTO' | 'CRITICO';
  statusOperacional: 'APTO' | 'RESTRITO' | 'NAO_APTO';
  apto: boolean;
  requiresFratReview: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeKss(kssScore: number, policy: FadigaBusinessPolicy): number {
  if (kssScore <= 2) return policy.kssNormLe2;
  if (kssScore <= 4) return policy.kssNormLe4;
  if (kssScore <= 6) return policy.kssNormLe6;
  if (kssScore === 7) return policy.kssNormEq7;
  if (kssScore === 8) return policy.kssNormEq8;
  return policy.kssNormGe9;
}

/**
 * Ausência de dado não equivale a sono adequado. O valor conservador de 0,6 é
 * uma regra empresarial de triagem, não um requisito numérico do RBAC 117.
 */
function normalizeSonoDuracao(horasSono: number | null, policy: FadigaBusinessPolicy): number {
  if (horasSono === null || Number.isNaN(horasSono)) return policy.sleepDurationMissingNorm;
  if (horasSono >= 8) return policy.sleepDurationGe8Norm;
  if (horasSono >= 7) return policy.sleepDurationGe7Norm;
  if (horasSono >= 6) return policy.sleepDurationGe6Norm;
  if (horasSono >= 5) return policy.sleepDurationGe5Norm;
  if (horasSono >= 4) return policy.sleepDurationGe4Norm;
  return policy.sleepDurationLt4Norm;
}

/** Dado de qualidade ausente também é tratado como desconhecido, não como ótimo. */
function normalizeQualidadeSono(qualidadeSono: number | null, policy: FadigaBusinessPolicy): number {
  if (qualidadeSono === null || Number.isNaN(qualidadeSono)) return policy.sleepQualityMissingNorm;
  if (qualidadeSono >= 5) return policy.sleepQualityGe5Norm;
  if (qualidadeSono === 4) return policy.sleepQualityEq4Norm;
  if (qualidadeSono === 3) return policy.sleepQualityEq3Norm;
  if (qualidadeSono === 2) return policy.sleepQualityEq2Norm;
  return policy.sleepQualityLt2Norm;
}

function normalizeSintomas(sintomasJson: Record<string, number> | null): number {
  if (!sintomasJson) return 0;
  const values = Object.values(sintomasJson).filter((v) => typeof v === 'number');
  if (values.length === 0) return 0;
  const media = values.reduce((acc, value) => acc + clamp(value, 0, 3), 0) / values.length;
  return clamp(media / 3, 0, 1);
}

export function calcularScoreFadiga(
  input: FadigaScoreInput,
  config: FadigaScoreConfig,
  policy: FadigaBusinessPolicy = LEGACY_FADIGA_BUSINESS_POLICY,
): FadigaScoreResult {
  const kssNorm = normalizeKss(input.kss_score, policy);
  const sonoNorm = normalizeSonoDuracao(input.horas_sono, policy);
  const qualidadeNorm = normalizeQualidadeSono(input.qualidade_sono, policy);
  const sintomasNorm = normalizeSintomas(input.sintomas_json);

  const base =
    (kssNorm * config.peso_kss +
      sonoNorm * config.peso_sono_duracao +
      qualidadeNorm * config.peso_sono_qualidade +
      sintomasNorm * config.peso_sintomas) *
    100;

  // Penalidades empresariais provisórias de triagem, ainda não calibradas como
  // modelo biomatemático ou fórmula regulatória.
  const bonusMeds = input.meds_ult_12h === true || input.meds_ult_12h === 1 ? policy.medicationBonus : 0;
  const bonusAlcool = input.alcool_ult_12h === true || input.alcool_ult_12h === 1 ? policy.alcoholBonus : 0;
  let score = base + bonusMeds + bonusAlcool;

  if (input.apto === 0) score = Math.max(score, config.threshold_vermelho);

  const scoreFinal = Math.round(clamp(score, 0, 100));
  let nivel: FadigaScoreResult['nivel_fadiga'] = 'VERDE';
  if (scoreFinal >= config.threshold_vermelho + 20) nivel = 'VERMELHO';
  else if (scoreFinal >= config.threshold_vermelho) nivel = 'LARANJA';
  else if (scoreFinal >= config.threshold_amarelo) nivel = 'AMARELO';

  const statusOperacional: FadigaScoreResult['status_operacional'] =
    nivel === 'VERDE' ? 'APTO' : nivel === 'AMARELO' ? 'APTO_COM_RESSALVA' : 'INAPTO';
  const fratSugestao: FadigaScoreResult['frat_sugerido_nivel'] =
    nivel === 'VERDE'
      ? 'BAIXO'
      : nivel === 'AMARELO'
        ? 'MEDIO'
        : nivel === 'LARANJA'
          ? 'ALTO'
          : 'CRITICO';
  const recomendacao =
    nivel === 'VERDE'
      ? 'Apto para a jornada com monitoramento padrão.'
      : nivel === 'AMARELO'
        ? 'Apto com ressalvas. Recomendar mitigadores e monitoramento pelo gestor.'
        : nivel === 'LARANJA'
          ? 'Requer revisão imediata do gestor e análise FRAT antes da decolagem.'
          : 'Situação crítica. Escalar para supervisor e registrar decisão operacional formal.';

  return {
    score_fadiga: scoreFinal,
    nivel_fadiga: nivel,
    status_operacional: statusOperacional,
    recomendacao,
    frat_sugerido_nivel: fratSugestao,
    requires_frat_review: nivel === 'VERMELHO' ? 1 : 0,
    componentes: {
      kss_norm: kssNorm,
      sono_norm: sonoNorm,
      qualidade_norm: qualidadeNorm,
      sintomas_norm: sintomasNorm,
      bonus_meds: bonusMeds,
      bonus_alcool: bonusAlcool,
    },
  };
}

export function horasSonoParaMinutos(horas: number): number {
  return Math.round(horas * 60);
}

export function calcularHorasSono(horaDormiu: string, horaAcordou: string): number {
  const [hd, md] = horaDormiu.split(':').map(Number);
  const [ha, ma] = horaAcordou.split(':').map(Number);
  const dormMin = hd * 60 + md;
  const acordMin = ha * 60 + ma;
  const diffMin = acordMin < dormMin ? acordMin + 1440 - dormMin : acordMin - dormMin;
  return Math.round((diffMin / 60) * 10) / 10;
}

export interface InputSono {
  horaApresentacaoMin: number;
  minutosAntesApresentacao: number;
  horasSonoPadrao: number;
  horaDormiu?: number | null;
  horaAcordou?: number | null;
}

export interface OutputSono {
  tAcordouMin: number;
  tDormiuMin: number;
  sonoEfetivoMin: number;
  fonteSono: 'INFORMADO' | 'PADRAO';
  despertarEstimado: boolean;
}

function normalizeMinuteOfDay(value: number): number {
  return ((value % 1440) + 1440) % 1440;
}

export function isWithinWOCL(
  minutoDoDia: number,
  policy: Pick<FadigaBusinessPolicy, 'woclStartMinute' | 'woclEndMinute'> = LEGACY_FADIGA_BUSINESS_POLICY,
): boolean {
  const m = normalizeMinuteOfDay(minutoDoDia);
  return m >= policy.woclStartMinute && m < policy.woclEndMinute;
}

/**
 * Penalidade empresarial contínua dentro da WOCL fisiológica de 02:00–06:00.
 * A janela é apoiada pela IS 117-001C; a função numérica não é definida pela norma.
 */
export function calcularPenalidadeWOCL(
  tAcordouMin: number,
  policy: Pick<FadigaBusinessPolicy, 'woclStartMinute' | 'woclEndMinute' | 'woclCenterPenalty' | 'woclEdgePenalty'> = LEGACY_FADIGA_BUSINESS_POLICY,
): number {
  const m = normalizeMinuteOfDay(tAcordouMin);
  if (m < policy.woclStartMinute || m >= policy.woclEndMinute) return 0;
  const halfWindow = (policy.woclEndMinute - policy.woclStartMinute) / 2;
  const center = policy.woclStartMinute + halfWindow;
  const distanciaCentro = Math.abs(m - center) / halfWindow;
  return -(policy.woclCenterPenalty - Math.min(1, distanciaCentro) * policy.woclEdgePenalty);
}

/**
 * Resolve sono usando o despertar real quando informado. A estimativa pela
 * apresentação só é usada na ausência do dado real e permanece identificada.
 *
 * Duas proveniências distintas são reportadas separadamente e não devem ser
 * confundidas (ver docs/frms/frms-scientific-audit.md, D-01):
 *
 * - `fonteSono` descreve a proveniência do **dado de sono** (duração). É
 *   `INFORMADO` quando o tripulante forneceu `horaDormiu` e/ou `horaAcordou`.
 *   Esta é a semântica gravada em `frms_jornada.fonte_sono` pela rota
 *   `frms.ts` ao registrar `hora_dormiu`, e é a que `informedData` consome.
 * - `despertarEstimado` descreve a proveniência do **horário de despertar**.
 *   É `true` sempre que o despertar foi derivado da apresentação.
 */
export function calcularSono(input: InputSono): OutputSono {
  const despertarEstimado = input.horaAcordou == null;
  const tAcordouMin =
    input.horaAcordou == null
      ? input.horaApresentacaoMin - input.minutosAntesApresentacao
      : input.horaAcordou;

  let sonoEfetivoMin: number;
  if (input.horaDormiu != null) {
    const acordouDia = normalizeMinuteOfDay(tAcordouMin);
    const dormiuDia = normalizeMinuteOfDay(input.horaDormiu);
    const diff = acordouDia - dormiuDia;
    sonoEfetivoMin = diff >= 0 ? diff : diff + 1440;
  } else {
    sonoEfetivoMin = Math.round(input.horasSonoPadrao * 60);
  }

  if (!Number.isFinite(sonoEfetivoMin) || sonoEfetivoMin <= 0) {
    sonoEfetivoMin = Math.round(input.horasSonoPadrao * 60);
  }
  sonoEfetivoMin = Math.min(sonoEfetivoMin, 960);

  return {
    tAcordouMin,
    tDormiuMin: tAcordouMin - sonoEfetivoMin,
    sonoEfetivoMin,
    fonteSono: input.horaDormiu != null || input.horaAcordou != null ? 'INFORMADO' : 'PADRAO',
    despertarEstimado,
  };
}

/**
 * Fator fracionário de risco por sono. Oito horas ou mais definem baseline 0;
 * sono adicional não gera bônus positivo. Dado inválido/desconhecido falha fechado.
 */
export function calcularFatorRepouso(duracaoSonoMin: number): number {
  if (!Number.isFinite(duracaoSonoMin) || duracaoSonoMin <= 0) return -0.5;
  if (duracaoSonoMin >= 480) return 0;
  return -((480 - duracaoSonoMin) / 480) * 0.5;
}

export function calculateFadigaScore(
  input: LegacyFadigaInput,
  config?: LegacyFadigaConfig,
): LegacyFadigaResult {
  if (input.kssScore >= 9) {
    return {
      scoreFadiga: 100,
      nivelFadiga: 'CRITICO',
      statusOperacional: 'NAO_APTO',
      apto: false,
      requiresFratReview: true,
    };
  }

  const internalConfig: FadigaScoreConfig = {
    threshold_amarelo: config?.thresholdAmarelo ?? 35,
    threshold_vermelho: config?.thresholdVermelho ?? 55,
    peso_kss: 0.4,
    peso_sono_duracao: 0.25,
    peso_sono_qualidade: 0.2,
    peso_sintomas: 0.15,
  };
  const sintomasJson = input.sintomas.reduce<Record<string, number>>((acc, nome, idx) => {
    acc[`${nome}-${idx}`] = 1;
    return acc;
  }, {});
  const out = calcularScoreFadiga(
    {
      kss_score: input.kssScore,
      horas_sono: input.horasSono,
      qualidade_sono: input.qualidadeSono,
      sintomas_json: sintomasJson,
      apto: input.apto === false ? 0 : 1,
      meds_ult_12h: input.medsUlt12h ? 1 : 0,
      alcool_ult_12h: input.alcoolUlt12h ? 1 : 0,
    },
    internalConfig,
  );
  const nivelFadiga: LegacyFadigaResult['nivelFadiga'] =
    out.nivel_fadiga === 'VERDE'
      ? 'BAIXO'
      : out.nivel_fadiga === 'AMARELO'
        ? 'MODERADO'
        : out.nivel_fadiga === 'LARANJA'
          ? 'ALTO'
          : 'CRITICO';
  const statusOperacional: LegacyFadigaResult['statusOperacional'] =
    nivelFadiga === 'CRITICO' ? 'NAO_APTO' : nivelFadiga === 'BAIXO' ? 'APTO' : 'RESTRITO';
  return {
    scoreFadiga: out.score_fadiga,
    nivelFadiga,
    statusOperacional,
    apto: statusOperacional === 'APTO',
    requiresFratReview: out.requires_frat_review === 1 || out.nivel_fadiga !== 'VERDE',
  };
}
