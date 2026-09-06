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

  it('emits aggregate evidence without row identity or free-text fields', () => {
    expect(source).toContain('pii_emitted: false');
    expect(source).not.toMatch(/(?:employee_name|funcionario_nome|email|cpf|documento)\s*:/i);
    expect(source).not.toMatch(/observacoes\s+AS\s+/i);
  });
});
