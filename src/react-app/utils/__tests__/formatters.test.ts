/**
 * Tests for formatters utility
 */

import { describe, it, expect } from 'vitest';
import { formatters } from '../formatters';

describe('formatters', () => {
  describe('cpf', () => {
    it('deve formatar CPF corretamente', () => {
      expect(formatters.cpf('11144477735')).toBe('111.444.777-35');
    });

    it('deve retornar vazio para CPF nulo', () => {
      expect(formatters.cpf('')).toBe('');
      expect(formatters.cpf(null)).toBe('');
      expect(formatters.cpf(undefined)).toBe('');
    });
  });

  describe('phone', () => {
    it('deve formatar telefone 11 dígitos', () => {
      expect(formatters.phone('11999998888')).toBe('(11) 99999-8888');
    });

    it('deve formatar telefone 10 dígitos', () => {
      expect(formatters.phone('1133334444')).toBe('(11) 3333-4444');
    });

    it('deve retornar vazio para telefone nulo', () => {
      expect(formatters.phone('')).toBe('');
      expect(formatters.phone(null)).toBe('');
    });
  });

  describe('date', () => {
    it('deve formatar data em formato curto', () => {
      const result = formatters.date('2025-01-15');
      expect(result).toBe('15/01/2025');
    });

    it('deve formatar data em formato longo', () => {
      const result = formatters.date('2025-01-15', 'long');
      expect(result).toContain('15');
      expect(result).toContain('janeiro');
      expect(result).toContain('2025');
    });

    it('deve retornar vazio para data nula', () => {
      expect(formatters.date('')).toBe('');
      expect(formatters.date(null)).toBe('');
    });
  });

  describe('currency', () => {
    it('deve formatar moeda corretamente', () => {
      expect(formatters.currency(1000)).toBe('R$ 1.000,00');
    });

    it('deve formatar com centavos', () => {
      expect(formatters.currency(1000.5)).toContain('1.000');
    });

    it('deve retornar vazio para valor nulo', () => {
      expect(formatters.currency(null)).toBe('');
      expect(formatters.currency(undefined)).toBe('');
    });
  });

  describe('percentage', () => {
    it('deve formatar percentual', () => {
      const result = formatters.percentage(50);
      expect(result).toContain('50');
      expect(result).toContain('%');
    });

    it('deve converter decimal para percentual', () => {
      const result = formatters.percentage(0.5);
      expect(result).toContain('50');
    });
  });

  describe('matricula', () => {
    it('deve formatar matrícula corretamente', () => {
      expect(formatters.matricula('123')).toBe('MAT-000123');
    });

    it('deve retornar vazio para matrícula nula', () => {
      expect(formatters.matricula('')).toBe('');
      expect(formatters.matricula(null)).toBe('');
    });
  });

  describe('number', () => {
    it('deve formatar número com separadores', () => {
      expect(formatters.number(1000)).toBe('1.000');
    });

    it('deve incluir casas decimais', () => {
      expect(formatters.number(1000.5, 2)).toContain('1.000');
    });
  });

  describe('capitalize', () => {
    it('deve capitalizar string', () => {
      expect(formatters.capitalize('hello')).toBe('Hello');
    });

    it('deve retornar vazio para string nula', () => {
      expect(formatters.capitalize('')).toBe('');
      expect(formatters.capitalize(null)).toBe('');
    });
  });

  describe('fullName', () => {
    it('deve formatar nome completo', () => {
      expect(formatters.fullName('JOÃO SILVA')).toBe('João Silva');
    });

    it('deve capitalizar cada palavra', () => {
      expect(formatters.fullName('josé maria santos')).toBe('José Maria Santos');
    });
  });

  describe('truncate', () => {
    it('deve truncar string longa', () => {
      const result = formatters.truncate('hello world this is a very long string', 20);
      expect(result).toHaveLength(23); // 20 + '...'
      expect(result).toContain('...');
    });

    it('deve não truncar string curta', () => {
      expect(formatters.truncate('hello', 20)).toBe('hello');
    });
  });

  describe('boolean', () => {
    it('deve formatar true como Sim', () => {
      expect(formatters.boolean(true)).toBe('Sim');
    });

    it('deve formatar false como Não', () => {
      expect(formatters.boolean(false)).toBe('Não');
    });

    it('deve retornar hífen para nulo', () => {
      expect(formatters.boolean(null)).toBe('-');
      expect(formatters.boolean(undefined)).toBe('-');
    });
  });

  describe('status', () => {
    it('deve formatar status conhecido', () => {
      expect(formatters.status('active')).toBe('✅ Ativo');
      expect(formatters.status('expired')).toBe('⚠️ Vencido');
    });

    it('deve capitalizar status desconhecido', () => {
      expect(formatters.status('unknown')).toBe('Unknown');
    });
  });
});
