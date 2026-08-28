/**
 * FRMS — Sinais operacionais compartilhados
 *
 * Quatro sinais fixos que explicam, em segundos, a condição operacional de um
 * tripulante no dia:
 *   1. Fadiga diária   — deriva de `checkin_status` (dado real do snapshot)
 *   2. Compliance       — deriva de `fortnight_indicator.status_quinzena`
 *   3. Efetividade      — deriva de `trustedEffectiveness()` + alertas/estado
 *   4. Prontidão        — deriva de um adapter opcional (frente da PR #68)
 *
 * Este módulo contém APENAS resolução de estado (funções puras e testáveis).
 * A apresentação vive em `components/FrmsOperationalSignals.tsx`.
 *
 * Regras de segurança respeitadas aqui:
 *   - ausência de check-in NUNCA vira verde;
 *   - não fabricamos `0%` de compliance nem de efetividade;
 *   - não inventamos thresholds novos de efetividade — usamos o estado já
 *     calculado pelo backend;
 *   - Prontidão não é apresentada como "APTO/NÃO APTO"; sem dado autoritativo
 *     mostramos "Não avaliado" (cinza).
 */
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { trustedEffectiveness } from './frmsOperationalDecision';

export type FrmsSignalTone = 'ok' | 'warning' | 'critical' | 'unknown';

export type FrmsOperationalSignalKey =
  | 'daily-fatigue'
  | 'compliance'
  | 'effectiveness'
  | 'readiness';

export interface FrmsOperationalSignal {
  key: FrmsOperationalSignalKey;
  label: string;
  value: string;
  tone: FrmsSignalTone;
  detail?: string;
}

/**
 * Classificação autoritativa de prontidão vinda da frente correspondente à
 * PR #68 (`feat(frms): operational readiness vigilance + thermal foundation`).
 *
 * Enquanto essa frente não estiver integrada na `main` oficial, o adapter
 * simplesmente devolve `null` e o sinal aparece como "Não avaliado". Quando o
 * contrato existir (tenant-safe, RBAC-safe, sem migration pendente), basta
 * fornecer um `FrmsReadinessAdapter` real — sem redesenhar o componente.
 */
export type FrmsReadinessClassification =
  | 'preserved'
  | 'attention'
  | 'operational_review'
  | 'baseline_building';

export interface FrmsReadinessResolution {
  classification: FrmsReadinessClassification | null;
  detail?: string;
}

export type FrmsReadinessAdapter = (
  item: FrmsOperationalSnapshotItem,
) => FrmsReadinessResolution | FrmsReadinessClassification | null;

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Sinal 1 — Fadiga diária (check-in subjetivo). */
export function resolveDailyFatigueSignal(
  item: FrmsOperationalSnapshotItem,
): FrmsOperationalSignal {
  const base = { key: 'daily-fatigue' as const, label: 'Fadiga diária' };

  const horario = item.checkin_horario?.trim();
  const kss = item.kss_score;
  const detailParts: string[] = [];
  if (horario) detailParts.push(`Check-in às ${horario}`);
  if (kss != null && Number.isFinite(kss)) detailParts.push(`KSS ${kss}`);
  const detail = detailParts.length > 0 ? detailParts.join(' · ') : undefined;

  switch (item.checkin_status) {
    case 'RECEBIDO':
      return { ...base, value: 'Realizada', tone: 'ok', detail };
    case 'PENDENTE':
      return { ...base, value: 'Pendente', tone: 'critical', detail };
    case 'AUSENTE':
      return { ...base, value: 'Não realizada', tone: 'critical', detail };
    case 'NAO_APLICAVEL':
    default:
      return { ...base, value: 'N/A', tone: 'unknown' };
  }
}

/** Sinal 2 — Compliance regulatório (indicador quinzenal do FRMS). */
export function resolveComplianceSignal(
  item: FrmsOperationalSnapshotItem,
): FrmsOperationalSignal {
  const base = { key: 'compliance' as const, label: 'Compliance' };
  const indicator = item.fortnight_indicator;

  const pct = indicator?.limite_referencia?.pct_atingido;
  const detail =
    pct != null && Number.isFinite(pct)
      ? `${Math.round(pct)}% do limite de referência`
      : undefined;

  if (!indicator) {
    return { ...base, value: 'Dados incompletos', tone: 'unknown' };
  }

  switch (indicator.status_quinzena) {
    case 'OK':
      return { ...base, value: 'Conforme', tone: 'ok', detail };
    case 'ATENCAO':
      return { ...base, value: 'Atenção', tone: 'warning', detail };
    case 'CRITICO':
      return { ...base, value: 'Crítico', tone: 'critical', detail };
    case 'INCOMPLETO':
    default:
      return { ...base, value: 'Dados incompletos', tone: 'unknown', detail };
  }
}

/** Sinal 3 — Efetividade cognitiva (usa o estado já calculado pelo backend). */
export function resolveEffectivenessSignal(
  item: FrmsOperationalSnapshotItem,
): FrmsOperationalSignal {
  const base = { key: 'effectiveness' as const, label: 'Efetividade' };

  const effectiveness = trustedEffectiveness(item);
  if (effectiveness == null) {
    // Nunca 0% — sem base confiável o sinal é "Não calculada".
    return { ...base, value: 'Não calculada', tone: 'unknown' };
  }

  const value = formatPercent(effectiveness);
  const hasLowAlert = item.alertas.includes('EFETIVIDADE_BAIXA');

  if (item.estado_operacional === 'CRITICO_VIOLACAO' || item.snapshot_status === 'CRITICO') {
    return { ...base, value, tone: 'critical' };
  }

  if (hasLowAlert) {
    return {
      ...base,
      value,
      tone: 'warning',
      detail: 'Efetividade cognitiva reduzida',
    };
  }

  return { ...base, value, tone: 'ok' };
}

/** Sinal 4 — Prontidão (classificação autoritativa opcional). */
export function resolveReadinessSignal(
  item: FrmsOperationalSnapshotItem,
  adapter?: FrmsReadinessAdapter,
): FrmsOperationalSignal {
  const base = { key: 'readiness' as const, label: 'Prontidão' };

  const raw = adapter ? adapter(item) : null;
  const resolution: FrmsReadinessResolution =
    raw == null
      ? { classification: null }
      : typeof raw === 'string'
        ? { classification: raw }
        : raw;

  switch (resolution.classification) {
    case 'preserved':
      return { ...base, value: 'Preservada', tone: 'ok', detail: resolution.detail };
    case 'attention':
      return { ...base, value: 'Atenção', tone: 'warning', detail: resolution.detail };
    case 'operational_review':
      return {
        ...base,
        value: 'Revisão operacional',
        tone: 'critical',
        detail: resolution.detail,
      };
    case 'baseline_building':
      return {
        ...base,
        value: 'Baseline em formação',
        tone: 'unknown',
        detail: resolution.detail,
      };
    case null:
    default:
      return { ...base, value: 'Não avaliado', tone: 'unknown' };
  }
}

export interface ResolveOperationalSignalsOptions {
  readinessAdapter?: FrmsReadinessAdapter;
}

/** Deriva os quatro sinais operacionais fixos, sempre na mesma ordem. */
export function resolveOperationalSignals(
  item: FrmsOperationalSnapshotItem,
  options: ResolveOperationalSignalsOptions = {},
): FrmsOperationalSignal[] {
  return [
    resolveDailyFatigueSignal(item),
    resolveComplianceSignal(item),
    resolveEffectivenessSignal(item),
    resolveReadinessSignal(item, options.readinessAdapter),
  ];
}
