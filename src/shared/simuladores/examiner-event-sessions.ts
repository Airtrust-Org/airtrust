export {
  getExaminerEventSessionDefinition,
  splitExaminerTechnicalBlocks,
  type CanonicalExaminerSessionCode,
  type LegacyExaminerEventSessionCode,
  type SpecialTechnicalBlockDefinition as ExaminerTechnicalBlockDefinition,
  type SpecialEventSessionDefinition as ExaminerEventSessionDefinition,
} from './special-event-sessions';

import {
  getExaminerEventSessionDefinition,
  type CanonicalExaminerSessionCode,
  type LegacyExaminerEventSessionCode,
} from './special-event-sessions';

/**
 * Backward-compatible identity used by the two-event shared-session UI.
 *
 * The PTO Rev10 four-part curricular codes are represented separately by
 * CanonicalExaminerSessionCode. Keeping this alias narrow prevents historical
 * EXA-E01/EXA-E02 maps from being indexed with the new four-part identities.
 */
export type ExaminerEventSessionCode = LegacyExaminerEventSessionCode;

/** Every examiner session identity recognized for current or historical data. */
export type AnyExaminerEventSessionCode =
  | CanonicalExaminerSessionCode
  | LegacyExaminerEventSessionCode;

export function normalizeExaminerEventSessionCode(
  code: string | null | undefined,
): AnyExaminerEventSessionCode | null {
  const normalized = String(code || '').trim().toUpperCase();
  return getExaminerEventSessionDefinition(normalized)
    ? (normalized as AnyExaminerEventSessionCode)
    : null;
}
