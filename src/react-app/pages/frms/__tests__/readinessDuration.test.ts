import { describe, expect, it } from 'vitest';
import { PVTB_V2_PROTOCOL } from '../operationalReadiness';

describe('FRMS readiness duration', () => {
  it('keeps the check-in readiness test at one minute', () => {
    expect(PVTB_V2_PROTOCOL.defaultDurationMs).toBe(60_000);
  });
});
