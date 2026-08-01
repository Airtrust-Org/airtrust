import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/lms/LmsAdminCursos.tsx'),
  'utf8',
);

describe('retirada da importação EdApp na administração LMS', () => {
  it('não expõe mutação ou controle de importação', () => {
    expect(source).not.toContain('useImportLmsEdappLegacy');
    expect(source).not.toContain('handleImportEdappLegacy');
    expect(source).not.toContain('Importar legado EdApp');
    expect(source).not.toContain('/legado/edapp/importar');
  });

  it('mantém acesso ao histórico preservado somente leitura', () => {
    expect(source).toContain("navigate('/lms/historico-edapp')");
    expect(source).toContain('Legado EdApp somente leitura');
    expect(source).toContain('A integração e a importação EdApp foram encerradas');
  });
});
