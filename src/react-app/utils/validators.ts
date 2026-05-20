/**
 * Validators - Centralized validation logic
 *
 * Elimina duplicação de validações em múltiplos componentes
 * Uso: import { validators } from '@/utils/validators'
 */

export const validators = {
  /**
   * Valida CPF
   * @param value CPF string (com ou sem formatação)
   * @returns Mensagem de erro ou null se válido
   */
  cpf: (value: string): string | null => {
    if (!value) return 'CPF obrigatório';

    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length !== 11) return 'CPF deve ter 11 dígitos';

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cleaned)) return 'CPF inválido';

    // Algoritmo de validação de CPF
    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cleaned.substring(i - 1, i)) * (11 - i);
    }

    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleaned.substring(9, 10))) return 'CPF inválido';

    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cleaned.substring(i - 1, i)) * (12 - i);
    }

    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleaned.substring(10, 11))) return 'CPF inválido';

    return null;
  },

  /**
   * Valida e-mail
   * @param value Email string
   * @returns Mensagem de erro ou null se válido
   */
  email: (value: string): string | null => {
    if (!value) return 'E-mail obrigatório';

    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) return 'E-mail inválido';

    return null;
  },

  /**
   * Valida matrícula
   * @param value Matrícula string
   * @returns Mensagem de erro ou null se válido
   */
  matricula: (value: string): string | null => {
    if (!value) return 'Matrícula obrigatória';
    if (value.trim().length === 0) return 'Matrícula obrigatória';
    if (value.length < 4) return 'Matrícula deve ter pelo menos 4 caracteres';
    if (value.length > 20) return 'Matrícula não pode ter mais de 20 caracteres';

    return null;
  },

  /**
   * Valida campo obrigatório
   * @param value Valor do campo
   * @param fieldName Nome do campo (para mensagem)
   * @returns Mensagem de erro ou null se válido
   */
  required: (value: unknown, fieldName: string = 'Campo'): string | null => {
    if (value === null || value === undefined) {
      return `${fieldName} é obrigatório`;
    }

    if (typeof value === 'string' && value.trim() === '') {
      return `${fieldName} é obrigatório`;
    }

    if (Array.isArray(value) && value.length === 0) {
      return `${fieldName} é obrigatório`;
    }

    return null;
  },

  /**
   * Valida telefone
   * @param value Telefone string (com ou sem formatação)
   * @returns Mensagem de erro ou null se válido
   */
  phone: (value: string): string | null => {
    if (!value) return 'Telefone obrigatório';

    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length !== 10 && cleaned.length !== 11) {
      return 'Telefone deve ter 10 ou 11 dígitos';
    }

    return null;
  },

  /**
   * Valida CNPJ
   * @param value CNPJ string (com ou sem formatação)
   * @returns Mensagem de erro ou null se válido
   */
  cnpj: (value: string): string | null => {
    if (!value) return 'CNPJ obrigatório';

    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length !== 14) return 'CNPJ deve ter 14 dígitos';

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{13}$/.test(cleaned)) return 'CNPJ inválido';

    // Algoritmo de validação de CNPJ
    let size = cleaned.length - 2;
    let numbers = cleaned.substring(0, size);
    const digits = cleaned.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += Number(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return 'CNPJ inválido';

    size = size + 1;
    numbers = cleaned.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += Number(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) return 'CNPJ inválido';

    return null;
  },

  /**
   * Valida URL
   * @param value URL string
   * @returns Mensagem de erro ou null se válido
   */
  url: (value: string): string | null => {
    if (!value) return 'URL obrigatória';

    try {
      new URL(value);
      return null;
    } catch {
      return 'URL inválida';
    }
  },

  /**
   * Valida comprimento mínimo
   * @param value Valor string
   * @param min Comprimento mínimo
   * @param fieldName Nome do campo
   * @returns Mensagem de erro ou null se válido
   */
  minLength: (value: string, min: number, fieldName: string = 'Campo'): string | null => {
    if (!value) return null;
    if (value.length < min) {
      return `${fieldName} deve ter pelo menos ${min} caracteres`;
    }
    return null;
  },

  /**
   * Valida comprimento máximo
   * @param value Valor string
   * @param max Comprimento máximo
   * @param fieldName Nome do campo
   * @returns Mensagem de erro ou null se válido
   */
  maxLength: (value: string, max: number, fieldName: string = 'Campo'): string | null => {
    if (!value) return null;
    if (value.length > max) {
      return `${fieldName} não pode ter mais de ${max} caracteres`;
    }
    return null;
  },

  /**
   * Valida data válida
   * @param value Data string (YYYY-MM-DD ou DD/MM/YYYY)
   * @returns Mensagem de erro ou null se válido
   */
  date: (value: string): string | null => {
    if (!value) return 'Data obrigatória';

    // Aceita tanto YYYY-MM-DD quanto DD/MM/YYYY
    const isoFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const brFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(value);

    if (!isoFormat && !brFormat) return 'Formato de data inválido';

    // Parse da data dependendo do formato
    let date: Date;
    if (isoFormat) {
      date = new Date(value);
    } else {
      // Converter DD/MM/YYYY para Date
      const [day, month, year] = value.split('/');
      date = new Date(`${year}-${month}-${day}`);
    }

    if (isNaN(date.getTime())) return 'Data inválida';

    return null;
  },

  /**
   * Valida data no futuro
   * @param value Data string
   * @returns Mensagem de erro ou null se válido
   */
  futureDate: (value: string): string | null => {
    const dateError = validators.date(value);
    if (dateError) return dateError;

    const date = new Date(value);
    if (date <= new Date()) return 'Data deve ser no futuro';

    return null;
  },

  /**
   * Valida data no passado
   * @param value Data string
   * @returns Mensagem de erro ou null se válido
   */
  pastDate: (value: string): string | null => {
    const dateError = validators.date(value);
    if (dateError) return dateError;

    const date = new Date(value);
    if (date >= new Date()) return 'Data deve ser no passado';

    return null;
  },

  /**
   * Valida número
   * @param value Valor
   * @param min Valor mínimo (opcional)
   * @param max Valor máximo (opcional)
   * @returns Mensagem de erro ou null se válido
   */
  number: (value: unknown, min?: number, max?: number): string | null => {
    const num = Number(value);
    if (isNaN(num)) return 'Deve ser um número';

    if (min !== undefined && num < min) {
      return `Deve ser maior ou igual a ${min}`;
    }

    if (max !== undefined && num > max) {
      return `Deve ser menor ou igual a ${max}`;
    }

    return null;
  },

  /**
   * Valida múltiplas regras
   * @param value Valor
   * @param rules Array de validadores
   * @returns Primeira mensagem de erro ou null se válido
   */
  composite: (value: unknown, rules: Array<(val: unknown) => string | null>): string | null => {
    for (const rule of rules) {
      const error = rule(value);
      if (error) return error;
    }
    return null;
  },
};

export default validators;
