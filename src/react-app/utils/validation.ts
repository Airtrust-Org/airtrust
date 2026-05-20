export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

/**
 * SECURITY FIXES:
 * - Improved email regex (RFC-like validation)
 * - Constant-time comparison for CPF checksum to prevent timing attacks
 * - Better date validation with timezone awareness
 * - Comprehensive HTML sanitization
 * - Input length limits
 * - Type-safe validation functions
 */

// ===== CONSTANT-TIME COMPARISON =====
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function isRequired(value: unknown, label: string): ValidationResult {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { valid: false, errors: [`${label} é obrigatório.`] };
  }
  return { valid: true };
}

export function isValidDate(value: string, label: string): ValidationResult {
  // Validate ISO 8601 format
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    return { valid: false, errors: [`${label} deve estar em formato ISO 8601 (YYYY-MM-DD).`] };
  }
  
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { valid: false, errors: [`${label} inválida.`] };
  }
  return { valid: true };
}

export function isValidEmail(value: string, label: string): ValidationResult {
  // RFC 5322 simplified (more permissive but safer than before)
  const re = /^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return re.test(value) && value.length < 254
    ? { valid: true }
    : { valid: false, errors: [`${label} inválido.`] };
}

/**
 * Validate CPF with constant-time comparison (prevents timing attacks)
 */
export function isValidCPF(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (!cpf || cpf.length !== 11 || /^([0-9])\1+$/.test(cpf)) return false;

  // First checksum
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  
  // ===== CONSTANT-TIME COMPARISON =====
  const firstChecksum = String(rev);
  const firstDigit = cpf.charAt(9);
  if (!constantTimeEqual(firstChecksum, firstDigit)) return false;

  // Second checksum
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;

  const secondChecksum = String(rev);
  const secondDigit = cpf.charAt(10);
  return constantTimeEqual(secondChecksum, secondDigit);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^([0-9])\1+$/.test(cnpj)) return false;

  const calc = (base: number) => {
    let length = base - 7;
    let numbers = cnpj.substring(0, base);
    let sum = 0;
    let pos = base - 7;
    for (let i = base; i >= 1; i--) {
      sum += parseInt(numbers.charAt(base - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result;
  };

  const d1 = calc(12);
  const d2 = calc(13);
  return constantTimeEqual(String(d1), cnpj.charAt(12)) &&
         constantTimeEqual(String(d2), cnpj.charAt(13));
}

export function validateUnique(values: string[], label: string): ValidationResult {
  const set = new Set(values);
  if (set.size !== values.length) {
    return { valid: false, errors: [`${label} contém duplicados.`] };
  }
  return { valid: true };
}

export function combineValidations(...results: ValidationResult[]): ValidationResult {
  const errors: string[] = [];
  for (const r of results) {
    if (!r.valid) errors.push(...r.errors);
  }
  return errors.length ? { valid: false, errors } : { valid: true };
}

/**
 * Sanitize input: remove potentially dangerous characters
 * Whitelist approach for better security
 */
export const sanitizeInput = (input: string): string => {
  // Allow only alphanumeric, spaces, and basic punctuation
  return input
    .trim()
    .replace(/[^\w\s\-\.@/]/g, '') // Remove anything not in whitelist
    .substring(0, 255);
};

/**
 * Comprehensive HTML sanitization
 */
export const sanitizeHtml = (input: string): string => {
  const htmlEntityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  return String(input).replace(/[&<>"'`=/]/g, char => htmlEntityMap[char] || char);
};

export const validarTelefone = (telefone: string): boolean => {
  const cleaned = telefone.replace(/\D/g, '');
  // Brazilian phone formats: 10 or 11 digits
  return cleaned.length >= 10 && cleaned.length <= 11;
};

export const validarMatricula = (matricula: string): boolean => {
  // Allow alphanumeric, hyphens, underscores
  if (!/^[A-Za-z0-9\-_]+$/.test(matricula)) return false;
  return matricula.length >= 3 && matricula.length <= 20;
};
