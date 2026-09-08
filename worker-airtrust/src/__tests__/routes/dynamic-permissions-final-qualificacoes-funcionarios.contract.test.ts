import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('dynamic permission final qualification and employee surfaces', () => {
  it('governs employee vacation writes through funcionarios permissions', () => {
    const source = read('src/routes/funcionarios.ts');
    expect(source).toContain("requirePermission('funcionarios', 'editar', 'admin', 'manager')");
    expect(source).toContain("requirePermission('funcionarios', 'deletar', 'admin', 'manager')");
  });

  it('removes static manager role gates from qualification write routers', () => {
    for (const path of [
      'src/routes/qualificacoes/atribuicao.ts',
      'src/routes/qualificacoes/historico-write.ts',
      'src/routes/qualificacoes/historico-atomic-write.ts',
    ]) {
      const source = read(path);
      expect(source).toContain("requirePermission('qualificacoes'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
  });
});
