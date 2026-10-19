/**
 * Browser-specific authenticated staging identities for Player 3 acceptance.
 * Synthetic journeys MUST NOT use one shared login for both browser projects:
 * Native enrollment admission is scoped to the authenticated learner.
 * This selector never reads, logs or creates credentials.
 */
import { resolve } from 'node:path';
import { requireQa, type QaContentMode } from './fixture-contract';

export function selectQaStorageState(
  project: string, mode: QaContentMode,
  values: Readonly<Record<string, string | undefined>>,
): string {
  requireQa(project === 'chromium' || project === 'webkit',
    'QA_BROWSER_PROJECT_UNKNOWN');
  const chromium = values.PLAYER3_QA_STORAGE_STATE_CHROMIUM?.trim() ?? '';
  const webkit = values.PLAYER3_QA_STORAGE_STATE_WEBKIT?.trim() ?? '';
  if (mode === 'SYNTHETIC_TECHNICAL') {
    requireQa(chromium.length > 0 && webkit.length > 0,
      'SYNTHETIC_QA_TWO_BROWSER_IDENTITIES_REQUIRED');
    requireQa(resolve(chromium) !== resolve(webkit),
      'SYNTHETIC_QA_SHARED_AUTH_STATE_FORBIDDEN');
    return resolve(project === 'chromium' ? chromium : webkit);
  }
  requireQa(mode === 'AUTHORED_RC81', 'QA_CONTENT_MODE');
  const state = (project === 'chromium' ? chromium : webkit) ||
    values.PLAYER3_QA_STORAGE_STATE?.trim();
  requireQa(state, 'AUTHORIZED_LEARNER_STORAGE_STATE');
  return resolve(state);
}
