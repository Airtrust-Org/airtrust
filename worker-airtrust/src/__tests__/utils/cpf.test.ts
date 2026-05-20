import { describe, it, expect } from 'vitest';
import { normalizeCPF, isValidCPF, formatCPF } from '../../utils/cpf';

describe('CPF Utils', () => {
  describe('normalizeCPF', () => {
    it('deve remover pontuação', () => {
      expect(normalizeCPF('012.345.678-90')).toBe('01234567890');
    });

    it('deve completar com zeros à esquerda', () => {
      // "12345678-90" tem 10 dígitos, vira "0012345678" (11 dígitos)
      // Mas o normalizeCPF remove tudo que não é dígito primeiro: "1234567890"
      // Depois pad para 11: "01234567890"
      expect(normalizeCPF('12345678-90')).toBe('01234567890');
      expect(normalizeCPF('1234567890')).toBe('01234567890');
    });

    it('deve aceitar número como input', () => {
      expect(normalizeCPF(1234567890)).toBe('01234567890');
    });

    it('deve aceitar CPF já normalizado', () => {
      expect(normalizeCPF('01234567890')).toBe('01234567890');
    });

    it('deve retornar string vazia para valores inválidos', () => {
      expect(normalizeCPF('')).toBe('');
      expect(normalizeCPF(null as any)).toBe('');
      expect(normalizeCPF(undefined as any)).toBe('');
    });
  });

  describe('isValidCPF', () => {
    const validCPFs = [
      '012.345.678-90',
      '123.456.789-09',
      '111.444.777-35',
      '01234567890', // Sem máscara
      1234567890, // Número
    ];

    const invalidCPFs = [
      '000.000.000-00', // Sequência
      '111.111.111-11', // Sequência
      '222.222.222-22', // Sequência
      '123.456.789-00', // Dígitos errados
      '012.345.678-99', // Dígitos errados
      '123', // Muito curto
      'abc.def.ghi-jk', // Letras
    ];

    validCPFs.forEach((cpf) => {
      it(`deve validar CPF válido: ${cpf}`, () => {
        expect(isValidCPF(cpf as any)).toBe(true);
      });
    });

    invalidCPFs.forEach((cpf) => {
      it(`deve rejeitar CPF inválido: ${cpf}`, () => {
        expect(isValidCPF(cpf as any)).toBe(false);
      });
    });
  });

  describe('formatCPF', () => {
    it('deve formatar CPF normalizado', () => {
      expect(formatCPF('01234567890')).toBe('012.345.678-90');
    });

    it('deve formatar CPF já com pontuação', () => {
      expect(formatCPF('012.345.678-90')).toBe('012.345.678-90');
    });

    it('deve formatar qualquer input (sempre normaliza)', () => {
      // formatCPF sempre normaliza primeiro, então SEMPRE terá 11 dígitos
      // "abc" → remove não-dígitos → "" → pad → "00000000000" → formata
      expect(formatCPF('abc')).toBe('000.000.000-00');
      // "123" → "123" → pad → "00000000123" → formata
      expect(formatCPF('123')).toBe('000.000.001-23');
    });

    it('deve normalizar antes de formatar', () => {
      expect(formatCPF('1234567890')).toBe('012.345.678-90');
    });
  });
});
