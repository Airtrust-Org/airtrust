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
  const base = { key: 'daily-fatigue' as const, label: 'Check-in diário' };

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
  const base = { key: 'compliance' as const, label: 'Risco do período' };
  const indicator = item.fortnight_indicator;

  const formatHours = (minutes: number | null | undefined) => {
    const value = Number(minutes ?? 0);
    if (!Number.isFinite(value) || value <= 0) return null;
    return `${(value / 60).toFixed(1).replace('.', ',')} h`;
  };
  const loadDetails = [
    formatHours(indicator?.horas_voo_periodo_min)
      ? `voo real ${formatHours(indicator?.horas_voo_periodo_min)}`
      : null,
    formatHours(indicator?.simulador_periodo_min)
      ? `simulador ${formatHours(indicator?.simulador_periodo_min)}`
      : null,
    formatHours(indicator?.treinamento_periodo_min)
      ? `treinamento ${formatHours(indicator?.treinamento_periodo_min)}`
      : null,
    indicator?.dias_atividade_periodo != null
      ? `${indicator.dias_atividade_periodo} dia(s) de atividade`
      : null,
  ].filter(Boolean);
  const riskReasons = (indicator?.agravantes_aplicados ?? [])
    .filter((modifier) => modifier.impacto_score > 0)
    .slice(0, 2)
    .map((modifier) => modifier.descricao);
  const detailParts = [...riskReasons, ...loadDetails];
  const detail = detailParts.length > 0 ? detailParts.join(' · ') : undefined;

  if (!indicator) {
    return { ...base, value: 'Dados incompletos', tone: 'unknown' };
  }

  switch (indicator.status_quinzena) {
    case 'OK':
      return { ...base, value: 'Dentro da referência', tone: 'ok', detail };
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
  const projectionDetail =
    item.effectiveness_source === 'PROJETADA_ATIVIDADE'
      ? 'Projetada com check-in e atividade planejada do dia; simulador entra como HV equivalente FRMS.'
      : item.effectiveness_source === 'PROJETADA_APRESENTACAO'
        ? 'Projetada para a hora de apresentação com base no check-in; carga operacional futura ainda não incorporada.'
        : undefined;

  if (item.estado_operacional === 'CRITICO_VIOLACAO' || item.snapshot_status === 'CRITICO') {
    return { ...base, value, tone: 'critical', detail: projectionDetail };
  }

  if (hasLowAlert) {
    return {
      ...base,
      value,
      tone: 'warning',
      detail: projectionDetail
        ? `Efetividade cognitiva reduzida. ${projectionDetail}`
        : 'Efetividade cognitiva reduzida',
    };
  }

  return { ...base, value, tone: 'ok', detail: projectionDetail };
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
      if (item.checkin_status === 'RECEBIDO') {
        return {
          ...base,
          value: 'Resultado não registrado',
          tone: 'unknown',
          detail:
            resolution.detail ??
            'Check-in recebido, mas não há avaliação de prontidão persistida para este dia.',
        };
      }
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
