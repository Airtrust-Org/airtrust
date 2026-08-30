import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { safeFrmsOperationalRequestError } from '../useFrmsOperationalAccess';

describe('FRMS maintenance operational errors', () => {
  it('returns only operational messages for every visible request kind', () => {
    const messages = [
      safeFrmsOperationalRequestError('access'),
      safeFrmsOperationalRequestError('maintenance-team'),
      safeFrmsOperationalRequestError('maintenance-checkin'),
    ];

    for (const message of messages) {
      expect(message).not.toContain('SQLITE');
      expect(message).not.toContain('worker.ts');
      expect(message).toMatch(/Não foi possível/);
    }
  });

  it('keeps maintenance GET/POST failures behind the safe policy', () => {
    const source = readFileSync(new URL('../useFrmsOperationalAccess.ts', import.meta.url), 'utf8');
    expect(source).toContain("getEndpoint<FrmsMaintenanceTeam>(");
    expect(source).toContain("'maintenance-team'");
    expect(source).toContain("postEndpoint<FrmsMaintenanceCheckinResult>(");
    expect(source).toContain("'maintenance-checkin'");
    expect(source).toContain('throw new Error(safeFrmsOperationalRequestError(kind))');
  });
});
