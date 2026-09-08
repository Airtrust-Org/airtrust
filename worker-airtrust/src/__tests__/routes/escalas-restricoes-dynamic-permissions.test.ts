import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('escalas restricoes dynamic permission contract', () => {
  it('preserves existing baselines through the canonical server-side authority', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/escalas-restricoes.ts'), 'utf8');

    expect(source).toContain(
      "requirePermission('escalas', 'visualizar', 'admin', 'manager', 'instructor', 'student', 'viewer', 'editor')",
    );
    expect(source).toContain("requirePermission('escalas', 'criar', 'admin', 'manager')");
    expect(source).toContain("requirePermission('escalas', 'deletar', 'admin', 'manager')");
    expect(source).not.toContain('requireRole(');
  });
});
