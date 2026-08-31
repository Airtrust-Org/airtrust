import { describe, expect, it } from 'vitest';
import { READINESS_PROTOCOL } from '../../lib/frms/readiness';

describe('FRMS readiness duration', () => {
  it('accepts the one-minute operational sampling window', () => {
    expect(READINESS_PROTOCOL.defaultDurationMs).toBe(60_000);
  });
});
