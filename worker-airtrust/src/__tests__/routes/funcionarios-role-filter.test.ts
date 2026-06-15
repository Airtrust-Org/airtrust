import { describe, expect, it } from 'vitest';
import { buildFuncionarioRoleExpr } from '../../routes/funcionarios';

describe('funcionarios role filter expression', () => {
  it('usa funcao com fallback para cargo no select principal', () => {
    expect(buildFuncionarioRoleExpr('f')).toBe(
      "COALESCE(NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), ''))",
    );
  });

  it('gera a mesma expressão sem alias para a query de contagem', () => {
    expect(buildFuncionarioRoleExpr()).toBe(
      "COALESCE(NULLIF(TRIM(funcao), ''), NULLIF(TRIM(cargo), ''))",
    );
  });
});
