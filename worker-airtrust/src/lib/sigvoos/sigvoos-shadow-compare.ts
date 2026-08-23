/**
 * SIGVOOS shadow comparator — Fase 0 (see docs for the real-shadow spec).
 *
 * Pure, deterministic classification of a shadow leg snapshot against the
 * operational (path A) frms_jornada record for the same identity, or against
 * a manual Controle de Voos value when one exists. Never touches the
 * network, never mutates FRMS operational state, never invents a numeric
 * cutover threshold. `DIFF_CRITICAL` only documents divergence in this phase
 * — it does not trigger any automatic promotion or rollback.
 */

export type SigvoosShadowClassification =
  | 'MATCH'
  | 'DIFF_NONCRITICAL'
  | 'DIFF_CRITICAL'
  | 'ONLY_DIRECT_PATH'
  | 'ONLY_SHADOW_PATH'
  | 'UNMAPPED_CREW'
  | 'UNSTABLE_IDENTITY'
  | 'TIMEZONE_UNRESOLVED'
  | 'MANUAL_CONFLICT'
  | 'SOURCE_CHANGED';

/** Fields whose divergence blocks a MATCH/DIFF_NONCRITICAL verdict — these
 * feed FRMS flight-time/duty-time computations directly. */
const CRITICAL_FIELDS = [
  'engineStartTime',
  'takeoffTime',
  'landingTime',
  'engineShutoffTime',
  'dayLandings',
  'nightLandings',
  'starts',
  'departureIcao',
  'arrivalIcao',
] as const;

export interface ShadowComparableLeg {
  flightReportId: string | null;
  legNumber: number | null;
  funcionarioId: string | null;
  engineStartTime: string | null;
  takeoffTime: string | null;
  landingTime: string | null;
  engineShutoffTime: string | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  dayLandings: number | null;
  nightLandings: number | null;
  starts: number | null;
  matriculaAeronave?: string | null;
}

export interface ShadowComparisonInput {
  identityQuality: 'STABLE' | 'UNSTABLE_IDENTITY';
  timezoneStatus: 'RESOLVED' | 'TIMEZONE_UNRESOLVED';
  crewResolutionMethod: 'MANUAL' | 'CANAC' | 'MATRICULA' | 'NOME_FUZZY' | 'NAO_ENCONTRADO' | null;
  sourceChanged: boolean;
  manualConflict: boolean;
  direct: ShadowComparableLeg | null;
  shadow: ShadowComparableLeg | null;
}

export interface ShadowComparisonResult {
  classification: SigvoosShadowClassification;
  fieldDifferences: Record<string, { direct: unknown; shadow: unknown }>;
}

function diffFields(
  direct: ShadowComparableLeg,
  shadow: ShadowComparableLeg,
): Record<string, { direct: unknown; shadow: unknown }> {
  const diffs: Record<string, { direct: unknown; shadow: unknown }> = {};
  const keys = new Set<string>([
    ...Object.keys(direct),
    ...Object.keys(shadow),
  ]) as Set<keyof ShadowComparableLeg>;
  for (const key of keys) {
    const a = direct[key] ?? null;
    const b = shadow[key] ?? null;
    if (a !== b) diffs[key as string] = { direct: a, shadow: b };
  }
  return diffs;
}

/**
 * Classifies one identity (flightReportId+legNumber, or funcionario+date at
 * the daily granularity — caller decides which comparable shape to pass).
 * Precedence follows the spec: identity/timezone/crew problems are surfaced
 * before content-diff classification, since a MATCH cannot be claimed when
 * the underlying identity itself is not trustworthy.
 */
export function classifyShadowComparison(input: ShadowComparisonInput): ShadowComparisonResult {
  if (input.identityQuality === 'UNSTABLE_IDENTITY') {
    return { classification: 'UNSTABLE_IDENTITY', fieldDifferences: {} };
  }

  if (input.crewResolutionMethod === 'NAO_ENCONTRADO' || input.crewResolutionMethod === null) {
    return { classification: 'UNMAPPED_CREW', fieldDifferences: {} };
  }

  if (input.timezoneStatus === 'TIMEZONE_UNRESOLVED') {
    return { classification: 'TIMEZONE_UNRESOLVED', fieldDifferences: {} };
  }

  if (input.manualConflict) {
    return { classification: 'MANUAL_CONFLICT', fieldDifferences: {} };
  }

  if (input.sourceChanged) {
    return { classification: 'SOURCE_CHANGED', fieldDifferences: {} };
  }

  if (!input.direct && !input.shadow) {
    return { classification: 'MATCH', fieldDifferences: {} };
  }

  if (input.direct && !input.shadow) {
    return { classification: 'ONLY_DIRECT_PATH', fieldDifferences: {} };
  }

  if (!input.direct && input.shadow) {
    return { classification: 'ONLY_SHADOW_PATH', fieldDifferences: {} };
  }

  const diffs = diffFields(input.direct as ShadowComparableLeg, input.shadow as ShadowComparableLeg);
  if (Object.keys(diffs).length === 0) {
    return { classification: 'MATCH', fieldDifferences: {} };
  }

  const hasCriticalDiff = Object.keys(diffs).some((key) =>
    (CRITICAL_FIELDS as readonly string[]).includes(key),
  );

  return {
    classification: hasCriticalDiff ? 'DIFF_CRITICAL' : 'DIFF_NONCRITICAL',
    fieldDifferences: diffs,
  };
}
