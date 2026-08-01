export {
  getExaminerEventSessionDefinition,
  splitExaminerTechnicalBlocks,
  type CanonicalExaminerSessionCode,
  type ExaminerEventSessionCode,
  type LegacyExaminerEventSessionCode,
  type SpecialTechnicalBlockDefinition as ExaminerTechnicalBlockDefinition,
  type SpecialEventSessionDefinition as ExaminerEventSessionDefinition,
} from './special-event-sessions';

import {
  getExaminerEventSessionDefinition,
  type ExaminerEventSessionCode,
} from './special-event-sessions';

export function normalizeExaminerEventSessionCode(
  code: string | null | undefined,
): ExaminerEventSessionCode | null {
  const normalized = String(code || '').trim().toUpperCase();
  return getExaminerEventSessionDefinition(normalized)
    ? (normalized as ExaminerEventSessionCode)
    : null;
}
