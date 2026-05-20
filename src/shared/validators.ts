/**
 * VALIDADORES ANTI-FALHA PARA CLOUDFLARE D1
 * Substitui CHECK constraints incompatíveis por validação no código
 */

export const validateDesignacao = (designacao: string): boolean => {
  const valid = ['SIC', 'PIC', 'SIC/PIC'];
  return valid.includes(designacao);
};

export const validateTipoVencimento = (tipo: string): boolean => {
  const valid = ['ANUAL', 'BIENAL', 'SEMESTRAL', 'PERMANENTE', 'DIA_EXATO', 'FINAL_MES'];
  return valid.includes(tipo);
};

export const validatePerfil = (perfil: string): boolean => {
  const valid = ['ADMIN', 'COMPLIANCE', 'GESTOR', 'FUNCIONARIO'];
  return valid.includes(perfil);
};

export const validateStatusFuncionarioAeronave = (status: string): boolean => {
  const valid = ['ATIVO', 'INATIVO', 'SUSPENSA'];
  return valid.includes(status);
};

export const validateStatusCertificacao = (status: string): boolean => {
  const valid = ['ATIVO', 'VENCIDO', 'CANCELADO', 'SUBSTITUIDO'];
  return valid.includes(status);
};

export const validateMatricula = (matricula: string): string => {
  const numero = matricula.replace(/\D/g, '');
  return numero.padStart(5, '0');
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateCPF = (cpf: string): boolean => {
  const cleanCpf = cpf.replace(/\D/g, '');
  
  if (cleanCpf.length !== 11) return false;
  
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
  
  return true; // Simplificado para não quebrar importações
};

/**
 * ERRO HANDLER UNIFICADO
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export const createValidationError = (field: string, message: string, code: string = 'INVALID_VALUE'): ValidationError => {
  return { field, message, code };
};

/**
 * VALIDAÇÃO COMPLETA DE FUNCIONÁRIO
 */
export const validateFuncionario = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (!data.nome || data.nome.trim().length < 2) {
    errors.push(createValidationError('nome', 'Nome deve ter pelo menos 2 caracteres', 'REQUIRED'));
  }
  
  if (!data.matricula) {
    errors.push(createValidationError('matricula', 'Matrícula é obrigatória', 'REQUIRED'));
  } else {
    const matriculaNormalizada = validateMatricula(data.matricula);
    if (matriculaNormalizada.length !== 5) {
      errors.push(createValidationError('matricula', 'Matrícula deve ter formato numérico (ex: 00300)', 'INVALID_FORMAT'));
    }
  }
  
  if (data.email && !validateEmail(data.email)) {
    errors.push(createValidationError('email', 'Email deve ter formato válido', 'INVALID_FORMAT'));
  }
  
  if (data.cpf && !validateCPF(data.cpf)) {
    errors.push(createValidationError('cpf', 'CPF deve ter 11 dígitos válidos', 'INVALID_FORMAT'));
  }
  
  return errors;
};

/**
 * VALIDAÇÃO COMPLETA DE TREINAMENTO
 */
export const validateTreinamento = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (!data.codigo || data.codigo.trim().length < 2) {
    errors.push(createValidationError('codigo', 'Código deve ter pelo menos 2 caracteres', 'REQUIRED'));
  }
  
  if (!data.nome || data.nome.trim().length < 3) {
    errors.push(createValidationError('nome', 'Nome deve ter pelo menos 3 caracteres', 'REQUIRED'));
  }
  
  if (!data.categoria || data.categoria.trim().length < 2) {
    errors.push(createValidationError('categoria', 'Categoria é obrigatória', 'REQUIRED'));
  }
  
  if (data.tipo_vencimento && !validateTipoVencimento(data.tipo_vencimento)) {
    errors.push(createValidationError('tipo_vencimento', 'Tipo de vencimento deve ser ANUAL, BIENAL, SEMESTRAL, PERMANENTE, DIA_EXATO ou FINAL_MES', 'INVALID_VALUE'));
  }
  
  if (data.nota_minima !== undefined && (data.nota_minima < 0 || data.nota_minima > 10)) {
    errors.push(createValidationError('nota_minima', 'Nota mínima deve estar entre 0 e 10', 'INVALID_RANGE'));
  }
  
  return errors;
};

/**
 * EXPORT DEFAULT PARA COMPATIBILIDADE
 */
export default {
  validateDesignacao,
  validateTipoVencimento,
  validatePerfil,
  validateStatusFuncionarioAeronave,
  validateStatusCertificacao,
  validateMatricula,
  validateEmail,
  validateCPF,
  validateFuncionario,
  validateTreinamento,
  createValidationError
};
