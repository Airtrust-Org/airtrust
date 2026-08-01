import { describe, expect, it } from 'vitest';

import { classifyExistingPtoRev10Import } from '../../../scripts/apply-simuladores-pto-rev10-import.mjs';

describe('PTO Rev10 import idempotency', () => {
  it('allows the same completed import to be recognized before fingerprint checks', () => {
    expect(
      classifyExistingPtoRev10Import(
        { status: 'APPLIED', plan_sha256: 'same-plan' },
        'same-plan',
      ),
    ).toBe('IDEMPOTENT_APPLIED');
  });

  it('rejects reuse of the UUID for another plan or a non-terminal attempt', () => {
    expect(
      classifyExistingPtoRev10Import(
        { status: 'APPLIED', plan_sha256: 'old-plan' },
        'new-plan',
      ),
    ).toBe('CONFLICT');
    expect(
      classifyExistingPtoRev10Import(
        { status: 'APPLYING', plan_sha256: 'same-plan' },
        'same-plan',
      ),
    ).toBe('CONFLICT');
  });

  it('classifies an unused UUID as a new import', () => {
    expect(classifyExistingPtoRev10Import(undefined, 'plan')).toBe('NEW');
  });
});
