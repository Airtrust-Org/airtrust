import type { TipoLimite } from './types';
import type {
  FrmsOperationalSnapshotAlertCode,
  FrmsOperationalSnapshotItem,
  FrmsOperationalSnapshotStatus,
} from './operational-snapshot';

export const FRMS_NATUREZA_DADO = [
  'PROJECAO',
  'CHECKIN_SUBJETIVO',
  'JORNADA_PLANEJADA',
  'JORNADA_REALIZADA',
  'ACUMULADO_LEGAL',
] as const;

export type FrmsNaturezaDado = (typeof FRMS_NATUREZA_DADO)[number];

export const FRMS_DECISAO_CODIGOS = [
  'INFORMA',
  'ALERTA',
  'EXIGE_OVERRIDE',
  'BLOQUEIA',
] as const;

export type FrmsDecisaoCodigo = (typeof FRMS_DECISAO_CODIGOS)[number];

export const FRMS_MITIGACAO_RECOMENDADA = [
  'TROCAR_TRIPULANTE',
  'REDUZIR_JORNADA',
  'INSERIR_REPOUSO',
  'REVISAR_CHECKIN',
  'AGUARDAR_SIGVOOS',
  'ACEITAR_COM_RESSALVA',
  'SEM_ACAO',
] as const;

export type FrmsMitigacaoRecomendada = (typeof FRMS_MITIGACAO_RECOMENDADA)[number];

export interface FrmsLimiteReferencia {
  tipo: TipoLimite | 'QUINZENA' | 'CHECKIN';
  valor_atual: number;
  valor_limite: number;
  pct_atingido: number;
}

export interface FrmsDecisaoFields {
  natureza_dado: FrmsNaturezaDado;
  causa: string;
  mitigacao_recomendada: FrmsMitigacaoRecomendada;
  decisao: FrmsDecisaoCodigo;
  limite_referencia: FrmsLimiteReferencia | null;
}

export interface FrmsDecisaoOverride {
  event_id: string;
  empresa_id: number;
  responsavel_user_id: number;
  justificativa: string;
  evidencia_ref: string | null;
  timestamp: string;
}

export interface FrmsOverrideAckNoteV1 {
  _override_schema: 1;
  responsavel_user_id: number;
  justificativa: string;
  evidencia_ref: string | null;
  override_at: string;
}

export interface FrmsDecisaoPolicy {
  atencao?: FrmsDecisaoCodigo;
  incompleto?: FrmsDecisaoCodigo;
  critico?: FrmsDecisaoCodigo;
  violacao?: FrmsDecisaoCodigo;
  allowBloqueia?: boolean;
}

export const CAUSA_POR_ALERTA: Record<FrmsOperationalSnapshotAlertCode, string> = {
  CHECKIN_PENDENTE: 'Check-in pendente para voo escalado',
  CHECKIN_CRITICO: 'Check-in indica fadiga critica',
  SONO_ESTIMADO: 'Dado de sono estimado sem check-in real',
  SONO_INSUFICIENTE: 'Horas de sono abaixo de 6h',
  KSS_ALTO: 'Escala KSS elevada indicando sonolencia',
  EFETIVIDADE_BAIXA: 'Indice de efetividade abaixo de 70%',
  JORNADA_SEM_FATORIZACAO: 'Jornada sem calculo de fatorizacao FRMS',
  ESCALADO_SEM_JORNADA_FRMS: 'Tripulante escalado sem registro de jornada FRMS',
  JORNADA_FRMS_SEM_ESCALA: 'Jornada FRMS sem vinculo de escala operacional',
  DADO_INCONSISTENTE: 'Inconsistencia nos dados de jornada',
};

const ALERT_PRIORITY: FrmsOperationalSnapshotAlertCode[] = [
  'CHECKIN_CRITICO',
  'EFETIVIDADE_BAIXA',
  'CHECKIN_PENDENTE',
  'SONO_INSUFICIENTE',
  'KSS_ALTO',
  'DADO_INCONSISTENTE',
  'JORNADA_SEM_FATORIZACAO',
  'ESCALADO_SEM_JORNADA_FRMS',
  'JORNADA_FRMS_SEM_ESCALA',
  'SONO_ESTIMADO',
];

