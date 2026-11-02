import { describe, expect, it } from 'vitest';
import { evaluateFormativeNoExamContract } from '../../lib/lms/lms-scorm-formative-profile';

const slides = Array.from({ length: 6 }, (_, i) => `slide_${i + 1}`);
const manifest = (patch: Record<string, unknown> = {}) => ({
  content: { requiredSlides: slides },
  formative: { requiredActivities: ['slide_2', 'slide_4'], scored: false },
  assessment: { mode: 'NONE', requiredInteractions: [], scoringBySCORM: false, successStatus: 'completed' },
  completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1', passStatusFromSCORM: false, workerApprovalRequired: true },
  // Self-declared release fields are inert: they can neither grant nor deny the profile.
  release: { status: 'PRIVATE_CANDIDATE_INACTIVE_UPLOAD_ONLY_DO_NOT_ACTIVATE', functionalCertified: true, reviewed: true },
  ...patch,
});

describe('FORMATIVE_NO_EXAM_V1 static contract', () => {
  it('accepts a genuine no-exam formative manifest and counts slides/activities', () => {
    expect(evaluateFormativeNoExamContract(manifest())).toEqual({
      eligible: true, errors: [], requiredSlides: 6, requiredActivities: 2,
    });
  });

  it('ignores release.* claims in both directions (cannot fake an approval or an inactive marker)', () => {
    const noRelease = manifest(); delete (noRelease as Record<string, unknown>).release;
    expect(evaluateFormativeNoExamContract(noRelease).eligible).toBe(true);
    expect(evaluateFormativeNoExamContract(manifest()).eligible).toBe(true);
  });

  it.each([
    ['scored assessment', { assessment: { mode: 'SCORED', requiredInteractions: [], scoringBySCORM: false } }],
    ['SCORM scoring', { assessment: { mode: 'NONE', requiredInteractions: [], scoringBySCORM: true } }],
    ['required interactions', { assessment: { mode: 'NONE', requiredInteractions: ['q1'], scoringBySCORM: false } }],
    ['mastery score', { assessment: { mode: 'NONE', requiredInteractions: [], scoringBySCORM: false, masteryScore: 70 } }],
    ['failure status', { assessment: { mode: 'NONE', requiredInteractions: [], scoringBySCORM: false, failureStatus: 'failed' } }],
    ['pass status from SCORM', { completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1', passStatusFromSCORM: true, workerApprovalRequired: true } }],
    ['no worker approval', { completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1', passStatusFromSCORM: false, workerApprovalRequired: false } }],
    ['unknown strategy', { completion: { strategy: 'OTHER', passStatusFromSCORM: false, workerApprovalRequired: true } }],
    ['formative.scored true', { formative: { requiredActivities: ['slide_2'], scored: true } }],
    ['duplicate slides', { content: { requiredSlides: ['a', 'A'] }, formative: { requiredActivities: ['a'], scored: false } }],
    ['activity outside the deck', { formative: { requiredActivities: ['ghost'], scored: false } }],
    ['no activities', { formative: { requiredActivities: [], scored: false } }],
  ])('refuses %s', (_name, patch) => {
    const verdict = evaluateFormativeNoExamContract(manifest(patch));
    expect(verdict.eligible).toBe(false);
    expect(verdict.errors.length).toBeGreaterThan(0);
  });

  it('fails closed without a manifest', () => {
    expect(evaluateFormativeNoExamContract(null).eligible).toBe(false);
  });
});
