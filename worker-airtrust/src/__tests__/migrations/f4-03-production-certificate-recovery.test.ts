import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('F4-03 production certificate recovery guard', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../scripts/validation/f4-03-production-certificate-recovery.mjs'),
    'utf8',
  );

  it('is read-only for D1 and R2', () => {
    expect(source).toContain("if (!/^SELECT\\b/i.test(normalized))");
    expect(source).toContain("fail('MUTATING_SQL_REJECTED')");
    expect(source).toContain("'r2','object','get'");
    expect(source).not.toMatch(/['"](?:put|delete)['"]/);
    expect(source).not.toMatch(/\.run\(|\.prepare\(/);
  });

  it('never emits raw storage keys, PDF text or person identity', () => {
    expect(source).toContain('raw_r2_key_emitted: false');
    expect(source).toContain('pdf_or_text_emitted: false');
    expect(source).toContain('pii_emitted: false');
    expect(source).not.toMatch(/(?:funcionario_nome|funcionario_cpf|email|cpf)\s*:/i);
    expect(source).not.toContain('r2_key: r2Key');
  });

  it('only accepts certificate sources created before the incident', () => {
    expect(source).toContain("INCIDENT_AT = '2026-07-15 19:05:19'");
    expect(source).toContain('if (!createdAt || createdAt >= INCIDENT_AT) continue;');
  });
});