// Defaults tecnicos conservadores usados somente como referencia quando nao ha
// limite contextual disponivel. Nao sao configuracao por empresa nem evidencia
// ou afirmacao de limite regulatorio.
const TECHNICAL_DEFAULT_FDP_DAILY_LIMIT_MINUTES = 11 * 60;
const TECHNICAL_DEFAULT_HV_DAILY_LIMIT_MINUTES = 8 * 60;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isSafePolicyDecision(
  decision: FrmsDecisaoCodigo | undefined,
  fallback: FrmsDecisaoCodigo,
  policy: FrmsDecisaoPolicy,
): FrmsDecisaoCodigo {
  if (!decision) return fallback;
  if (decision === 'BLOQUEIA' && policy.allowBloqueia !== true) return fallback;
  return decision;
}

function hasObviousSensitiveInlineData(value: string): boolean {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const cpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
  const secret = /\b(token|cookie|senha|password|secret)\b/i;
  return email.test(value) || cpf.test(value) || secret.test(value);
}

export function resolveNaturezaDado(
  item: Pick<
    FrmsOperationalSnapshotItem,
    'jornada_data_source' | 'escala_source' | 'checkin_status' | 'data_operacional'
  >,
  hoje: string = todayIso(),
): FrmsNaturezaDado {
  if (item.data_operacional > hoje) return 'PROJECAO';
  if (item.checkin_status === 'RECEBIDO' && item.jornada_data_source === 'AUSENTE') {
    return 'CHECKIN_SUBJETIVO';
  }
  if (item.jornada_data_source === 'REAL') return 'JORNADA_REALIZADA';
  if (
    item.jornada_data_source === 'MANUAL' ||
    item.jornada_data_source === 'ESTIMADO' ||
    item.jornada_data_source === 'AUSENTE' ||
    item.jornada_data_source === 'INCONSISTENTE'
  ) {
    return 'JORNADA_PLANEJADA';
  }
  return 'PROJECAO';
}

export function resolveCausa(alertas: FrmsOperationalSnapshotAlertCode[]): string {
  for (const code of ALERT_PRIORITY) {
    if (alertas.includes(code)) return CAUSA_POR_ALERTA[code];
  }
  return 'Nenhuma ocorrencia identificada';
}

export function resolveMitigacao(
  alertas: FrmsOperationalSnapshotAlertCode[],
  natureza: FrmsNaturezaDado,
  status: FrmsOperationalSnapshotStatus,
): FrmsMitigacaoRecomendada {
  if (alertas.includes('CHECKIN_CRITICO')) return 'TROCAR_TRIPULANTE';
  if (alertas.includes('EFETIVIDADE_BAIXA')) return 'REDUZIR_JORNADA';
  if (alertas.includes('CHECKIN_PENDENTE')) return 'REVISAR_CHECKIN';
  if (alertas.includes('SONO_INSUFICIENTE')) return 'INSERIR_REPOUSO';
  if (alertas.includes('SONO_ESTIMADO') && natureza === 'CHECKIN_SUBJETIVO') {
    return 'REVISAR_CHECKIN';
  }
  if (
    alertas.includes('SONO_ESTIMADO') ||
    alertas.includes('JORNADA_SEM_FATORIZACAO') ||
    alertas.includes('ESCALADO_SEM_JORNADA_FRMS')
  ) {
    return 'AGUARDAR_SIGVOOS';
  }
  if (status === 'OK') return 'SEM_ACAO';
  return 'ACEITAR_COM_RESSALVA';
}

export function resolveDecisao(
  status: FrmsOperationalSnapshotStatus | 'VIOLACAO',
  natureza: FrmsNaturezaDado,
  policy: FrmsDecisaoPolicy = {},
): FrmsDecisaoCodigo {
  if (status === 'OK') return 'INFORMA';

  if (natureza === 'PROJECAO' || natureza === 'CHECKIN_SUBJETIVO') {
    // Dado projetado ou subjetivo nunca sustenta decisao acima de ALERTA,
    // mesmo quando uma policy configurada solicite override ou bloqueio.
    return 'ALERTA';
  }

  if (status === 'ATENCAO') {
    return isSafePolicyDecision(policy.atencao, 'ALERTA', policy);
  }
  if (status === 'INCOMPLETO') {
    return isSafePolicyDecision(policy.incompleto, 'ALERTA', policy);
  }
  if (status === 'CRITICO') {
    return isSafePolicyDecision(policy.critico, 'EXIGE_OVERRIDE', policy);
  }
  if (status === 'VIOLACAO') {
    return isSafePolicyDecision(policy.violacao, 'EXIGE_OVERRIDE', policy);
  }

  return 'ALERTA';
}

