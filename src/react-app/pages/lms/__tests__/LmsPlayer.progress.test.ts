import { describe, expect, it } from 'vitest';

import {
  buildScormPlayerSessionKey,
  canReconcilePersistedScormCompletion,
  shouldRefetchAfterScormSave,
  resolveLmsDisplayProgress,
  shouldRefreshMatriculaAfterScormSaveError,
  shouldShowScormClosureDetails,
  shouldVerifyCanonicalProgress,
} from '../LmsPlayer';

describe('SCORM player session identity', () => {
  const session = {
    matriculaId: 91,
    reviewMode: false,
    userId: 17,
    empresaId: 6,
    activeCycleId: 3,
    handoffId: null,
  };

  it('changes when the active enrollment cycle changes', () => {
    expect(buildScormPlayerSessionKey(session)).not.toBe(
      buildScormPlayerSessionKey({ ...session, activeCycleId: 4 }),
    );
  });

  it('keys the iframe by matrícula, review, user, tenant, cycle, and handoff only', () => {
    expect(buildScormPlayerSessionKey(session)).toBe('91:normal:17:6:3:none');
  });
});

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

describe('SCORM progress event reconciliation', () => {
  it('does not require a matrícula refetch for ordinary progress events', () => {
    expect(shouldVerifyCanonicalProgress(null)).toBe(false);
    expect(shouldVerifyCanonicalProgress('EM_ANDAMENTO')).toBe(false);
  });

  it('verifies the canonical matrícula only when progress reports completion', () => {
    expect(shouldVerifyCanonicalProgress('CONCLUIDO')).toBe(true);
  });

  it('refreshes the matrícula after a stale-cycle 409, not for ordinary save failures', () => {
    expect(shouldRefreshMatriculaAfterScormSaveError('http-409')).toBe(true);
    expect(shouldRefreshMatriculaAfterScormSaveError('network-error')).toBe(false);
    expect(shouldRefreshMatriculaAfterScormSaveError('http-500')).toBe(false);
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

  // Regressão: curso FORMATIVE sem prova interna (nota nula) mas com
  // scorm_mastery_score herdado de uma configuração SCORED antiga (70). A nota
  // ausente era lida como 0 e travava o encerramento no último slide.
  describe('FORMATIVE package without an internal score', () => {
    const formative = {
      ...base,
      assessmentPolicy: 'FORMATIVE' as const,
      diagnostic: { ...diagnostic, score_pct: null, mastery_score: 70 },
    };
    it('reconciles when the server accepted explicit completion at the final location', () => {
      expect(canReconcilePersistedScormCompletion(formative)).toBe(true);
    });
    it('still requires explicit completion, final location and an accepted diagnostic', () => {
      expect(canReconcilePersistedScormCompletion({
        ...formative, diagnostic: { ...formative.diagnostic, explicit_completion: false },
      })).toBe(false);
      expect(canReconcilePersistedScormCompletion({
        ...formative, diagnostic: { ...formative.diagnostic, reached_final_location: false },
      })).toBe(false);
      expect(canReconcilePersistedScormCompletion({
        ...formative, diagnostic: { ...formative.diagnostic, status: 'candidate' },
      })).toBe(false);
    });
    it('never relaxes the score rule for SCORED or unknown-policy courses', () => {
      for (const assessmentPolicy of ['SCORED', null, undefined] as const) {
        expect(canReconcilePersistedScormCompletion({
          ...formative, assessmentPolicy,
        })).toBe(false);
      }
    });
  });
});

describe('SCORM closure panel shows evidence only at the appropriate stage', () => {
  it('does not describe remaining slides as a server error on 14/70', () => {
    expect(shouldShowScormClosureDetails({
      completed: false, atFinalSlide: false,
      finalizationFailed: false, readyToVerify: false,
    })).toBe(false);
  });

  it('displays the full authoritative checklist at the end or on a failed finalization', () => {
    for (const state of [
      { completed: false, atFinalSlide: true, finalizationFailed: false, readyToVerify: false },
      { completed: false, atFinalSlide: false, finalizationFailed: true, readyToVerify: false },
      { completed: false, atFinalSlide: false, finalizationFailed: false, readyToVerify: true },
      { completed: true, atFinalSlide: false, finalizationFailed: false, readyToVerify: false },
      { completed: false, atFinalSlide: false, finalizationFailed: false, readyToVerify: false, lastStepReached: true },
    ]) expect(shouldShowScormClosureDetails(state)).toBe(true);
  });
});

describe('refetch after an acknowledged SCORM save', () => {
  const base = {
    serverSaved: true, reviewMode: false,
    viewedSlideCount: 16, recordedSlideCount: 16, location: '16/16',
  };
  it('refetches on the final slide even when no new slide was visited (final click)', () => {
    expect(shouldRefetchAfterScormSave(base)).toBe(true);
  });
  it('still refetches when new slide visits were recorded', () => {
    expect(shouldRefetchAfterScormSave({
      ...base, location: '7/16', viewedSlideCount: 7, recordedSlideCount: 6,
    })).toBe(true);
  });
  it('does not refetch on ordinary autosaves mid-course, unsaved events or review mode', () => {
    expect(shouldRefetchAfterScormSave({
      ...base, location: '7/16', viewedSlideCount: 6, recordedSlideCount: 6,
    })).toBe(false);
    expect(shouldRefetchAfterScormSave({ ...base, serverSaved: false })).toBe(false);
    expect(shouldRefetchAfterScormSave({ ...base, reviewMode: true })).toBe(false);
    expect(shouldRefetchAfterScormSave({ ...base, location: null, viewedSlideCount: null })).toBe(false);
  });
});
