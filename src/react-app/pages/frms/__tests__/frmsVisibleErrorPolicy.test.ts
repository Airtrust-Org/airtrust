import { describe, expect, it } from 'vitest';
import { safeFrmsVisibleErrorMessage } from '../frmsVisibleErrorPolicy';

describe('frmsVisibleErrorPolicy', () => {
  it('never exposes backend technical details', () => {
    const technical = 'SQLITE_ERROR: no such column frms_config at worker.ts:812:4';
    const operations = [
      'config-save',
      'config-reprocess',
      'notification-save',
      'team-checkins-load',
      'daily-checkin-submit',
    ] as const;

    for (const operation of operations) {
      const message = safeFrmsVisibleErrorMessage(operation, technical);
      expect(message).not.toContain('SQLITE_ERROR');
      expect(message).not.toContain('worker.ts');
      expect(message).not.toContain('frms_config');
    }
  });
});
