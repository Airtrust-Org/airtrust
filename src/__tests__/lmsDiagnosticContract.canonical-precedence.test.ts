/**
 * Fix 6 — canonical score/mastery outranks a stale granular snapshot.
 *
 * Mandatory regression (from the handoff):
 *   canonical  : score_pct=100, mastery_score=70, explicit_failure=false
 *   granular   : scoreRaw=68, masteryScore=70, passed=false   (stale)
 *   -> the UI MUST NOT show "nota abaixo do mínimo".
 *
 * Same principle for stale moduleResults: they cannot contradict a current
 * canonical decision that does not indicate failure.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveCompletionExplanation,
  type CanonicalCompletionDiagnosticLike,
  type LmsGranularDiagnostic,
} from '@/react-app/utils/lmsDiagnosticContract';

function granular(overrides: Partial<LmsGranularDiagnostic> = {}): LmsGranularDiagnostic {
  return {
    version: 1,
    courseId: 'curso-1',
    currentSlide: null,
    slides: { totalRequired: 10, completedRequired: 10, missing: [] },
    assessment: {
      required: true,
      completed: true,
      scoreRaw: 68,
      masteryScore: 70,
      passed: false,
      unanswered: [],
      incomplete: [],
    },
    moduleResults: [],
    packageStatus: { lessonStatus: 'incomplete', finishRequested: false },
    updatedAt: '2026-08-24T00:00:00Z',
    ...overrides,
  };
}

const canonicalPass: CanonicalCompletionDiagnosticLike = {
  status: 'accepted',
  code: null,
  can_finalize: false,
  explicit_failure: false,
  mastery_score: 70,
  score_pct: 100,
};

describe('resolveCompletionExplanation — canonical precedence over stale granular', () => {
  it('does not report a failing score when canonical 100/70 beats stale granular 68/passed=false', () => {
    const out = resolveCompletionExplanation({ canonical: canonicalPass, granular: granular() });
    expect(out.category).not.toBe('SCORE');
    expect(out.summary).not.toContain('abaixo do mínimo');
    expect(out.items.every((i) => i.category !== 'SCORE')).toBe(true);
  });

  it('ignores stale failing moduleResults when the canonical decision is non-failure', () => {
    const out = resolveCompletionExplanation({
      canonical: canonicalPass,
      granular: granular({
        moduleResults: [
          {
            module: { id: 'm1', index: 1, title: 'Hidráulica' },
            assessment: {
              required: true,
              completed: true,
              scoreRaw: 40,
              masteryScore: 70,
              passed: false,
            },
          },
        ],
      }),
    });
    expect(out.category).not.toBe('SCORE');
  });

  it('still surfaces a real failure when canonical itself says explicit_failure=true', () => {
    const out = resolveCompletionExplanation({
      canonical: { ...canonicalPass, explicit_failure: true, score_pct: 40 },
      granular: granular({ assessment: { ...granular().assessment, passed: false } }),
    });
    expect(out.category).toBe('SCORE');
  });

  it('falls back to granular score only when canonical has no score', () => {
    const out = resolveCompletionExplanation({
      canonical: { status: 'rejected', can_finalize: false, explicit_failure: null, score_pct: null, mastery_score: null },
      granular: granular(),
    });
    expect(out.category).toBe('SCORE');
    expect(out.items[0]?.label).toContain('68');
  });
});
