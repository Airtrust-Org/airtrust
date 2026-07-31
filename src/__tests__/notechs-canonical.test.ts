import { describe, expect, it } from 'vitest';
import {
  NOTECHS_CANONICAL_ITEMS,
  canonicalizeNotechsCode,
  legacyDescriptorCodeForNotechs,
} from '../shared/simuladores/notechs-canonical';

describe('NOTECHS canonical PTO Rev10 codes', () => {
  it('contains 15 ordered NTS codes with observable evidence', () => {
    expect(NOTECHS_CANONICAL_ITEMS).toHaveLength(15);
    expect(NOTECHS_CANONICAL_ITEMS.map((item) => item.ordem)).toEqual(
      Array.from({ length: 15 }, (_, index) => 1001 + index),
    );
    for (const item of NOTECHS_CANONICAL_ITEMS) {
      expect(item.codigo).toMatch(/^NTS-(TEM|LDR|WLM|SA|DEC)-\d{2}$/);
      expect(item.evidenciaObservavel.trim()).not.toBe('');
    }
  });

  it('normalizes every legacy NOTECHS family without changing canonical codes', () => {
    expect(canonicalizeNotechsCode('NOTECHS-COO-01')).toBe('NTS-TEM-01');
    expect(canonicalizeNotechsCode('NOTECHS-LID-08')).toBe('NTS-WLM-08');
    expect(canonicalizeNotechsCode('NOTECHS-CSA-11')).toBe('NTS-SA-11');
    expect(canonicalizeNotechsCode('NOTECHS-TMD-15')).toBe('NTS-DEC-15');
    expect(canonicalizeNotechsCode('nts-dec-15')).toBe('NTS-DEC-15');
    expect(legacyDescriptorCodeForNotechs('NTS-DEC-15')).toBe('NOTECHS-TMD-15');
  });
});
