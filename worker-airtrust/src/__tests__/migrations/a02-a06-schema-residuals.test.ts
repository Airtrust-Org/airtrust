import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('A-02 tenant-scoped natural key migration', () => {
  const mig0489 = readFileSync(
    resolve(process.cwd(), 'migrations/0489_a02_natural_keys_tenant_scoped.sql'),
    'utf8',
  );

  it('uses the runtime key semantics without inventing global uniqueness', () => {
    expect(mig0489).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf_empresa_active',
    );
    expect(mig0489).toContain('ON funcionarios(empresa_id, cpf)');
    expect(mig0489).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_matricula_empresa_active',
    );
    expect(mig0489).toContain('ON funcionarios(empresa_id, matricula)');
    expect(mig0489).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email_empresa_active',
    );
    expect(mig0489).toContain('ON funcionarios(empresa_id, LOWER(TRIM(email)))');
    expect(mig0489).not.toContain('matricula COLLATE NOCASE');
    expect(mig0489).not.toContain('cpf COLLATE NOCASE');

    const lastReplacementCreate = mig0489.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_email_empresa_active',
    );
    const firstLegacyDrop = mig0489.indexOf('DROP INDEX IF EXISTS ux_funcionarios_cpf');
    expect(lastReplacementCreate).toBeGreaterThanOrEqual(0);
    expect(firstLegacyDrop).toBeGreaterThan(lastReplacementCreate);
  });
});
