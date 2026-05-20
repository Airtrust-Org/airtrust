/**
 * UTILS - CPF
 *
 * Normalização e validação de CPF brasileiro.
 * - Aceita com ou sem máscara
 * - Completa com zeros à esquerda
 * - Valida dígitos verificadores
 */

/**
 * Normaliza CPF removendo máscaras e completando com zeros
 *
 * Exemplos:
 * - "012.345.678-90" → "01234567890"
 * - "12345678-90" → "01234567890"
 * - "1234567890" → "01234567890"
 * - 1234567890 → "01234567890"
 */
export function normalizeCPF(cpf: unknown): string {
  if (!cpf) return '';

  // Remove tudo que não é número
  const clean = String(cpf).replace(/\D/g, '');

  // Completa com zeros à esquerda até 11 dígitos
  return clean.padStart(11, '0');
}

/**
 * Valida CPF usando algoritmo oficial
 *
 * Regras:
 * - Deve ter exatamente 11 dígitos
 * - Não pode ser sequência (111.111.111-11, etc)
 * - Dígitos verificadores devem ser válidos
 */
export function isValidCPF(cpf: string): boolean {
  const normalized = normalizeCPF(cpf);

  // Validar tamanho
  if (normalized.length !== 11) return false;

  // Rejeitar sequências (111.111.111-11, 222.222.222-22, etc)
  if (/^(\d)\1{10}$/.test(normalized)) return false;

  // Validar primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(normalized.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(normalized.charAt(9))) return false;

  // Validar segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(normalized.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(normalized.charAt(10))) return false;

  return true;
}

/**
 * Formata CPF com máscara
 *
 * Exemplo: "01234567890" → "012.345.678-90"
 */
export function formatCPF(cpf: string): string {
  const normalized = normalizeCPF(cpf);
  if (normalized.length !== 11) return cpf;

  return normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
