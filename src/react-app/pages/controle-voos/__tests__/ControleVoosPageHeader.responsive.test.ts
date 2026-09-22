import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/components/ControleVoosPageHeader.tsx'),
  'utf8',
);

describe('ControleVoosPageHeader responsive actions', () => {
  it('permite quebrar cabeçalho e ações em viewports menores sem empurrar ações para fora da tela', () => {
    expect(source).toContain('sm:flex-wrap');
    expect(source).toContain('min-w-0 max-w-full flex-wrap');
  });
});
