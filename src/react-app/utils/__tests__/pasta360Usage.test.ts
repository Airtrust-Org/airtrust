import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const flowFiles = [
  'src/react-app/App.tsx',
  'src/react-app/components/modals/ModalCertificado.tsx',
  'src/react-app/components/funcionarios/TabelaFuncionarios.tsx',
  'src/react-app/components/qualificacoes/ModalCertificados.tsx',
  'src/react-app/pages/FichaFuncionarioPage.tsx',
  'src/react-app/pages/funcionarios/ListaFuncionarios.tsx',
  'src/react-app/pages/funcionarios/tabs/ListaTab.tsx',
];

describe('pasta360 usage guards', () => {
  it('usa Pasta 360 nos fluxos operacionais de qualificacoes, funcionario e certificados', () => {
    for (const file of flowFiles) {
      const source = readFileSync(`${process.cwd()}/${file}`, 'utf8');
      if (file.endsWith('App.tsx')) {
        expect(source).toContain('LegacyPastaVirtualRedirect');
      } else {
        expect(source).toContain('buildPasta360Url');
      }
      expect(source).not.toMatch(/navigate\(\s*`\/pasta-virtual\/\$\{/);
      expect(source).not.toMatch(/navigate\(\s*['"]\/pasta-virtual\//);
    }
  });
});
