import { describe, expect, it } from 'vitest';
import {
  classifyFuncionarioNaturalKeyConflict,
  normalizeFuncionarioCpf,
  normalizeFuncionarioEmail,
  normalizeFuncionarioMatricula,
} from '../../services/funcionario-natural-keys';

describe('funcionario natural keys', () => {
  it('normalizes the reviewed A-02 key semantics', () => {
    expect(normalizeFuncionarioCpf(' 000.000.000-00 ')).toBe('00000000000');
    expect(normalizeFuncionarioMatricula('  AbC-001  ')).toBe('AbC-001');
    expect(normalizeFuncionarioEmail('  Pilot.Name@Example.COM ')).toBe(
      'pilot.name@example.com',
    );
  });

  it.each([
    [
      new Error(
        "D1_ERROR: UNIQUE constraint failed: index 'ux_funcionarios_cpf_empresa_active'",
      ),
      'cpf',
      'FUNCIONARIO_CPF_CONFLICT',
    ],
    [
      new Error(
        "D1_ERROR: UNIQUE constraint failed: index 'ux_funcionarios_matricula_empresa_active'",
      ),
      'matricula',
      'FUNCIONARIO_MATRICULA_CONFLICT',
    ],
    [
      new Error(
        "D1_ERROR: UNIQUE constraint failed: index 'ux_funcionarios_email_empresa_active'",
      ),
      'email',
      'FUNCIONARIO_EMAIL_CONFLICT',
    ],
    [
      new Error(
        'UNIQUE constraint failed: funcionarios.empresa_id, funcionarios.cpf',
      ),
      'cpf',
      'FUNCIONARIO_CPF_CONFLICT',
    ],
  ])('classifies only reviewed employee natural-key conflicts', (error, field, code) => {
    expect(classifyFuncionarioNaturalKeyConflict(error)).toMatchObject({ field, code });
  });

  it('does not hide unrelated database failures', () => {
    expect(
      classifyFuncionarioNaturalKeyConflict(
        new Error('UNIQUE constraint failed: usuarios.email'),
      ),
    ).toBeNull();
    expect(classifyFuncionarioNaturalKeyConflict(new Error('D1 network failure'))).toBeNull();
  });
});
