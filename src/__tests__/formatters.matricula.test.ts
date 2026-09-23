import { describe, expect, it } from 'vitest';
import { formatarMatricula } from '../utils/formatters';

describe('formatarMatricula', () => {
  it('uses the five-digit employee registration contract', () => {
    expect(formatarMatricula('300')).toBe('00300');
    expect(formatarMatricula('15')).toBe('00015');
  });
});
