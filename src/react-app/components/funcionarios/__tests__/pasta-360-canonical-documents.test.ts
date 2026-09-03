import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Pasta 360 canonical document presentation', () => {
  it('preserves backend version lineage instead of flattening duplicate names', () => {
    const hook = source('src/react-app/hooks/usePastaVirtual.ts');

    expect(hook).toContain('versaoAtual?: boolean');
    expect(hook).toContain('substituidoPorId?: number | null');
    expect(hook).toContain('versaoAtual: d.versaoAtual');
    expect(hook).toContain('substituidoPorId: d.substituidoPorId ?? null');
  });

  it('does not treat zero-byte or missing-storage records as valid documents', () => {
    const hook = source('src/react-app/hooks/usePastaVirtual.ts');
    const view = source('src/react-app/components/funcionarios/PastaVirtualCompleta.tsx');

    expect(hook).toContain('Number(doc.tamanho) > 0');
    expect(hook).toContain("Boolean(String(doc.arquivo_url || '').trim())");
    expect(view).toContain('Artefatos indisponíveis');
    expect(view).toContain('Registros sem arquivo válido ou com tamanho zero');
    expect(view).toContain('Versão atual');
    expect(view).toContain('Substituído');
  });
});
