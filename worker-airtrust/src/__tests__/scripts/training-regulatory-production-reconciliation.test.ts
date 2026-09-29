import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const scriptPath = resolve(
  process.cwd(),
  '../scripts/production/reconcile-training-regulatory-matrix-20260929.mjs',
);
const validatorPath = resolve(
  process.cwd(),
  '../scripts/production/validate-training-regulatory-reconciliation-20260929.mjs',
);
const workflowPath = resolve(
  process.cwd(),
  '../.github/workflows/production-training-compliance-regulatory-reconciliation-20260929.yml',
);
const source = readFileSync(scriptPath, 'utf8');
const validatorSource = readFileSync(validatorPath, 'utf8');
const workflowSource = readFileSync(workflowPath, 'utf8');

function dryRun() {
  return execFileSync(process.execPath, [scriptPath, '--env=production'], { encoding: 'utf8' });
}

describe('production training regulatory reconciliation', () => {
  it('é production-only, fixa o D1 e exige autorização + hash exato para apply', () => {
    expect(source).toContain("const PRODUCTION_DB = 'airtrust-db'");
    expect(source).toContain('PRODUCTION_RECONCILIATION_PRODUCTION_ONLY');
    expect(source).toContain('PRODUCTION_RECONCILIATION_AUTH_REQUIRED');
    expect(source).toContain('EXPECTED_RECONCILIATION_SHA256_MISMATCH');
    expect(source).not.toContain('airtrust-db-staging-baseline-20260701');
  });

  it('gera 48 statements, substitui TRI por condição PTAP e nunca matricula', () => {
    const output = dryRun();
    expect(output).toContain(
      'BASE_RECONCILIATION_SHA256=38f5912b3f4890a3c3acc956c8192d5cacfe259394fd6037571dc5889ea2bc75',
    );
    expect(output).toMatch(/RECONCILIATION_SHA256=[0-9a-f]{64}/);
    expect(output).toContain('ENV=production');
    expect(output).toContain('TARGET_DATABASE=airtrust-db');
    expect(output).toContain('MODE=DRY_RUN');
    expect(output).toContain('STATEMENTS=48');
    expect(output).toContain("'PTAP_TRIPULANTE_VOO','Tripulante de voo PTAP','ATIVIDADE'");
    expect(output).not.toContain("UPPER('TRI')");
    expect(output).not.toContain('INSERT INTO lms_matriculas');
    expect(output).not.toMatch(/auto_matricular_ead\s*=\s*1/i);
  });

  it('recusa staging e recusa apply sem autorização explícita', () => {
    const staging = spawnSync(process.execPath, [scriptPath, '--env=staging'], {
      encoding: 'utf8',
    });
    expect(staging.status).not.toBe(0);
    expect(staging.stderr).toContain('PRODUCTION_RECONCILIATION_PRODUCTION_ONLY');
    const hash = dryRun().match(/RECONCILIATION_SHA256=([0-9a-f]{64})/)?.[1];
    expect(hash).toBeTruthy();
    const apply = spawnSync(
      process.execPath,
      [scriptPath, '--apply', '--env=production', `--expected-sha256=${hash}`],
      { encoding: 'utf8' },
    );
    expect(apply.status).not.toBe(0);
    expect(apply.stderr).toContain('PRODUCTION_RECONCILIATION_AUTH_REQUIRED');
  });

  it('valida pré e pós-condições sem PII e sem inferir designações', () => {
    expect(validatorSource).toContain("['dry-run', 'pre', 'post']");
    expect(validatorSource).toContain('prerequisite-models-present');
    expect(validatorSource).toContain('controlled-models-not-yet-created');
    expect(validatorSource).toContain('no-inferred-ptap-employee-assignments');
    expect(validatorSource).toContain('no-auto-enrollment-on-reconciled-profiles');
  });

  it('workflow exige dry-run predecessor, gates, backup e recovery point', () => {
    expect(workflowSource).toContain('Verify eight canonical release gates on exact SHA');
    expect(workflowSource).toContain('reviewed_dry_run_run_id');
    expect(workflowSource).toContain('Capture verified production D1 backup');
    expect(workflowSource).toContain('Capture D1 Time Travel recovery point');
    expect(workflowSource).toContain('validate-0517-production-postconditions.sh');
    expect(workflowSource).toContain('environment: production');
    expect(workflowSource).not.toContain('environment: staging');
  });
});
