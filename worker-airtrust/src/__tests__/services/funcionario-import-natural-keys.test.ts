import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFuncionarioRow } from '../../services/importacao/validators';

describe('employee import natural-key contract', () => {
  it('canonicalizes Matricula and Email during shared import validation', async () => {
    const row: Record<string, unknown> = {
      Nome: 'Piloto Teste',
      CPF: '083.286.227-42',
      Matricula: '  AbC-001  ',
      Email: '  Pilot.Test@Example.COM ',
    };

    const errors = await validateFuncionarioRow(row, 2);

    expect(errors).toEqual([]);
    expect(row.CPF).toBe('08328622742');
    expect(row.Matricula).toBe('AbC-001');
    expect(row.Email).toBe('pilot.test@example.com');
  });

  it('keeps XLSX writes on the same A-02 email/matricula semantics', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/routes/importacao-xlsx.ts'),
      'utf8',
    );

    expect(source).toContain('normalizeFuncionarioMatricula');
    expect(source).toContain('normalizeFuncionarioEmail');
    expect(source).toContain('Matrícula duplicada na planilha');
    expect(source).toContain('E-mail duplicado na planilha');
    expect(source).toContain('classifyFuncionarioNaturalKeyConflict');
    expect(source).toContain('matricula || null');
    expect(source).toContain('email || null');
  });

  it('keeps the legacy FuncionarioImportacao service on normalized row values', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/services/importacao/FuncionarioImportacao.ts'),
      'utf8',
    );

    expect(source).toContain("updateFields.push('email = ?')");
    expect(source).toContain('updateValues.push(email)');
    expect(source).toContain("updateFields.push('matricula = ?')");
    expect(source).toContain('updateValues.push(matricula)');
  });
});
