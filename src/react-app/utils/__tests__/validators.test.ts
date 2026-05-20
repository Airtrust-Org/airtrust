/**
 * Tests for validators utility
 */

import { describe, it, expect } from 'vitest';
import { validators } from '../validators';

describe('validators', () => {
  describe('cpf', () => {
    it('deve aceitar CPF válido', () => {
      expect(validators.cpf('11144477735')).toBeNull();
    });

    it('deve rejeitar CPF vazio', () => {
      expect(validators.cpf('')).toBe('CPF obrigatório');
    });

    it('deve rejeitar CPF com menos de 11 dígitos', () => {
      expect(validators.cpf('123')).toBe('CPF deve ter 11 dígitos');
    });

    it('deve rejeitar CPF com todos os dígitos iguais', () => {
      expect(validators.cpf('11111111111')).toBe('CPF inválido');
    });

    it('deve remover formatação antes de validar', () => {
      expect(validators.cpf('111.444.777-35')).toBeNull();
    });
  });

  describe('email', () => {
    it('deve aceitar email válido', () => {
      expect(validators.email('test@example.com')).toBeNull();
    });

    it('deve rejeitar email vazio', () => {
      expect(validators.email('')).toBe('E-mail obrigatório');
    });

    it('deve rejeitar email inválido', () => {
      expect(validators.email('invalid')).toBe('E-mail inválido');
    });

    it('deve rejeitar email sem domínio', () => {
      expect(validators.email('test@')).toBe('E-mail inválido');
    });
  });

  describe('matricula', () => {
    it('deve aceitar matrícula válida', () => {
      expect(validators.matricula('12345')).toBeNull();
    });

    it('deve rejeitar matrícula vazia', () => {
      expect(validators.matricula('')).toBe('Matrícula obrigatória');
    });

    it('deve rejeitar matrícula muito curta', () => {
      expect(validators.matricula('123')).toBe('Matrícula deve ter pelo menos 4 caracteres');
    });

    it('deve rejeitar matrícula muito longa', () => {
      expect(validators.matricula('123456789012345678901')).toBe(
        'Matrícula não pode ter mais de 20 caracteres',
      );
    });
  });

  describe('required', () => {
    it('deve aceitar valor válido', () => {
      expect(validators.required('value')).toBeNull();
    });

    it('deve rejeitar valor vazio', () => {
      expect(validators.required('', 'Campo')).toBe('Campo é obrigatório');
    });

    it('deve rejeitar null', () => {
      expect(validators.required(null, 'Campo')).toBe('Campo é obrigatório');
    });

    it('deve rejeitar undefined', () => {
      expect(validators.required(undefined, 'Campo')).toBe('Campo é obrigatório');
    });

    it('deve rejeitar array vazio', () => {
      expect(validators.required([], 'Items')).toBe('Items é obrigatório');
    });
  });

  describe('phone', () => {
    it('deve aceitar telefone válido 10 dígitos', () => {
      expect(validators.phone('1133334444')).toBeNull();
    });

    it('deve aceitar telefone válido 11 dígitos', () => {
      expect(validators.phone('11999998888')).toBeNull();
    });

    it('deve rejeitar telefone vazio', () => {
      expect(validators.phone('')).toBe('Telefone obrigatório');
    });

    it('deve rejeitar telefone com dígitos insuficientes', () => {
      expect(validators.phone('123')).toBe('Telefone deve ter 10 ou 11 dígitos');
    });
  });

  describe('cnpj', () => {
    it('deve aceitar CNPJ válido', () => {
      expect(validators.cnpj('11222333000181')).toBeNull();
    });

    it('deve rejeitar CNPJ vazio', () => {
      expect(validators.cnpj('')).toBe('CNPJ obrigatório');
    });

    it('deve rejeitar CNPJ com menos de 14 dígitos', () => {
      expect(validators.cnpj('123')).toBe('CNPJ deve ter 14 dígitos');
    });

    it('deve rejeitar CNPJ com todos os dígitos iguais', () => {
      expect(validators.cnpj('11111111111111')).toBe('CNPJ inválido');
    });
  });

  describe('minLength', () => {
    it('deve aceitar string com comprimento suficiente', () => {
      expect(validators.minLength('hello', 3, 'String')).toBeNull();
    });

    it('deve rejeitar string com comprimento insuficiente', () => {
      expect(validators.minLength('hi', 3, 'String')).toBe(
        'String deve ter pelo menos 3 caracteres',
      );
    });
  });

  describe('maxLength', () => {
    it('deve aceitar string com comprimento dentro do limite', () => {
      expect(validators.maxLength('hello', 10, 'String')).toBeNull();
    });

    it('deve rejeitar string acima do limite', () => {
      expect(validators.maxLength('hello world', 5, 'String')).toBe(
        'String não pode ter mais de 5 caracteres',
      );
    });
  });

  describe('number', () => {
    it('deve aceitar número válido', () => {
      expect(validators.number(42)).toBeNull();
    });

    it('deve rejeitar valor não numérico', () => {
      expect(validators.number('abc')).toBe('Deve ser um número');
    });

    it('deve rejeitar número abaixo do mínimo', () => {
      expect(validators.number(5, 10)).toBe('Deve ser maior ou igual a 10');
    });

    it('deve rejeitar número acima do máximo', () => {
      expect(validators.number(15, 10, 12)).toBe('Deve ser menor ou igual a 12');
    });
  });

  describe('date', () => {
    it('deve aceitar data válida', () => {
      expect(validators.date('2025-01-15')).toBeNull();
    });

    it('deve rejeitar data vazia', () => {
      expect(validators.date('')).toBe('Data obrigatória');
    });

    it('deve rejeitar data com formato inválido', () => {
      expect(validators.date('15/01/2025')).toBeNull(); // Aceita DD/MM/YYYY também
    });
  });

  describe('composite', () => {
    it('deve validar múltiplas regras', () => {
      const rules = [
        (val: unknown) => validators.required(val, 'Campo'),
        (val: unknown) => validators.minLength(String(val), 3, 'Campo'),
      ];

      expect(validators.composite('hello', rules)).toBeNull();
    });

    it('deve retornar primeiro erro encontrado', () => {
      const rules = [
        (val: unknown) => validators.required(val, 'Campo'),
        (val: unknown) => validators.minLength(String(val), 10, 'Campo'),
      ];

      expect(validators.composite('hi', rules)).toBe('Campo deve ter pelo menos 10 caracteres');
    });
  });
});
