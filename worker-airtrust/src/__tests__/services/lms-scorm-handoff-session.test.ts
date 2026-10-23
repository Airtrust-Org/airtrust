import { describe, expect, it } from 'vitest';
import { isScormHandoffSessionCurrent } from '../../services/lms-scorm-handoff-session';

const check = (
  claimedCycleId: number,
  claimedHandoffId: number,
  activeCycleId = 17,
  activeHandoffId: number | null = null,
) => isScormHandoffSessionCurrent({
  claimedCycleId, claimedHandoffId, activeCycleId, activeHandoffId,
});

describe('SCORM handoff asset-session binding', () => {
  it('accepts a new cycle-scoped session before an edition handoff', () => {
    expect(check(17, 0)).toBe(true);
    expect(check(18, 0, 18)).toBe(true);
  });

  it('invalidates legacy sessions with no cycle claim even without a handoff receipt', () => {
    expect(check(0, 0)).toBe(false);
    expect(check(0, 0, 18)).toBe(false);
  });

  it('rejects sessions from another cycle before or after handoff', () => {
    expect(check(16, 0)).toBe(false);
    expect(check(17, 0, 18)).toBe(false);
    expect(check(16, 200, 17, 200)).toBe(false);
    expect(check(18, 200, 17, 200)).toBe(false);
  });

  it('rejects old sessions once the active cycle has a handoff receipt', () => {
    expect(check(17, 0, 17, 200)).toBe(false);
    expect(check(17, 199, 17, 200)).toBe(false);
    expect(check(17, 200, 17, 200)).toBe(true);
  });

  it('does not accept forged invalid scope IDs or receipts', () => {
    for (const invalid of [-1, 0, 17.5, NaN, Infinity]) {
      expect(check(invalid, 0)).toBe(false);
    }
    for (const invalid of [-1, 1.5, NaN, Infinity]) {
      expect(check(17, invalid)).toBe(false);
    }
    expect(check(17, 201)).toBe(false);
    expect(check(17, 200, 0, 200)).toBe(false);
    expect(check(17, 200, 17, -1)).toBe(false);
    expect(check(17, 200, 17, NaN)).toBe(false);
    expect(check(17, 200, 17, 0)).toBe(false);
  });
});
