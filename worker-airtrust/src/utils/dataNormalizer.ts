/**
 * DATA NORMALIZER
 *
 * Módulo para normalização inteligente de dados de importação.
 * Reconhece e padroniza automaticamente diversos formatos:
 * - Datas (vários formatos BR e ISO)
 * - CPF (com ou sem máscara)
 * - Telefones
 * - CEP
 * - Números decimais (vírgula/ponto)
 * - Booleanos (sim/não, true/false, 1/0)
 * - Códigos (uppercase, sem espaços)
 *
 * Uso:
 * ```typescript
 * const normalized = normalizeValue('12/03/2024', 'data_nascimento');
 * // → '2024-03-12' (ISO date)
 *
 * const cpf = normalizeValue('123.456.789-00', 'cpf');
 * // → '12345678900' (apenas números)
 * ```
 */

// ===== TIPOS =====

export type FieldType =
  | 'cpf'
  | 'cnpj'
  | 'telefone'
  | 'cep'
  | 'email'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'number'
  | 'decimal'
  | 'codigo'
  | 'uppercase'
  | 'text';

export interface NormalizationRule {
  fieldPattern: RegExp; // Regex para match do nome do campo
  type: FieldType;
  transform: (value: string) => string | number | boolean | null;
}

// ===== REGRAS DE NORMALIZAÇÃO =====

const NORMALIZATION_RULES: NormalizationRule[] = [
  // CPF
  {
    fieldPattern: /^(funcionario_)?cpf$/i,
    type: 'cpf',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      // Remove tudo que não é dígito
      const digits = value.replace(/\D/g, '');
      if (digits.length !== 11) return null;
      return digits;
    },
  },

  // CNPJ
  {
    fieldPattern: /^cnpj$/i,
    type: 'cnpj',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      const digits = value.replace(/\D/g, '');
      if (digits.length !== 14) return null;
      return digits;
    },
  },

  // Telefone
  {
    fieldPattern: /^(telefone|celular|fone|contato)$/i,
    type: 'telefone',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      const digits = value.replace(/\D/g, '');
      // Aceita 10 ou 11 dígitos (com ou sem 9)
      if (digits.length < 10 || digits.length > 11) return null;
      return digits;
    },
  },

  // CEP
  {
    fieldPattern: /^cep$/i,
    type: 'cep',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      const digits = value.replace(/\D/g, '');
      if (digits.length !== 8) return null;
      return digits;
    },
  },

  // Email
  {
    fieldPattern: /^e?mail$/i,
    type: 'email',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      const trimmed = value.trim().toLowerCase();
      // Validação básica de email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
      return trimmed;
    },
  },

  // Datas (vários formatos)
  {
    fieldPattern:
      /^(data_|dt_|date_)?[a-z_]*(data|nascimento|admissao|conclusao|vencimento|validade|obtencao)$/i,
    type: 'date',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      return normalizeDate(value);
    },
  },

  // Boolean (sim/não, true/false, 1/0)
  {
    fieldPattern: /^(is_|ativo|obrigatorio|aprovado|lida|aceito|revogado)$/i,
    type: 'boolean',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      const normalized = value.trim().toLowerCase();
      if (['sim', 's', 'yes', 'y', 'true', '1', 'verdadeiro'].includes(normalized)) return true;
      if (['não', 'nao', 'n', 'no', 'false', '0', 'falso'].includes(normalized)) return false;
      return null;
    },
  },

  // Números decimais (nota, valor, etc)
  {
    fieldPattern: /^(nota|valor|preco|salario|peso|altura)$/i,
    type: 'decimal',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      // Substitui vírgula por ponto
      const normalized = value.trim().replace(',', '.');
      const parsed = parseFloat(normalized);
      if (isNaN(parsed)) return null;
      return parsed;
    },
  },

  // Números inteiros (idade, quantidade, carga_horaria)
  {
    fieldPattern: /^(idade|quantidade|qtd|numero|carga_horaria|duracao|validade_meses)$/i,
    type: 'number',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      const parsed = parseInt(value.trim().replace(/\D/g, ''));
      if (isNaN(parsed)) return null;
      return parsed;
    },
  },

  // Códigos (uppercase, sem espaços, sem acentos)
  {
    fieldPattern: /^(codigo|code|qualificacao_codigo|tipo_codigo|matricula)$/i,
    type: 'codigo',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      return value
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, '_'); // Substitui espaços por underscore
    },
  },

  // Uppercase (nomes próprios, categorias)
  {
    fieldPattern: /^(categoria|tipo|status|modalidade|funcao|cargo|setor)$/i,
    type: 'uppercase',
    transform: (value: string) => {
      if (!value || value.trim() === '') return null;
      return value.trim().toUpperCase();
    },
  },
];

