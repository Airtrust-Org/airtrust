import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const GUARD_SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'guard-frms-no-direct-sigvoos.cjs');

function runGuardAgainstFixtureDir(fixtureFiles: Record<string, string>): { exitCode: number; stdout: string; stderr: string } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frms-guard-fixture-'));
  const frmsDir = path.join(tmpRoot, 'worker-airtrust', 'src', 'lib', 'frms');
  fs.mkdirSync(frmsDir, { recursive: true });
  for (const [relativePath, content] of Object.entries(fixtureFiles)) {
    const fullPath = path.join(frmsDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  // O script real resolve o diretório de domínio como `<scriptDir>/../worker-airtrust/src/lib/frms`.
  // Para testar com fixtures isoladas, copiamos o script para dentro da árvore fixture
  // preservando essa mesma relação de caminho (scripts/ ao lado de worker-airtrust/).
  const scriptsDir = path.join(tmpRoot, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptContent = fs.readFileSync(GUARD_SCRIPT, 'utf-8');
  const fixtureScriptPath = path.join(scriptsDir, 'guard-frms-no-direct-sigvoos.cjs');
  fs.writeFileSync(fixtureScriptPath, scriptContent, 'utf-8');

  try {
    const stdout = execFileSync(process.execPath, [fixtureScriptPath], {
      cwd: tmpRoot,
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    const execError = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: execError.status ?? 1,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

describe('guard-frms-no-direct-sigvoos', () => {
  it('passa quando nenhum arquivo de src/lib/frms importa módulos de integração SIGVOOS', () => {
    const result = runGuardAgainstFixtureDir({
      'controle-voos-source.ts': `
        import type { D1Database } from '@cloudflare/workers-types';
        export function fetchSomething(db: D1Database) { return db; }
      `,
      'fadiga-score.ts': `
        export function calcularScore() { return 5; }
      `,
    });
    expect(result.exitCode).toBe(0);
  });

  it('falha quando um arquivo de src/lib/frms importa services/sigvoos-frms', () => {
    const result = runGuardAgainstFixtureDir({
      'db-service.ts': `
        import { syncSigvoosForFrms } from '../../services/sigvoos-frms';
        export function foo() { return syncSigvoosForFrms; }
      `,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('sigvoos-frms');
  });

  it('falha quando um arquivo de src/lib/frms importa routes/integracoes_sigvoos', () => {
    const result = runGuardAgainstFixtureDir({
      'alertas.ts': `
        import { getSigvoosConfig } from '../../routes/integracoes_sigvoos';
        export function bar() { return getSigvoosConfig; }
      `,
    });
    expect(result.exitCode).toBe(1);
  });

  it('não gera falso positivo quando a palavra "sigvoos" aparece apenas em comentário/string, sem import', () => {
    const result = runGuardAgainstFixtureDir({
      'operational-crew.ts': `
        // Nota: este módulo é o substituto canônico do caminho legado do SIGVOOS.
        export const DESCRICAO = 'Fonte canônica, não depende de sigvoos-frms diretamente.';
      `,
    });
    expect(result.exitCode).toBe(0);
  });

  it('falha quando o import é feito via require() dinâmico', () => {
    const result = runGuardAgainstFixtureDir({
      'legacy.ts': `
        const { syncSigvoosForFrms } = require('../../services/sigvoos-frms');
        export { syncSigvoosForFrms };
      `,
    });
    expect(result.exitCode).toBe(1);
  });
});
