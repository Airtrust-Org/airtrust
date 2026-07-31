import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCli } from '../../../scripts/apply-simuladores-pto-rev10-import.mjs';

const sourcePath = path.resolve(
  process.cwd(),
  'scripts',
  'apply-simuladores-pto-rev10-import.mjs',
);
const source = fs.readFileSync(sourcePath, 'utf8');

describe('PTO Rev10 local applicator guard', () => {
  it('refuses remote, staging and production tokens before touching files', () => {
    expect(() => runCli(['node', 'script', '--remote'])).toThrow(
      'indicação de remoto/staging/produção',
    );
    expect(() => runCli(['node', 'script', '--env', 'production'])).toThrow(
      'indicação de remoto/staging/produção',
    );
    expect(() => runCli(['node', 'script', '--env', 'staging'])).toThrow(
      'indicação de remoto/staging/produção',
    );
  });

  it('requires an explicit local-only confirmation for write mode', () => {
    expect(source).toContain("const APPLY_CONFIRMATION = 'APLICAR_PTO_REV10_LOCAL'");
    expect(source).toContain("if (confirmation !== APPLY_CONFIRMATION)");
    expect(source).toContain("const dbPath = arg(argv, '--d1-local')");
    expect(source).not.toMatch(/spawnSync\(['\"]wrangler['\"]/);
  });

  it('does not generate write statements against historical operational tables', () => {
    for (const table of [
      'fichas_sessao',
      'ficha_manobras_avaliacao',
      'simulador_agendamentos',
      'simulador_agendamento_tripulantes',
      'assinaturas',
      'qualificacoes_historico',
    ]) {
      expect(source.toLowerCase()).not.toMatch(
        new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+${table}`, 'i'),
      );
    }
  });
});
