import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/lms/LmsAdminCursos.tsx'),
  'utf8',
);

describe('LmsAdminCursos empty state', () => {
  it('exposes canonical no-results copy when search or filters return no courses', () => {
    expect(source).toContain('title="Nenhum curso encontrado"');
    expect(source).toContain('description="Ajuste a busca ou os filtros');
    expect(source).not.toContain('title="Nenhum curso nesta visão"');
  });
});
