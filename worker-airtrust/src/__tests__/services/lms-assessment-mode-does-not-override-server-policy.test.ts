import { describe, expect, it } from 'vitest';
import { evaluateScormClosureReadiness } from '../../services/lms-matricula-runtime-domain';

/**
 * Release regression: an author-controlled completion manifest cannot turn a
 * server-owned SCORED enrollment into a no-exam qualification.
 *
 * See #1325 / #1661 and docs/lms/SCORE_F5_FINAL_ASSESSMENT_ROLLOUT.md.
 * An explicit, per-edition/tenant NO_FINAL_EXAM policy may be supported in a
 * future implementation; these fixtures deliberately provide NO such
 * backend-owned approval. A course ZIP claiming NONE or EXTERNAL is not it.
 *
 * Keep passing manifest in a variable: the current legacy readiness API does
 * not yet consume it, whereas the WIP manifest-aware adapter does. This test
 * therefore protects both versions of the API without requiring that WIP.
 */
type AuthoredMode = 'NONE' | 'EXTERNAL' | 'SCORM';

function forgedManifestOnlyReadiness(mode: AuthoredMode) {
  const authoredManifest = {
    coverage: {
      manifest_present: true as const,
      assessment_mode: mode,
      package_version: 'unapproved-authored-edition-1',
      required_total: 3,
      recorded: 3,
      verified: true,
      source: 'WRAPPER_LEDGER' as const,
    },
  };
  const input = {
    mode: 'commit' as const,
    commit: {
      lesson_status: 'completed',
      commit_event: 'SCORM_USER_FINALIZE',
    },
    wasCompleted: false,
    cmiJson: JSON.stringify({
      'cmi.core.lesson_location': '3/3',
      'airtrust.total_slides': 3,
      'airtrust.viewed_slides': [1, 2, 3],
    }),
    location: { current: 3, total: 3 },
    policy: 'SCORED' as const,
    masteryScore: 80,
    scorePct: null,
    manifest: authoredManifest,
  };
  return evaluateScormClosureReadiness(input);
}

describe('SCORM assessment modes cannot self-waive server-scoped examination policy', () => {
  it('EXTERNAL requires a Worker-verified exam outcome, even with full study coverage', () => {
    const result = forgedManifestOnlyReadiness('EXTERNAL');
    expect(result.eligible_for_server_verification).toBe(false);
    expect(result.assessment_verified).toBe(false);
    expect(result.code).not.toBe('SCORM_READY_FOR_SERVER_VERIFICATION');
  });

  it('NONE does not override an existing SCORED policy without an approved edition grant', () => {
    const result = forgedManifestOnlyReadiness('NONE');
    expect(result.eligible_for_server_verification).toBe(false);
    expect(result.assessment_verified).toBe(false);
    expect(result.code).not.toBe('SCORM_READY_FOR_SERVER_VERIFICATION');
  });

  it('a scored course cannot bypass its missing grade by providing complete navigation', () => {
    const result = forgedManifestOnlyReadiness('SCORM');
    expect(result.eligible_for_server_verification).toBe(false);
    expect(result.assessment_verified).toBe(false);
    expect(result.missing).toContain('assessment_score');
  });
});
