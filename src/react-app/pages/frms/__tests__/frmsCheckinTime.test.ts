import { describe, expect, it } from 'vitest';
import { formatFrmsCheckinTime } from '../frmsCheckinTime';

describe('formatFrmsCheckinTime', () => {
  it('converte submitted_at SQLite UTC para horario de Brasilia', () => {
    expect(formatFrmsCheckinTime('2026-10-13 12:34:00')).toBe('09:34 (Brasília)');
  });
  it('aceita instante ISO com offset explicito e conserva o instante', () => {
    expect(formatFrmsCheckinTime('2026-10-13T09:34:00-03:00')).toBe('09:34 (Brasília)');
  });
  it('nao inventa hora local quando o instante e ausente ou sem fuso', () => {
    expect(formatFrmsCheckinTime(null)).toBeNull();
    expect(formatFrmsCheckinTime('2026-10-13T12:34:00')).toBeNull();
    expect(formatFrmsCheckinTime('12:34')).toBeNull();
  });
});
