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

// Compat API antiga usada por testes e possíveis consumidores legados.
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

function normalizeKss(kssScore: number): number {
  if (kssScore <= 2) return 0;
  if (kssScore <= 4) return 0.15;
  if (kssScore <= 6) return 0.4;
  if (kssScore === 7) return 0.7;
  if (kssScore === 8) return 0.85;
  return 1;
}

function normalizeSonoDuracao(horasSono: number | null): number {
  if (horasSono === null || Number.isNaN(horasSono)) return 0.2;
  if (horasSono >= 8) return 0;
  if (horasSono >= 7) return 0.15;
  if (horasSono >= 6) return 0.35;
  if (horasSono >= 5) return 0.6;
  if (horasSono >= 4) return 0.8;
  return 1;
}

function normalizeQualidadeSono(qualidadeSono: number | null): number {
  if (qualidadeSono === null || Number.isNaN(qualidadeSono)) return 0;
  if (qualidadeSono >= 5) return 0;
  if (qualidadeSono === 4) return 0.2;
  if (qualidadeSono === 3) return 0.45;
  if (qualidadeSono === 2) return 0.7;
  return 1;
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
): FadigaScoreResult {
  const kssNorm = normalizeKss(input.kss_score);
  const sonoNorm = normalizeSonoDuracao(input.horas_sono);
  const qualidadeNorm = normalizeQualidadeSono(input.qualidade_sono);
  const sintomasNorm = normalizeSintomas(input.sintomas_json);

  const base =
    (kssNorm * config.peso_kss +
      sonoNorm * config.peso_sono_duracao +
      qualidadeNorm * config.peso_sono_qualidade +
      sintomasNorm * config.peso_sintomas) *
    100;

  // Penalidades operacionais provisórias: não são valores cientificamente calibrados.
  // Funcionam como proxy conservador de triagem e devem ser calibradas futuramente
  // com dados reais e revisão científica.
  const bonusMeds = input.meds_ult_12h === true || input.meds_ult_12h === 1 ? 8 : 0;
  const bonusAlcool = input.alcool_ult_12h === true || input.alcool_ult_12h === 1 ? 15 : 0;
  let score = base + bonusMeds + bonusAlcool;

  if (input.apto === 0) {
    score = Math.max(score, config.threshold_vermelho);
  }

  const scoreFinal = Math.round(clamp(score, 0, 100));

  let nivel: FadigaScoreResult['nivel_fadiga'] = 'VERDE';
  if (scoreFinal >= config.threshold_vermelho + 20) {
    nivel = 'VERMELHO';
  } else if (scoreFinal >= config.threshold_vermelho) {
    nivel = 'LARANJA';
  } else if (scoreFinal >= config.threshold_amarelo) {
    nivel = 'AMARELO';
  }

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
}

export interface OutputSono {
  tAcordouMin: number;
  tDormiuMin: number;
  sonoEfetivoMin: number;
  fonteSono: 'INFORMADO' | 'PADRAO';
}

function normalizeMinuteOfDay(value: number): number {
  return ((value % 1440) + 1440) % 1440;
}

export function isWithinWOCL(minutoDoDia: number): boolean {
  const m = normalizeMinuteOfDay(minutoDoDia);
  return m >= 120 && m < 360;
}

export function calcularPenalidadeWOCL(tAcordouMin: number): number {
  const m = normalizeMinuteOfDay(tAcordouMin);
  if (m < 120 || m >= 360) return 0;
  const progress = (m - 120) / 239;
  return -(0.3 - progress * 0.25);
}

export function calcularSono(input: InputSono): OutputSono {
  const tAcordouMin = input.horaApresentacaoMin - input.minutosAntesApresentacao;

  let sonoEfetivoMin: number;
  let fonteSono: 'INFORMADO' | 'PADRAO';

  if (input.horaDormiu != null) {
    const acordouDia = normalizeMinuteOfDay(tAcordouMin);
    const dormiuDia = normalizeMinuteOfDay(input.horaDormiu);
    const diff = acordouDia - dormiuDia;
    sonoEfetivoMin = diff >= 0 ? diff : diff + 1440;
    fonteSono = 'INFORMADO';
  } else {
    sonoEfetivoMin = Math.round(input.horasSonoPadrao * 60);
    fonteSono = 'PADRAO';
  }

  sonoEfetivoMin = Math.min(sonoEfetivoMin, 960);

  if (sonoEfetivoMin < 0 || !Number.isFinite(sonoEfetivoMin)) {
    sonoEfetivoMin = Math.round(input.horasSonoPadrao * 60);
    fonteSono = 'PADRAO';
  }

  return {
    tAcordouMin,
    tDormiuMin: tAcordouMin - sonoEfetivoMin,
    sonoEfetivoMin,
    fonteSono,
  };
}

export function calcularFatorRepouso(duracaoSonoMin: number): number {
  if (!Number.isFinite(duracaoSonoMin) || duracaoSonoMin <= 0) return 0;
  if (duracaoSonoMin >= 600) return 0.05;
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
