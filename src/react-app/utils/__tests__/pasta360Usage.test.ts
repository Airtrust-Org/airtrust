import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const flowFiles = [
  'src/react-app/components/modals/ModalCertificado.tsx',
  'src/react-app/components/qualificacoes/ModalCertificados.tsx',
  'src/react-app/pages/FichaFuncionarioPage.tsx',
];

describe('pasta360 usage guards', () => {
  it('usa Pasta 360 nos fluxos de qualificacoes, funcionario e certificados', () => {
    for (const file of flowFiles) {
      const source = readFileSync(`${process.cwd()}/${file}`, 'utf8');
      expect(source).toContain('buildPasta360Url');
      expect(source).not.toMatch(/navigate\(\s*`\/pasta-virtual\/\$\{/);
      expect(source).not.toMatch(/navigate\(\s*['"]\/pasta-virtual\//);
    }
  });
});
