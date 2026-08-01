import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const configuracoes = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/Configuracoes.tsx'),
  'utf8',
);
const canonicalPage = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/Configuracoes/Integracoes/Sigvoos.tsx'),
  'utf8',
);

describe('nomenclatura canônica da integração SIGVOOS', () => {
  it('carrega a integração ativa pelo nome SIGVOOS', () => {
    expect(configuracoes).toContain("import('../components/integracoes/SigvoosIntegration')");
    expect(configuracoes).toContain('<SigvoosIntegration />');
    expect(configuracoes).not.toContain('<EdAppIntegration />');
  });

  it('mantém um entrypoint canônico separado da compatibilidade histórica', () => {
    expect(canonicalPage).toContain("export { default } from './EdApp'");
  });
});
