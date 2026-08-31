import { describe, expect, it } from 'vitest';
import {
  classSequenceSuffix,
  nameSimulatorPlanningClasses,
} from '../../services/cae-planning-class-name';

describe('CAE planning class names', () => {
  it('uses equipment-year-month when there is a single class', () => {
    const [result] = nameSimulatorPlanningClasses([
      { id: 'one', equipment: 'SK76', reference_date: '2027-06-14' },
    ]);
    expect(result.class_name).toBe('SK76-2027.06');
  });

  it('adds A/B suffixes for two classes of the same equipment and month', () => {
    const result = nameSimulatorPlanningClasses([
      { id: 'late', equipment: 'S-76', reference_date: '2027-04-20' },
      { id: 'early', equipment: 'SK76', reference_date: '2027-04-05' },
    ]);
    expect(result.find((item) => item.id === 'early')?.class_name).toBe('SK76-2027.04A');
    expect(result.find((item) => item.id === 'late')?.class_name).toBe('SK76-2027.04B');
  });

  it('keeps equipment groups independent', () => {
    const result = nameSimulatorPlanningClasses([
      { id: 1, equipment: 'AW139', reference_date: '2027-04-10' },
      { id: 2, equipment: 'SK76', reference_date: '2027-04-10' },
    ]);
    expect(result.map((item) => item.class_name)).toEqual(['AW139-2027.04', 'SK76-2027.04']);
  });

  it('supports more than 26 classes without ambiguous suffixes', () => {
    expect(classSequenceSuffix(0)).toBe('A');
    expect(classSequenceSuffix(25)).toBe('Z');
    expect(classSequenceSuffix(26)).toBe('AA');
  });
});
