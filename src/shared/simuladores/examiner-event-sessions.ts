export {
  getExaminerEventSessionDefinition,
  splitExaminerTechnicalBlocks,
  type ExaminerEventSessionCode,
  type SpecialTechnicalBlockDefinition as ExaminerTechnicalBlockDefinition,
  type SpecialEventSessionDefinition as ExaminerEventSessionDefinition,
} from './special-event-sessions';

import { getExaminerEventSessionDefinition } from './special-event-sessions';

export function normalizeExaminerEventSessionCode(
  code: string | null | undefined,
): 'EXA-E01' | 'EXA-E02' | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (getExaminerEventSessionDefinition(normalized)) {
    return normalized as 'EXA-E01' | 'EXA-E02';
  }
  return null;
}
