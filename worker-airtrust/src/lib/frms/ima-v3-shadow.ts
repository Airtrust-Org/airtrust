/**
 * FRMS V3 / IMA — strictly experimental, read-only, dependency-free.
 *
 * Not validated as a physiological measurement, flight-dispatch limit, fit-for-duty
 * test or ANAC/ICAO/IOGP score. Numeric output is available ONLY for explicitly
 * synthetic research fixtures. This module has no D1/R2, API or production hooks.
 *
 * Two-process homeostatic shape:
 *   awake: S(t+dt) = 1 - (1-S(t))*exp(-dt/tauWake)
 *   asleep: S(t+dt) = S(t)*exp(-dt/tauSleep)
 *
 * This is NOT a reproduction of SAFTE, FAID, HSE FRI or a calibrated biomathematical
 * fatigue model. Coefficients are supplied by a named research hypothesis; none
 * are defaulted to values that could be mistaken for science-backed cutoffs.
 */

export type ImaSegmentState = 'AWAKE' | 'ASLEEP' | 'UNKNOWN';
export type ImaEvidenceSource = 'OBSERVED' | 'SELF_REPORTED' | 'ESTIMATED' | 'SCHEDULE_INFERRED' | 'MISSING';

export interface ImaTimelineSegment {
  /** RFC3339 UTC or explicit offset. Wall-clock timestamps without an offset are rejected. */
  startAt: string;
  endAt: string;
  state: ImaSegmentState;
  source: ImaEvidenceSource;
}

export interface ImaResearchHypothesis {
  id: string;
  /** Human-readable provenance; this is not regulatory approval. */
  provenance: string;
  wakeTauHours: number;
  sleepTauHours: number;
  homeostaticWeight: number;
  circadianWeight: number;
  /** Local-time circadian risk peak, hours in [0, 24). Not a per-person diagnosis. */
  circadianRiskPeakHour: number;
  /** Research history requirement, NOT an ANAC or IOGP legal limit. */
  minimumHistoryHours: number;
  /** Maximum sensitivity to unknown homeostatic initial state before showing a research number. */
  maximumInitialStateUncertainty: number;
}

export interface ImaShadowInput {
  /** No non-synthetic score is ever emitted, even with apparently complete data. */
  syntheticResearchFixture: boolean;
  segments: readonly ImaTimelineSegment[];
  /** Explicit local offset (minutes east of UTC) at the assessment instant. */
  assessmentUtcOffsetMinutes: number;
  hypothesis: ImaResearchHypothesis;
}

export type ImaShadowState =
  | 'INSUFFICIENT_DATA'
  | 'UNVALIDATED_NO_OPERATIONAL_INDEX'
  | 'SYNTHETIC_RESEARCH_ONLY';

export interface ImaShadowResult {
  state: ImaShadowState;
  /** Always null for actual operations; never appears on FRMS production surfaces. */
  researchCandidateIndex: number | null;
  /** Mathematical exposure components have no scientific cutoff in this implementation. */
  estimatedHomeostaticPressure: number | null;
  initialStateUncertainty: number | null;
  circadianBurden: number | null;
  historyHours: number;
  sleepEvidenceHours: number;
  unknownOrEstimatedHours: number;
  reasons: string[];
  approval: 'NOT_VALIDATED_NOT_FOR_DISPATCH';
  hypothesisId: string;
}

function requireParameter(condition: boolean, code: string): void {
  if (!condition) throw new Error(code);
}

function parseInstant(value: string): number {
  requireParameter(
    typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/i.test(value),
    'IMA_TIMESTAMP_MUST_INCLUDE_OFFSET',
  );
  const milliseconds = Date.parse(value);
  requireParameter(Number.isFinite(milliseconds), 'IMA_INVALID_TIMESTAMP');
  return milliseconds;
}

