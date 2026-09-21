import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDir, '../Qualificacoes.tsx'), 'utf8');

describe('Qualificações > Modelos — estabilidade da tabela', () => {
  it('usa uma versão nova da configuração persistida da tabela', () => {
    expect(source).toContain('tableId="qualificacoes-tipos-v2"');
    expect(source).not.toContain('tableId="qualificacoes-tipos"');
  });

  it('remonta a tabela quando preferências/dataset terminam de hidratar', () => {
    expect(source).toContain("modelosPrefsReady ? 'ready' : 'loading'");
    expect(source).toContain('filteredTipos.length');
    expect(source).toContain("filteredTipos[0]?.id ?? 'none'");
  });

  it('mantém virtualização desligada para a grade de Modelos', () => {
    expect(source).toMatch(
      /tableId="qualificacoes-tipos-v2"[\s\S]*?data=\{filteredTipos\}[\s\S]*?virtualizeRows=\{false\}/,
    );
  });
});
