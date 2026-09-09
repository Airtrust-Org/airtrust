import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('F4-03 production read-only inventory guard', () => {
  const source = readFileSync(resolve(process.cwd(), '../scripts/validation/f4-03-production-qualification-expiry-inventory.mjs'), 'utf8');

  it('allows only SELECT statements and contains no DML execution path', () => {
    expect(source).toContain("if (!/^SELECT\\b/i.test(normalized))");
    expect(source).toContain("fail('MUTATING_SQL_REJECTED')");
    expect(source).not.toMatch(/\.prepare\(|\.run\(|--file/);
  });

  it('emits only non-PII structural candidate evidence and no free-text/person identity', () => {
    expect(source).toContain('structural_candidate_fields_emitted: true');
    expect(source).toContain('historico_id: Number(row.historico_id || 0)');
    expect(source).toContain('historico_validade_meses:');
    expect(source).toContain('current_type_validade_meses:');
    expect(source).toContain('current_type_vencimento_fim_mes:');
    expect(source).toContain('r2_key_sha256: row.r2_key ? sha256(row.r2_key) : null');
    expect(source).toContain('pii_emitted: false');
    expect(source).not.toMatch(/(?:employee_name|funcionario_nome|funcionario_cpf|email|cpf)\s*:/i);
    expect(source).not.toMatch(/observacoes\s+AS\s+/i);
    expect(source).not.toContain('r2_key: row.r2_key');
  });
});
