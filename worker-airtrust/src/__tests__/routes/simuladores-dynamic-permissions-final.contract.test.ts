import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('simulator configurable surfaces use dynamic server-side permissions', () => {
  it('removes static manager gates from simulator management routes', () => {
    for (const path of [
      'src/routes/simuladores-catalogo.ts',
      'src/routes/simuladores-equipamentos.ts',
      'src/routes/simuladores-catalogo-secured.ts',
      'src/routes/simuladores-curriculos-voo.ts',
      'src/routes/simuladores-modelos.ts',
      'src/routes/simuladores-planejamento.ts',
      'src/routes/simuladores-planejamento-v2-crew.ts',
    ]) {
      const source = read(path);
      expect(source).toContain("requirePermission('simuladores'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
  });
});
