import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('A-02 and A-06 residual migrations', () => {
  const mig0489 = readFileSync(resolve(process.cwd(), 'migrations/0489_a02_natural_keys_tenant_scoped.sql'), 'utf8');
  const mig0490 = readFileSync(resolve(process.cwd(), 'migrations/0490_a06_redundant_indexes_cleanup.sql'), 'utf8');

  it('0489 provides tenant-scoped unique indexes for natural keys', () => {
    expect(mig0489).toContain('DROP INDEX IF EXISTS ux_qualificacoes_tipos_codigo');
    expect(mig0489).toContain('DROP INDEX IF EXISTS ux_funcionarios_cpf');
    expect(mig0489).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf_empresa_active');
    expect(mig0489).toContain('empresa_id, cpf');
  });

  it('0490 drops exact duplicate redundant indexes', () => {
    expect(mig0490).toContain('DROP INDEX IF EXISTS idx_qual_tipos_ativo');
    expect(mig0490).toContain('DROP INDEX IF EXISTS idx_modelos_sessao_codigo');
    expect(mig0490).toContain('DROP INDEX IF EXISTS idx_agend_data_v5');
  });
});
