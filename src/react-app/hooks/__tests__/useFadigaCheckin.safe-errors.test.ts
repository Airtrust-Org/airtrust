import { describe, expect, it } from 'vitest';
import { safeFadigaVisibleErrorMessage } from '../useFadigaCheckin';

describe('flight fatigue visible errors', () => {
  it('never exposes technical backend details to the visible error message', () => {
    const technical = 'SQLITE_ERROR: no such column\n at worker.ts:418';

    const messages = [
      safeFadigaVisibleErrorMessage('team-checkins-load', technical),
      safeFadigaVisibleErrorMessage('daily-checkin-submit', technical),
    ];

    for (const message of messages) {
      expect(message).not.toContain('SQLITE');
      expect(message).not.toContain('worker.ts');
      expect(message).not.toContain('no such column');
      expect(message).toMatch(/^Não foi possível/);
    }
  });
});
