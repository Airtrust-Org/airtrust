import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('D1 bind budget on high-cardinality routes', () => {
  it('chunks escala coverage tripulante lookups', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/escalas-cobertura.ts'), 'utf8');
    expect(source).toContain("import { collectByBindChunks } from '../utils/d1-bind-chunks'");
    expect(source).toContain('collectByBindChunks(\n      tripulanteIds,\n      1,');
    expect(source).not.toContain('.bind(escalaId, ...tripulanteIds)');
  });

  it('chunks LMS bulk enrollment employee lookup while preserving a 200-id API batch', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-matriculas.ts'), 'utf8');
    expect(source).toContain('funcionario_ids: z.array(z.number().int().positive()).min(1).max(200)');
    expect(source).toMatch(/collectByBindChunks\(\s*funcionarioIdsUnicos,\s*1,/);
    expect(source).not.toContain('[empresaId, ...funcionarioIdsUnicos]');
  });
});
