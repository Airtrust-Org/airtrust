import { describe, expect, it } from 'vitest';

import { canReconcilePersistedScormCompletion, resolveLmsDisplayProgress } from '../LmsPlayer';

describe('resolveLmsDisplayProgress', () => {
  it('keeps an incomplete SCORM enrollment at 99% even at its final location', () => {
    expect(resolveLmsDisplayProgress({
      completed: false,
      matriculaStatus: 'EM_ANDAMENTO',
      mergedProgress: 100,
    })).toBe(99);
  });

  it('shows 100% only after canonical completion', () => {
    expect(resolveLmsDisplayProgress({
      completed: false,
      matriculaStatus: 'CONCLUIDO',
      mergedProgress: 99,
    })).toBe(100);
  });
});

describe('server-verified SCORM completion recovery', () => {
  const diagnostic = {
    status: 'accepted',
    explicit_completion: true,
    reached_final_location: true,
    score_pct: 100,
    mastery_score: 70,
  };
  const base = {
    reviewMode: false,
    isScormContent: true,
    matriculaStatus: 'EM_ANDAMENTO',
    diagnostic,
  };
  it('can retry canonical finalization on a saved passed/100/41-of-41 enrollment', () => {
    expect(canReconcilePersistedScormCompletion(base)).toBe(true);
  });
  it('never retries a preview or an already finalized enrollment', () => {
    expect(canReconcilePersistedScormCompletion({ ...base, reviewMode: true })).toBe(false);
    expect(canReconcilePersistedScormCompletion({ ...base, matriculaStatus: 'CONCLUIDO' })).toBe(false);
  });
  it('rejects a score-only or final-location-only candidate', () => {
    expect(canReconcilePersistedScormCompletion({
      ...base, diagnostic: { ...diagnostic, explicit_completion: false },
    })).toBe(false);
    expect(canReconcilePersistedScormCompletion({
      ...base, diagnostic: { ...diagnostic, reached_final_location: false },
    })).toBe(false);
    expect(canReconcilePersistedScormCompletion({
      ...base, diagnostic: { ...diagnostic, status: 'candidate' },
    })).toBe(false);
    expect(canReconcilePersistedScormCompletion({
      ...base, diagnostic: { ...diagnostic, score_pct: 50 },
    })).toBe(false);
  });
});