// ===== FUNÇÕES AUXILIARES =====

/**
 * Normaliza datas de diversos formatos para ISO (YYYY-MM-DD)
 */
function normalizeDate(value: string): string | null {
  if (!value || value.trim() === '') return null;

  const trimmed = value.trim();

  // Já está em ISO (YYYY-MM-DD ou YYYY/MM/DD)
  if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10).replace(/\//g, '-');
  }

  // Formato BR: DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  // Formato US: MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (usMatch) {
    // Tentar detectar se é US ou BR pela lógica (mês <= 12)
    const [, first, second, year] = usMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);

    // Se primeiro número > 12, é dia (formato BR)
    if (firstNum > 12) {
      return `${year}-${second}-${first}`;
    }
    // Se segundo número > 12, é dia (formato US)
    if (secondNum > 12) {
      return `${year}-${first}-${second}`;
    }
    // Ambíguo: assume BR (DD/MM/YYYY)
    return `${year}-${second}-${first}`;
  }

  // Formato compacto: DDMMYYYY
  if (/^\d{8}$/.test(trimmed)) {
    const day = trimmed.slice(0, 2);
    const month = trimmed.slice(2, 4);
    const year = trimmed.slice(4, 8);
    return `${year}-${month}-${day}`;
  }

  // Formato Excel (número serial)
  const excelSerial = parseFloat(trimmed);
  if (!isNaN(excelSerial) && excelSerial > 25569 && excelSerial < 100000) {
    // Excel serial date (dias desde 1900-01-01)
    const date = new Date((excelSerial - 25569) * 86400 * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Normaliza um valor baseado no nome do campo
 */
export function normalizeValue(
  value: unknown,
  fieldName: string,
): string | number | boolean | null {
  // Null/undefined/empty → null
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Converter para string
  const strValue = String(value).trim();
  if (strValue === '') return null;

  // Buscar regra de normalização
  for (const rule of NORMALIZATION_RULES) {
    if (rule.fieldPattern.test(fieldName)) {
      try {
        return rule.transform(strValue);
      } catch (error) {
        console.warn(`[NORMALIZE_ERROR] Campo: ${fieldName}, Valor: ${strValue}`, error);
        return strValue; // Fallback: retorna valor original
      }
    }
  }

  // Nenhuma regra encontrada: retorna valor trimmed
  return strValue;
}

/**
 * Normaliza um objeto completo (todas propriedades)
 */
export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeValue(value, key);
  }

  return normalized;
}

/**
 * Normaliza array de objetos (planilha completa)
 */
export function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(normalizeRow);
}

/**
 * Valida CPF (algoritmo oficial)
 */
export function isValidCPF(cpf: string): boolean {
  if (!cpf || cpf.length !== 11) return false;

  // CPFs inválidos conhecidos
  const invalidCPFs = [
    '00000000000',
    '11111111111',
    '22222222222',
    '33333333333',
    '44444444444',
    '55555555555',
    '66666666666',
    '77777777777',
    '88888888888',
    '99999999999',
  ];

  if (invalidCPFs.includes(cpf)) return false;

  // Validação dos dígitos verificadores
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(10))) return false;

  return true;
}

/**
 * Valida CNPJ (algoritmo oficial)
 */
export function isValidCNPJ(cnpj: string): boolean {
  if (!cnpj || cnpj.length !== 14) return false;

  // CNPJs inválidos conhecidos
  const invalidCNPJs = [
    '00000000000000',
    '11111111111111',
    '22222222222222',
    '33333333333333',
    '44444444444444',
    '55555555555555',
    '66666666666666',
    '77777777777777',
    '88888888888888',
    '99999999999999',
  ];

  if (invalidCNPJs.includes(cnpj)) return false;

  // Validação dos dígitos verificadores
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj.charAt(i)) * weights1[i];
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cnpj.charAt(12))) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj.charAt(i)) * weights2[i];
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cnpj.charAt(13))) return false;

  return true;
}
