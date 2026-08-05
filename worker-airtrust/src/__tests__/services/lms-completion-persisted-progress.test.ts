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
});