export function resolveLimiteReferencia(
  item: FrmsOperationalSnapshotItem,
): FrmsLimiteReferencia | null {
  if (item.kss_score != null && item.kss_score >= 7) {
    return {
      tipo: 'CHECKIN',
      valor_atual: item.kss_score,
      valor_limite: 7,
      pct_atingido: round1((item.kss_score / 7) * 100),
    };
  }

  if (item.duracao_jornada_minutos > 0) {
    return {
      tipo: 'FDP_DIARIO',
      valor_atual: item.duracao_jornada_minutos,
      valor_limite: TECHNICAL_DEFAULT_FDP_DAILY_LIMIT_MINUTES,
      pct_atingido: round1(
        (item.duracao_jornada_minutos / TECHNICAL_DEFAULT_FDP_DAILY_LIMIT_MINUTES) * 100,
      ),
    };
  }

  if (item.horas_voo_minutos > 0) {
    return {
      tipo: 'HV_DIARIA',
      valor_atual: item.horas_voo_minutos,
      valor_limite: TECHNICAL_DEFAULT_HV_DAILY_LIMIT_MINUTES,
      pct_atingido: round1(
        (item.horas_voo_minutos / TECHNICAL_DEFAULT_HV_DAILY_LIMIT_MINUTES) * 100,
      ),
    };
  }

  const fortnight = item.fortnight_indicator;
  if (fortnight?.duty_time_periodo_min != null && fortnight.total_dias_periodo) {
    const limit = fortnight.total_dias_periodo * TECHNICAL_DEFAULT_FDP_DAILY_LIMIT_MINUTES;
    return {
      tipo: 'QUINZENA',
      valor_atual: fortnight.duty_time_periodo_min,
      valor_limite: limit,
      pct_atingido: limit > 0 ? round1((fortnight.duty_time_periodo_min / limit) * 100) : 0,
    };
  }

  return null;
}

export function buildDecisaoFields(
  item: FrmsOperationalSnapshotItem,
  options: {
    hoje?: string;
    policy?: FrmsDecisaoPolicy;
    naturezaDado?: FrmsNaturezaDado;
  } = {},
): FrmsDecisaoFields {
  const natureza =
    options.naturezaDado ?? resolveNaturezaDado(item, options.hoje ?? todayIso());
  return {
    natureza_dado: natureza,
    causa: resolveCausa(item.alertas),
    mitigacao_recomendada: resolveMitigacao(item.alertas, natureza, item.snapshot_status),
    decisao: resolveDecisao(item.snapshot_status, natureza, options.policy ?? {}),
    limite_referencia: resolveLimiteReferencia(item),
  };
}

export function sanitizeOverrideJustificativa(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length < 10 || normalized.length > 500) return null;
  if (hasObviousSensitiveInlineData(normalized)) return null;
  return normalized;
}

export function sanitizeOverrideEvidenceRef(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 120) return null;
  if (hasObviousSensitiveInlineData(normalized)) return null;
  return normalized;
}

export function buildOverrideAckNote(input: {
  responsavel_user_id: number;
  justificativa: string;
  evidencia_ref?: string | null;
  override_at: string;
}): FrmsOverrideAckNoteV1 | null {
  const justificativa = sanitizeOverrideJustificativa(input.justificativa);
  if (!justificativa) return null;
  const evidenciaRef = sanitizeOverrideEvidenceRef(input.evidencia_ref);
  return {
    _override_schema: 1,
    responsavel_user_id: input.responsavel_user_id,
    justificativa,
    evidencia_ref: evidenciaRef,
    override_at: input.override_at,
  };
}

export function parseOverrideAckNote(value: unknown): FrmsOverrideAckNoteV1 | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Partial<FrmsOverrideAckNoteV1>;
    if (record._override_schema !== 1) return null;
    if (!Number.isFinite(Number(record.responsavel_user_id))) return null;
    const justificativa = sanitizeOverrideJustificativa(record.justificativa);
    if (!justificativa) return null;
    const evidenciaRef = sanitizeOverrideEvidenceRef(record.evidencia_ref);
    if (typeof record.override_at !== 'string' || !record.override_at) return null;
    return {
      _override_schema: 1,
      responsavel_user_id: Number(record.responsavel_user_id),
      justificativa,
      evidencia_ref: evidenciaRef,
      override_at: record.override_at,
    };
  } catch {
    return null;
  }
}
