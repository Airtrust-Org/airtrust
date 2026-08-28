import { describe, expect, it } from 'vitest';
import { hasPersistedCompletionProgressEvidence } from '../../middleware/lms-completion-persisted-progress';

describe('persisted LMS progress evidence', () => {
  it('rejects a missing progress row with zero enrollment progress', () => {
    expect(
      hasPersistedCompletionProgressEvidence({
        matricula_progresso_pct: 0,
        scorm_progress_id: null,
        cmi_json: null,
        xapi_count: 0,
      }),
    ).toBe(false);
  });

  it('does not treat an empty stored SCORM row as positive progress', () => {
    expect(
      hasPersistedCompletionProgressEvidence({
        matricula_progresso_pct: 0,
        scorm_progress_id: 42,
        cmi_json: '{}',
        xapi_count: 0,
      }),
    ).toBe(false);
  });

  it('accepts positive progress already persisted on the enrollment', () => {
    expect(
      hasPersistedCompletionProgressEvidence({
        matricula_progresso_pct: 25,
        scorm_progress_id: null,
        cmi_json: null,
        xapi_count: 0,
      }),
    ).toBe(true);
  });

  it('accepts stored SCORM location or a previous xAPI statement', () => {
    expect(
      hasPersistedCompletionProgressEvidence({
        matricula_progresso_pct: 0,
        scorm_progress_id: 42,
        cmi_json: JSON.stringify({ 'cmi.location': '2/10' }),
        xapi_count: 0,
      }),
    ).toBe(true);
    expect(
      hasPersistedCompletionProgressEvidence({
        matricula_progresso_pct: 0,
        scorm_progress_id: null,
        cmi_json: null,
        xapi_count: 1,
      }),
    ).toBe(true);
  });

  const withCmiJson = (cmi: unknown) =>
    hasPersistedCompletionProgressEvidence({
      matricula_progresso_pct: 0,
      scorm_progress_id: 7,
      cmi_json: typeof cmi === 'string' ? cmi : JSON.stringify(cmi),
      xapi_count: 0,
    });

  describe('RevLMS airtrust-scorm12-state schema', () => {
    it('accepts a coherent nested state (slideAtual/totalSlides/progresso)', () => {
      expect(
        withCmiJson({
          'cmi.core.lesson_location': '46',
          'airtrust-scorm12-state': { schema: 'airtrust-scorm12-state', slideAtual: 46, totalSlides: 47, progresso: 96 },
        }),
      ).toBe(true);
    });

    it('accepts the state when it is serialized inside cmi.suspend_data', () => {
      expect(
        withCmiJson({
          'cmi.core.lesson_location': '46',
          'cmi.suspend_data': JSON.stringify({ slideAtual: 46, totalSlides: 47, progresso: 96 }),
        }),
      ).toBe(true);
    });

    it('rejects a zeroed state (slideAtual=0, totalSlides=0)', () => {
      expect(withCmiJson({ 'airtrust-scorm12-state': { slideAtual: 0, totalSlides: 0 } })).toBe(false);
    });

    it('rejects an absurd state where slideAtual exceeds totalSlides', () => {
      expect(
        withCmiJson({ 'airtrust-scorm12-state': { slideAtual: 999, totalSlides: 47, progresso: 96 } }),
      ).toBe(false);
    });

    it('rejects a malformed state (NaN / negative / non-integer)', () => {
      expect(withCmiJson({ 'airtrust-scorm12-state': { slideAtual: 'x', totalSlides: 47 } })).toBe(false);
      expect(withCmiJson({ 'airtrust-scorm12-state': { slideAtual: -3, totalSlides: 47 } })).toBe(false);
      expect(withCmiJson({ 'airtrust-scorm12-state': { slideAtual: 1.5, totalSlides: 47 } })).toBe(false);
      expect(withCmiJson({ 'cmi.suspend_data': 'not-json-at-all' })).toBe(false);
    });

    it('does not treat a score of 100 with no navigation state as progress', () => {
      expect(
        withCmiJson({ 'cmi.core.score.raw': 100, 'cmi.core.lesson_status': 'passed' }),
      ).toBe(false);
    });

    it('still accepts the canonical NN/NN location and score-free empty state', () => {
      expect(withCmiJson({ 'cmi.location': '46/47' })).toBe(true);
      expect(withCmiJson({})).toBe(false);
    });
  });
});
