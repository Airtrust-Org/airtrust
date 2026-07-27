import {
  filterCompatibleCheckIds,
  filterCompatibleChecks,
  isCheckCompatibleWithAircraft,
} from '../checkCompatibility';

describe('checkCompatibility', () => {
  const checks = [
    { id: 1, codigo: 'FAP05.2-139' },
    { id: 2, codigo: 'FAP05.2-76' },
    { id: 3, codigo: 'FAP14' },
  ];

  it('accepts only model-compatible checks', () => {
    expect(isCheckCompatibleWithAircraft('FAP05.2-139', 'AW139')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP05.2-76', 'AW139')).toBe(false);
    expect(isCheckCompatibleWithAircraft('FAP14', 'AW139')).toBe(true);
  });

  it('filters visible checks by aircraft model', () => {
    expect(filterCompatibleChecks(checks, 'AW139').map((check) => check.codigo)).toEqual([
      'FAP05.2-139',
      'FAP14',
    ]);
  });

  it('filters selected ids by aircraft model and removes duplicates', () => {
    expect(filterCompatibleCheckIds([1, 2, 3, 3], checks, 'SK76')).toEqual([2, 3]);
  });

  it('matches SK76 codes whose suffix is the model name, not a literal "-76"', () => {
    // IFR-SK76 does not end in the literal substring "-76" (it ends in
    // "SK76"), but it still names the SK76 aircraft — regression test for
    // a bug where such codes fell through to the default (return true),
    // making them incorrectly appear as AW139-compatible too.
    expect(isCheckCompatibleWithAircraft('IFR-SK76', 'AW139')).toBe(false);
    expect(isCheckCompatibleWithAircraft('IFR-SK76', 'SK76')).toBe(true);
  });

  it('does not show SK76-only codes for AW139 models', () => {
    const checksComIfr = [...checks, { id: 4, codigo: 'IFR-SK76' }, { id: 5, codigo: 'IFR-139' }];
    expect(filterCompatibleChecks(checksComIfr, 'AW139').map((check) => check.codigo)).toEqual([
      'FAP05.2-139',
      'FAP14',
      'IFR-139',
    ]);
  });

  describe('the four canonical FAP06/IFR check qualifications', () => {
    it('FAP6-139 is AW139-only', () => {
      expect(isCheckCompatibleWithAircraft('FAP6-139', 'AW139')).toBe(true);
      expect(isCheckCompatibleWithAircraft('FAP6-139', 'SK76')).toBe(false);
    });

    it('IFR-139 is AW139-only', () => {
      expect(isCheckCompatibleWithAircraft('IFR-139', 'AW139')).toBe(true);
      expect(isCheckCompatibleWithAircraft('IFR-139', 'SK76')).toBe(false);
    });

    it('FAP06-76 is SK76-only', () => {
      expect(isCheckCompatibleWithAircraft('FAP06-76', 'SK76')).toBe(true);
      expect(isCheckCompatibleWithAircraft('FAP06-76', 'AW139')).toBe(false);
    });

    it('IFR-SK76 is SK76-only', () => {
      expect(isCheckCompatibleWithAircraft('IFR-SK76', 'SK76')).toBe(true);
      expect(isCheckCompatibleWithAircraft('IFR-SK76', 'AW139')).toBe(false);
    });
  });

  it('treats a code with no aircraft model given as compatible (documented rule: cannot restrict without a model to compare against)', () => {
    expect(isCheckCompatibleWithAircraft('FAP6-139', undefined)).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP6-139', '')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP6-139', null)).toBe(true);
  });

  it('treats a code with no recognizable aircraft-model suffix as aircraft-agnostic by design, not an unhandled gap', () => {
    // FAP14 (route check), FAP13 (examiner accreditation), FAP07
    // (flight instructor) are real qualifications from the source
    // documents that apply across every fleet — the permissive fallback
    // is intentional for these, not an oversight. Only codes recognized
    // as naming one specific aircraft (ending in 139/76/SK76) are ever
    // restricted; this is a documented, deliberate default, not silent
    // cross-aircraft leakage of the four FAP06/IFR codes themselves.
    expect(isCheckCompatibleWithAircraft('FAP14', 'AW139')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP14', 'SK76')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP13-EXAMINADOR', 'AW139')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP13-EXAMINADOR', 'SK76')).toBe(true);
  });
});
