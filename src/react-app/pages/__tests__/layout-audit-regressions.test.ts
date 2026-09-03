import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('layout audit regressions', () => {
  it('keeps module governance metadata compact and non-redundant', () => {
    const banner = source('src/react-app/components/ModuleGovernanceBanner.tsx');

    expect(banner).toContain('const chips = [maturityLevel, evidenceLevel];');
    expect(banner).not.toContain("isPrototype ? 'Protótipo'");
    expect(banner).not.toContain("isRegulated ? 'Regulado' : 'Não regulado'");
  });

  it('renders only one governance layer on Controle de Voos preview routes', () => {
    const shell = source(
      'src/react-app/pages/controle-voos/components/ControleVoosPageShell.tsx',
    );

    expect(shell).toContain('{demoRoute ? (');
    expect(shell).toContain(') : (\n        <ControleVoosPrototypeBanner />');
    expect((shell.match(/<ControleVoosPrototypeBanner/g) || []).length).toBe(1);
  });

  it('uses neutral styling for MRO classification/type badges', () => {
    const badge = source('src/react-app/pages/mro/components/MroStatusBadge.tsx');

    for (const type of [
      'preventiva',
      'corretiva',
      'modificacao',
      'inspecao',
      'componente',
      'manutencao',
      'reparo',
      'alteracao',
    ]) {
      expect(badge).toContain(`'${type}': NEUTRAL_CLASSIFICATION_STYLE`);
    }

    expect(badge).not.toContain("'preventiva': 'bg-indigo");
    expect(badge).not.toContain("'componente': 'bg-pink");
  });
});
