import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const files = [
  'src/routes/escalas-core.ts',
  'src/routes/escalas-crud.ts',
  'src/routes/escalas-padroes.ts',
  'src/routes/escalas-templates.ts',
  'src/routes/escalas-tipos-evento.ts',
  'src/routes/escalas-quinzenas.ts',
  'src/routes/escalas-situacoes.ts',
  'src/routes/escalas-confirmacoes.ts',
  'src/routes/escalas-eventos.ts',
  'src/routes/escalas-tripulacoes.ts',
  'src/routes/escalas-evd.ts',
  'src/routes/escalas-alocacoes.ts',
  'src/routes/escala-mensal-integrada.ts',
];

describe('Escalas configurable surfaces use dynamic server-side permissions', () => {
  it('removes static admin/manager gates from Escalas manager surfaces', () => {
    for (const path of files) {
      const source = fs.readFileSync(path, 'utf8');
      expect(source).toContain("requirePermission('escalas'");
      expect(source).not.toContain("requireRole('admin', 'manager')");
    }
  });
});
