import { describe, expect, it } from 'vitest';
import { normalizeTimeInput, isValidTimeHHMM } from '@/react-app/lib/time-input';

describe('time-input', () => {
  it('normaliza entradas numéricas contínuas', () => {
    expect(normalizeTimeInput('0700')).toBe('07:00');
    expect(normalizeTimeInput('700')).toBe('07:00');
    expect(normalizeTimeInput('0730')).toBe('07:30');
    expect(normalizeTimeInput('1230')).toBe('12:30');
    expect(normalizeTimeInput('2359')).toBe('23:59');
    expect(normalizeTimeInput('0000')).toBe('00:00');
  });

  it('normaliza entradas com separador', () => {
    expect(normalizeTimeInput('7:30')).toBe('07:30');
    expect(normalizeTimeInput('07:30')).toBe('07:30');
    expect(normalizeTimeInput('07h00')).toBe('07:00');
    expect(normalizeTimeInput('7h30')).toBe('07:30');
  });

  it('rejeita entradas inválidas', () => {
    expect(normalizeTimeInput('2360')).toBeNull();
    expect(normalizeTimeInput('2400')).toBeNull();
    expect(normalizeTimeInput('9999')).toBeNull();
    expect(normalizeTimeInput('abcd')).toBeNull();
    expect(normalizeTimeInput('')).toBeNull();
  });

  it('valida padrão HH:mm final', () => {
    expect(isValidTimeHHMM('07:00')).toBe(true);
    expect(isValidTimeHHMM('23:59')).toBe(true);
    expect(isValidTimeHHMM('7:00')).toBe(false);
    expect(isValidTimeHHMM('24:00')).toBe(false);
    expect(isValidTimeHHMM('07:60')).toBe(false);
  });
});
