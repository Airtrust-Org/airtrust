/**
 * F5 Score SCORM 1.2 study evidence verifier.
 * Read-only; the Worker is responsible for verifying the session, tenant,
 * package SHA/cycle and persisted status before calling this function.
 *
 * A successful STUDY receipt is NOT an exam result or a qualification.
 */
export type ScoreF5StudyEvidenceInput = Readonly<{
  cmiJson: string | null;
  expectedEdition: string;
  requiredSlideIds: readonly string[];
  requiredFormativeIndices: readonly number[];
  serverValidatedFinish: boolean;
  activePackageAndCycleVerified: boolean;
}>;
export type ScoreF5StudyEvidenceVerdict = Readonly<{
  code:
    | 'EDITION_UNVERIFIED' | 'FINISH_NOT_ATTESTED' | 'INVALID_MANIFEST'
    | 'MISSING_OR_INVALID_CMI' | 'STATE_EDITION_MISMATCH'
    | 'STUDY_END_MISSING' | 'REQUIRED_UNITS_MISSING'
    | 'FORMATIVE_INTERACTIONS_MISSING' | 'STUDY_READY_FOR_SERVER_RECEIPT';
  studyReady: boolean;
  completesEnrollment: false;
  grantsQualification: false;
}>;
const validIds = (v: readonly string[]): boolean =>
  Array.isArray(v) && v.length > 0 && v.length <= 1000 &&
  v.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256) &&
  new Set(v).size === v.length;

export function assessScoreF5StudyEvidence(
  input: ScoreF5StudyEvidenceInput,
): ScoreF5StudyEvidenceVerdict {
  const deny = (code: ScoreF5StudyEvidenceVerdict['code']): ScoreF5StudyEvidenceVerdict => ({
    code, studyReady: code === 'STUDY_READY_FOR_SERVER_RECEIPT',
    completesEnrollment: false, grantsQualification: false,
  });
  if (!input.activePackageAndCycleVerified) return deny('EDITION_UNVERIFIED');
  if (!input.serverValidatedFinish) return deny('FINISH_NOT_ATTESTED');
  if (typeof input.expectedEdition !== 'string' || input.expectedEdition.length < 1 ||
      input.expectedEdition.length > 200 || !validIds(input.requiredSlideIds) ||
      !Array.isArray(input.requiredFormativeIndices) ||
      new Set(input.requiredFormativeIndices).size !== input.requiredFormativeIndices.length ||
      !input.requiredFormativeIndices.every(i => Number.isSafeInteger(i) &&
        i >= 0 && i < input.requiredSlideIds.length)) return deny('INVALID_MANIFEST');

  let cmi: Record<string, unknown>;
  let state: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input.cmiJson || 'null');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return deny('MISSING_OR_INVALID_CMI');
    }
    cmi = parsed as Record<string, unknown>;
    const raw = cmi['cmi.suspend_data'];
    if (typeof raw !== 'string' || raw.length > 3900) return deny('MISSING_OR_INVALID_CMI');
    const inner: unknown = JSON.parse(raw);
    if (!inner || Array.isArray(inner) || typeof inner !== 'object') {
      return deny('MISSING_OR_INVALID_CMI');
    }
    state = inner as Record<string, unknown>;
  } catch {
    return deny('MISSING_OR_INVALID_CMI');
  }
  if (state.v !== 1 || state.p !== input.expectedEdition) {
    return deny('STATE_EDITION_MISMATCH');
  }
  // Score F5 intentionally persists SCORM 1.2 "incomplete", even after study
  // ends. A scored/passed status is not an authorized substitute for evidence.
  if (cmi['cmi.core.lesson_status'] !== 'incomplete' ||
      state.study !== true) return deny('STUDY_END_MISSING');
  const total = input.requiredSlideIds.length;
  const location = cmi['cmi.core.lesson_location'];
  if (location !== total + '/' + total) return deny('REQUIRED_UNITS_MISSING');
  function exactIndexSet(value: unknown): Set<number> | null {
    if (!Array.isArray(value) || !value.every((v: unknown) =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < total)) return null;
    const indexes = new Set(value as number[]);
    return indexes.size === value.length ? indexes : null;
  }
  const visited = exactIndexSet(state.d);
  if (!visited || visited.size !== total) return deny('REQUIRED_UNITS_MISSING');
  const fixed = exactIndexSet(state.f);
  if (!fixed || input.requiredFormativeIndices.some(i => !fixed.has(i))) {
    return deny('FORMATIVE_INTERACTIONS_MISSING');
  }
  return deny('STUDY_READY_FOR_SERVER_RECEIPT');
}
