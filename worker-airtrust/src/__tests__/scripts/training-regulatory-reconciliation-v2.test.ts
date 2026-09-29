import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scriptPath = resolve(process.cwd(), '../scripts/compliance/reconcile-training-regulatory-matrix-v2.mjs');
const source = readFileSync(scriptPath, 'utf8');

function dryRun() {
  return execFileSync(process.execPath, [scriptPath, '--env=staging'], {
    encoding: 'utf8',
  });
}

describe('training regulatory reconciliation v2', () => {
  it('é staging-only, fixa o D1 correto e exige autorização + hash exato para apply', () => {
    expect(source).toContain("const STAGING_DB = 'airtrust-db-staging-baseline-20260701'");
    expect(source).toContain('AIRTRUST_STAGING_RECONCILIATION_AUTH');
    expect(source).toContain('STAGING_RECONCILIATION_AUTH_REQUIRED');
    expect(source).toContain('EXPECTED_RECONCILIATION_SHA256_MISMATCH');
    expect(source).toContain('V2_RECONCILIATION_STAGING_ONLY');
    expect(source).not.toContain("production: 'airtrust-db'");
  });

  it('substitui SETOR TRI por condição PTAP explícita sem matrícula automática', () => {
    const output = dryRun();
    expect(output).toContain('BASE_RECONCILIATION_SHA256=38f5912b3f4890a3c3acc956c8192d5cacfe259394fd6037571dc5889ea2bc75');
    expect(output).toMatch(/RECONCILIATION_SHA256=[0-9a-f]{64}/);
    expect(output).toContain('TARGET_DATABASE=airtrust-db-staging-baseline-20260701');
    expect(output).toContain('MODE=DRY_RUN');
    expect(output).toContain('STATEMENTS=48');
    expect(output).toContain("'PTAP_TRIPULANTE_VOO','Tripulante de voo PTAP','ATIVIDADE'");
    expect(output).not.toContain("UPPER('TRI')");
    expect(output).not.toContain('INSERT INTO lms_matriculas');
    expect(output).not.toMatch(/auto_matricular_ead\s*=\s*1/i);
  });

  it('recusa produção e recusa apply de staging sem confirmação explícita', () => {
    const production = spawnSync(process.execPath, [scriptPath, '--env=production'], { encoding: 'utf8' });
    expect(production.status).not.toBe(0);
    expect(production.stderr).toContain('V2_RECONCILIATION_STAGING_ONLY');

    const output = dryRun();
    const hash = output.match(/RECONCILIATION_SHA256=([0-9a-f]{64})/)?.[1];
    expect(hash).toBeTruthy();
    const apply = spawnSync(
      process.execPath,
      [scriptPath, '--apply', '--env=staging', `--expected-sha256=${hash}`],
      { encoding: 'utf8' },
    );
    expect(apply.status).not.toBe(0);
    expect(apply.stderr).toContain('STAGING_RECONCILIATION_AUTH_REQUIRED');
  });
});
