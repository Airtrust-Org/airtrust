export type FuncionarioNaturalKeyField = 'cpf' | 'matricula' | 'email';

export type FuncionarioNaturalKeyConflict = {
  field: FuncionarioNaturalKeyField;
  code: string;
  message: string;
};

export function normalizeFuncionarioEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeFuncionarioMatricula(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeFuncionarioCpf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.toLowerCase();
  }
  return String(error ?? '').toLowerCase();
}

/**
 * Maps only the reviewed A-02 natural-key UNIQUE constraints to an HTTP
 * business conflict. Unknown database failures remain untouched and bubble to
 * the global error boundary.
 */
export function classifyFuncionarioNaturalKeyConflict(
  error: unknown,
): FuncionarioNaturalKeyConflict | null {
  const text = errorText(error);
  const isUnique =
    text.includes('unique constraint failed') ||
    text.includes('constraint_unique') ||
    text.includes('sqlite_constraint_unique');

  if (!isUnique) return null;

  if (
    text.includes('ux_funcionarios_cpf_empresa_active') ||
    (text.includes('funcionarios.empresa_id') && text.includes('funcionarios.cpf'))
  ) {
    return {
      field: 'cpf',
      code: 'FUNCIONARIO_CPF_CONFLICT',
      message: 'CPF já cadastrado para outro funcionário nesta empresa',
    };
  }

  if (
    text.includes('ux_funcionarios_matricula_empresa_active') ||
    (text.includes('funcionarios.empresa_id') && text.includes('funcionarios.matricula'))
  ) {
    return {
      field: 'matricula',
      code: 'FUNCIONARIO_MATRICULA_CONFLICT',
      message: 'Matrícula já cadastrada para outro funcionário nesta empresa',
    };
  }

  if (
    text.includes('ux_funcionarios_email_empresa_active') ||
    (text.includes('funcionarios.empresa_id') && text.includes('funcionarios.email'))
  ) {
    return {
      field: 'email',
      code: 'FUNCIONARIO_EMAIL_CONFLICT',
      message: 'E-mail já cadastrado para outro funcionário nesta empresa',
    };
  }

  return null;
}
