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
});
