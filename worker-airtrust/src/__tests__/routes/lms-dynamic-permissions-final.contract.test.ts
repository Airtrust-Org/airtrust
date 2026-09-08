import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('LMS configurable surfaces use dynamic server-side permissions', () => {
  it('removes static manager gates from configurable LMS manager surfaces', () => {
    for (const path of [
      'src/routes/lms-cursos-upload-routes.ts',
      'src/routes/lms-edapp-legado.ts',
      'src/routes/lms-matriculas-mel-manutencao.ts',
      'src/routes/lms-cursos-legacy.ts',
    ]) {
      const source = read(path);
      expect(source).toContain("requirePermission('lms'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }

    const matriculas = read('src/routes/lms-matriculas.ts');
    expect(matriculas).toContain("requirePermission('lms'");
    expect(matriculas).not.toContain("requireRole('admin', 'manager')");
    expect(matriculas).toContain("requireRole('admin')");
  });
});