function validateHypothesis(h: ImaResearchHypothesis): void {
  requireParameter(
    typeof h.id === 'string' && h.id.trim().length > 0 &&
    typeof h.provenance === 'string' && h.provenance.trim().length > 0,
    'IMA_RESEARCH_PROVENANCE_REQUIRED',
  );
  requireParameter(
    Number.isFinite(h.wakeTauHours) && h.wakeTauHours > 0 &&
    Number.isFinite(h.sleepTauHours) && h.sleepTauHours > 0,
    'IMA_INVALID_HOMEOSTATIC_CONSTANTS',
  );
  requireParameter(
    Number.isFinite(h.homeostaticWeight) &&
    Number.isFinite(h.circadianWeight) &&
    h.homeostaticWeight >= 0 && h.circadianWeight >= 0 &&
    Math.abs(h.homeostaticWeight + h.circadianWeight - 1) < 1e-9,
    'IMA_INVALID_RESEARCH_WEIGHTS',
  );
  requireParameter(
    Number.isFinite(h.circadianRiskPeakHour) &&
    h.circadianRiskPeakHour >= 0 && h.circadianRiskPeakHour < 24,
    'IMA_INVALID_CIRCADIAN_PEAK',
  );
  requireParameter(
    Number.isFinite(h.minimumHistoryHours) &&
    h.minimumHistoryHours > 0 && h.minimumHistoryHours <= 24 * 31 &&
    Number.isFinite(h.maximumInitialStateUncertainty) &&
    h.maximumInitialStateUncertainty >= 0 && h.maximumInitialStateUncertainty <= 1,
    'IMA_INVALID_RESEARCH_HISTORY_REQUIREMENT',
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A deliberately bounded research model: the exact starting homeostatic
 * pressure is unknown, so propagate BOTH S(0)=0 and S(0)=1.
 * Numeric scenarios are withheld when their uncertainty remains too high.
 */
export function evaluateImaShadow(input: ImaShadowInput): ImaShadowResult {
  const h = input.hypothesis;
  validateHypothesis(h);
  requireParameter(
    Number.isInteger(input.assessmentUtcOffsetMinutes) &&
    input.assessmentUtcOffsetMinutes >= -720 &&
    input.assessmentUtcOffsetMinutes <= 840,
    'IMA_INVALID_LOCAL_UTC_OFFSET',
  );

  let start: number | null = null;
  let previousEnd: number | null = null;
  let lowPressure = 0;
  let highPressure = 1;
  let sleepEvidenceHours = 0;
  let unknownOrEstimatedHours = 0;
  const reasons: string[] = [];

  for (const segment of input.segments) {
    const segmentStart = parseInstant(segment.startAt);
    const segmentEnd = parseInstant(segment.endAt);
    requireParameter(segmentEnd > segmentStart, 'IMA_INVALID_INTERVAL');
    requireParameter(
      previousEnd === null || segmentStart >= previousEnd,
      'IMA_OVERLAPPING_OR_UNSORTED_INTERVALS',
    );
    if (start === null) start = segmentStart;
    if (previousEnd !== null && previousEnd < segmentStart) {
      unknownOrEstimatedHours += (segmentStart - previousEnd) / 3_600_000;
    }
    const hours = (segmentEnd - segmentStart) / 3_600_000;
    requireParameter(
      segment.state === 'AWAKE' || segment.state === 'ASLEEP' || segment.state === 'UNKNOWN',
      'IMA_INVALID_SEGMENT_STATE',
    );
    requireParameter(
      segment.source === 'OBSERVED' || segment.source === 'SELF_REPORTED' ||
      segment.source === 'ESTIMATED' || segment.source === 'SCHEDULE_INFERRED' ||
      segment.source === 'MISSING',
      'IMA_INVALID_EVIDENCE_SOURCE',
    );

    const usable = segment.state !== 'UNKNOWN' &&
      (segment.source === 'OBSERVED' || segment.source === 'SELF_REPORTED');

    if (!usable) {
      unknownOrEstimatedHours += hours;
    } else if (segment.state === 'ASLEEP') {
      const recovery = Math.exp(-hours / h.sleepTauHours);
      lowPressure *= recovery;
      highPressure *= recovery;
      sleepEvidenceHours += hours;
    } else {
      const accumulation = Math.exp(-hours / h.wakeTauHours);
      lowPressure = 1 - (1 - lowPressure) * accumulation;
      highPressure = 1 - (1 - highPressure) * accumulation;
    }
    previousEnd = segmentEnd;
  }

  const historyHours = start !== null && previousEnd !== null
    ? (previousEnd - start) / 3_600_000
    : 0;
  if (historyHours < h.minimumHistoryHours) reasons.push('HISTORICO_INSUFICIENTE');
  if (unknownOrEstimatedHours > 1e-9) reasons.push('INTERVALOS_DE_SONO_VIGILIA_NAO_CONFIRMADOS');
  if (sleepEvidenceHours === 0) reasons.push('SONO_NAO_DOCUMENTADO');
  if (input.segments.length === 0) reasons.push('SEM_CRONOLOGIA');
  // Recording only duty/standby or off-duty is not evidence of wake/sleep.
  const evidenceSufficient = reasons.length === 0;
  const uncertainty = evidenceSufficient ? clamp01(highPressure - lowPressure) : null;
  if (uncertainty != null && uncertainty > h.maximumInitialStateUncertainty) {
    reasons.push('ESTADO_INICIAL_INDETERMINADO');
  }

  const valid = reasons.length === 0;
  const shadowBase = {
    historyHours: round(historyHours),
    sleepEvidenceHours: round(sleepEvidenceHours),
    unknownOrEstimatedHours: round(unknownOrEstimatedHours),
    approval: 'NOT_VALIDATED_NOT_FOR_DISPATCH' as const,
    hypothesisId: h.id,
  };

  if (!valid || previousEnd === null) {
    return {
      ...shadowBase,
      state: 'INSUFFICIENT_DATA',
      researchCandidateIndex: null,
      estimatedHomeostaticPressure: null,
      initialStateUncertainty: uncertainty,
      circadianBurden: null,
      reasons,
    };
  }

  if (input.syntheticResearchFixture !== true) {
    return {
      ...shadowBase,
      state: 'UNVALIDATED_NO_OPERATIONAL_INDEX',
      researchCandidateIndex: null,
      estimatedHomeostaticPressure: null,
      initialStateUncertainty: round(uncertainty ?? 0),
      circadianBurden: null,
      reasons: ['MODELO_NAO_VALIDADO_PARA_OPERACAO'],
    };
  }

  const localMs = previousEnd + input.assessmentUtcOffsetMinutes * 60_000;
  const date = new Date(localMs);
  const localHour = date.getUTCHours() + date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3_600;
  const circadianBurden = clamp01(
    (1 + Math.cos((localHour - h.circadianRiskPeakHour) * Math.PI / 12)) / 2,
  );
  const pressure = clamp01((lowPressure + highPressure) / 2);
  // Linear map is a synthetic design hypothesis, not a validated scale.
  const candidate = round(100 * clamp01(
    1 - h.homeostaticWeight * pressure - h.circadianWeight * circadianBurden,
  ));

  return {
    ...shadowBase,
    state: 'SYNTHETIC_RESEARCH_ONLY',
    researchCandidateIndex: candidate,
    estimatedHomeostaticPressure: round(pressure),
    initialStateUncertainty: round(uncertainty ?? 0),
    circadianBurden: round(circadianBurden),
    reasons: ['PESOS_E_LIMIARES_PENDENTES_DE_CALIBRACAO'],
  };
}

export interface ImaOperationalEvidence {
  regulatory: 'COMPLIANT' | 'REVIEW_REQUIRED' | 'VIOLATION' | 'UNKNOWN';
  observedReadiness: 'PRESERVED' | 'ATTENTION' | 'OPERATIONAL_REVIEW' | 'BASELINE_BUILDING' | 'UNKNOWN';
  checkin: 'RECEIVED' | 'PENDING' | 'NOT_APPLICABLE' | 'UNKNOWN';
  estimatedEvidence: boolean;
  /** Intentionally not an input: candidate score cannot cancel safety holds. */
}

export interface ImaHumanDecisionCue {
  state: 'REGULATORY_HOLD' | 'IMMEDIATE_HUMAN_REVIEW' | 'EVIDENCE_REQUIRED' | 'HUMAN_DECISION_REQUIRED';
  reasons: string[];
  automaticallyCleared: false;
}

/** Independent of experimental numbers and legacy score. No automatic clearance. */
export function classifyImaDecisionCue(input: ImaOperationalEvidence): ImaHumanDecisionCue {
  const reasons: string[] = [];
  if (input.regulatory === 'VIOLATION') {
    return { state: 'REGULATORY_HOLD', reasons: ['LIMITE_VIOLADO'], automaticallyCleared: false };
  }
  if (input.observedReadiness === 'OPERATIONAL_REVIEW' ||
      input.regulatory === 'REVIEW_REQUIRED') {
    reasons.push('REVISAO_HUMANA_OBRIGATORIA');
  }
  if (input.observedReadiness === 'ATTENTION') reasons.push('SINAL_OBSERVADO_DE_ATENCAO');
  if (reasons.length > 0) {
    return { state: 'IMMEDIATE_HUMAN_REVIEW', reasons, automaticallyCleared: false };
  }
  if (input.regulatory === 'UNKNOWN') reasons.push('CONFORMIDADE_NAO_CONFIRMADA');
  if (input.observedReadiness === 'UNKNOWN' ||
      input.observedReadiness === 'BASELINE_BUILDING') reasons.push('PRONTIDAO_SEM_BASELINE_VALIDO');
  if (input.checkin === 'PENDING' || input.checkin === 'UNKNOWN') reasons.push('CHECKIN_PENDENTE_OU_DESCONHECIDO');
  if (input.estimatedEvidence) reasons.push('FONTES_ESTIMADAS');
  if (reasons.length > 0) {
    return { state: 'EVIDENCE_REQUIRED', reasons, automaticallyCleared: false };
  }
  return { state: 'HUMAN_DECISION_REQUIRED', reasons: ['SEM_LIBERACAO_AUTOMATICA'], automaticallyCleared: false };
}
