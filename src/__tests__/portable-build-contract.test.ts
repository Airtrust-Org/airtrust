import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

describe('contrato portátil de build', () => {
  it('não depende de instalação Homebrew específica de uma máquina', () => {
    expect(packageJson.scripts.build).not.toContain('/opt/homebrew');
    expect(packageJson.scripts['build:clean']).not.toContain('/opt/homebrew');
  });
});
