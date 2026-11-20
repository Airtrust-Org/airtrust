import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos-conditions.ts'), 'utf8');

describe('Compliance designation catalog safety', () => {
  it('allows administrators to explicitly clear optional metadata without restoring old values', () => {
    expect(source).toContain("Object.prototype.hasOwnProperty.call(body, 'descricao')");
    expect(source).toContain("Object.prototype.hasOwnProperty.call(body, 'referencia_normativa')");
    // The frontend sends null to clear both fields and the server converts it to SQL NULL.
    expect(source).toContain("(body.descricao ?? '')");
    expect(source).toContain("(body.referencia_normativa ?? '')");
  });

  it('rechecks concurrent assignment and rule insertions atomically in the UPDATE predicate', () => {
    const start = source.indexOf('const deletion = await db.prepare(');
    expect(start).toBeGreaterThan(-1);
    const sql = source.slice(start, source.indexOf(').bind(id, empresaId).run()', start));
    expect(sql).toContain('WHERE id=? AND empresa_id=? AND ativo=1 AND deleted_at IS NULL');
    expect(sql).toContain('AND NOT EXISTS (');
    expect(sql).toContain('SELECT 1 FROM treinamento_requisitos r');
    expect(sql).toContain('SELECT 1 FROM funcionarios_compliance_condicoes a');
    // These predicates must be in the UPDATE, not only the preceding usage query.
    expect(source).toContain('Number(deletion.meta.changes || 0) !== 1');
    expect(source).toContain("throw new ApiError('Designação alterada ou vinculada durante a exclusão");
  });
});
