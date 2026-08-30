import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../FichaFuncionarioPage.tsx', import.meta.url), 'utf8');

describe('FichaFuncionarioPage operational separation', () => {
  it('does not render personal contact or identity fields in the operational page', () => {
    expect(source).not.toContain('{f.cpf}');
    expect(source).not.toContain('formatarData(f.nascimento)');
    expect(source).not.toContain('formatarData(f.admissao)');
    expect(source).not.toContain('{f.email}');
    expect(source).not.toContain('{f.telefone');
  });

  it('routes personal data to the dedicated employee profile', () => {
    expect(source).toContain('Ficha360OperationalContext');
    expect(source).toContain('/perfil?tab=dados');
  });
});
