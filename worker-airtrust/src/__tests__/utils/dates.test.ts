import { describe, it, expect } from 'vitest';
import { parseFlexibleDate, isValidISODate, formatDateBR } from '../../utils/dates';

describe('Date Utils', () => {
  describe('parseFlexibleDate', () => {
    it('deve aceitar ISO (YYYY-MM-DD)', () => {
      expect(parseFlexibleDate('2025-11-26')).toBe('2025-11-26');
      expect(parseFlexibleDate('2000-01-01')).toBe('2000-01-01');
    });

    it('deve converter DD/MM/YYYY', () => {
      expect(parseFlexibleDate('26/11/2025')).toBe('2025-11-26');
      expect(parseFlexibleDate('01/01/2000')).toBe('2000-01-01');
      expect(parseFlexibleDate('15/03/2024')).toBe('2024-03-15');
    });

    it('deve converter DD/MM/YY (ano 2 dígitos)', () => {
      expect(parseFlexibleDate('26/11/25')).toBe('2025-11-26');
      expect(parseFlexibleDate('01/01/49')).toBe('2049-01-01'); // < 50 = 20XX
      expect(parseFlexibleDate('01/01/50')).toBe('1950-01-01'); // >= 50 = 19XX
      expect(parseFlexibleDate('31/12/99')).toBe('1999-12-31');
      expect(parseFlexibleDate('01/01/00')).toBe('2000-01-01');
    });

    it('deve converter D/M/YYYY (sem zeros)', () => {
      expect(parseFlexibleDate('5/3/2025')).toBe('2025-03-05');
      expect(parseFlexibleDate('25/1/2025')).toBe('2025-01-25');
      expect(parseFlexibleDate('1/1/2025')).toBe('2025-01-01');
    });

    it('deve converter Excel serial number', () => {
      expect(parseFlexibleDate(45623)).toBe('2024-11-27');
      expect(parseFlexibleDate(44562)).toBe('2022-01-01');
      expect(parseFlexibleDate(40179)).toBe('2010-01-01');
    });

    it('deve aceitar separador hífen', () => {
      expect(parseFlexibleDate('26-11-2025')).toBe('2025-11-26');
      expect(parseFlexibleDate('1-3-2025')).toBe('2025-03-01');
    });

    it('deve retornar null para valores inválidos', () => {
      expect(parseFlexibleDate(null)).toBeNull();
      expect(parseFlexibleDate('')).toBeNull();
      expect(parseFlexibleDate('abc')).toBeNull();
      expect(parseFlexibleDate('32/13/2025')).toBeNull(); // Mês inválido
      expect(parseFlexibleDate('31/02/2025')).toBeNull(); // Dia inválido para fevereiro
      expect(parseFlexibleDate('00/00/0000')).toBeNull();
      expect(parseFlexibleDate('99/99/9999')).toBeNull();
    });

    it('deve validar datas reais (não aceitar overflow)', () => {
      // 29/02/2024 é válido (ano bissexto)
      expect(parseFlexibleDate('29/02/2024')).toBe('2024-02-29');

      // 29/02/2025 é inválido (não é bissexto)
      expect(parseFlexibleDate('29/02/2025')).toBeNull();

      // 31/04 é inválido (abril tem 30 dias)
      expect(parseFlexibleDate('31/04/2025')).toBeNull();
    });
  });

  describe('isValidISODate', () => {
    it('deve validar datas ISO válidas', () => {
      expect(isValidISODate('2025-11-26')).toBe(true);
      expect(isValidISODate('2000-01-01')).toBe(true);
      expect(isValidISODate('1990-12-31')).toBe(true);
    });

    it('deve rejeitar formatos inválidos', () => {
      expect(isValidISODate('26/11/2025')).toBe(false); // DD/MM/YYYY
      expect(isValidISODate('2025-13-01')).toBe(false); // Mês inválido
      expect(isValidISODate('2025-11-32')).toBe(false); // Dia inválido
      expect(isValidISODate('abc')).toBe(false);
      expect(isValidISODate('')).toBe(false);
      expect(isValidISODate(null)).toBe(false);
    });
  });

  describe('formatDateBR', () => {
    it('deve formatar ISO para DD/MM/YYYY', () => {
      expect(formatDateBR('2025-11-26')).toBe('26/11/2025');
      expect(formatDateBR('2000-01-01')).toBe('01/01/2000');
      expect(formatDateBR('1990-12-31')).toBe('31/12/1990');
    });
  });
});
