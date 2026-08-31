import { describe, expect, it } from 'vitest';
import { normalizeSimulatorRosterPolicy } from '../../routes/simuladores-planejamento-v2-config';

describe('simulator planning company roster policy', () => {
  it('accepts the three canonical company policies case-insensitively', () => {
    expect(normalizeSimulatorRosterPolicy('folga')).toBe('FOLGA');
    expect(normalizeSimulatorRosterPolicy(' TRABALHO ')).toBe('TRABALHO');
    expect(normalizeSimulatorRosterPolicy('ambas')).toBe('AMBAS');
  });

  it('rejects unknown or empty values', () => {
    expect(normalizeSimulatorRosterPolicy('fora')).toBeNull();
    expect(normalizeSimulatorRosterPolicy('')).toBeNull();
    expect(normalizeSimulatorRosterPolicy(null)).toBeNull();
  });
});
