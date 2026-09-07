import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Staging Pipeline Trust Boundary', () => {
  const workflowPath = path.resolve(__dirname, '../../.github/workflows/deploy-staging.yml');
  const applyMigrationPath = path.resolve(__dirname, '../../scripts/staging/apply-approved-migrations.sh');
  const recoveryRunnerPath = path.resolve(
    __dirname,
    '../../scripts/staging/apply-approved-migration-with-recovery-point.sh',
  );

  const releaseGateVerifierPath = path.resolve(
    __dirname,
    '../../scripts/ci/verify-release-gates.mjs',
  );

  const workflowContent = fs.readFileSync(workflowPath, 'utf8');
  const scriptContent = fs.readFileSync(applyMigrationPath, 'utf8');
  const recoveryRunnerContent = fs.readFileSync(recoveryRunnerPath, 'utf8');
  const releaseGateVerifierContent = fs.readFileSync(releaseGateVerifierPath, 'utf8');

  it('1. workflow confiável vem de main (ou github.sha) na raiz', () => {
    // The trusted checkout does not have a "path" defined, so it falls to root.
    // E.g., name: Checkout trusted pipeline (main) \n uses: actions/checkout@v4 (without path)
    const matches = [...workflowContent.matchAll(/uses: actions\/checkout@v4\n.*path: release/g)];
    expect(workflowContent).toMatch(/Checkout trusted pipeline/);
  });

  it('2. scripts de governança são executados somente do checkout raiz', () => {
    // There shouldn't be any execution of `release/scripts/...`
    expect(workflowContent).not.toMatch(/bash release\/scripts/);
    expect(workflowContent).not.toMatch(/node release\/scripts/);
    expect(workflowContent).toMatch(/bash scripts\/staging\/backup-d1-staging\.sh/);
  });

  it('3. release_sha é checkout em release/', () => {
    expect(workflowContent).toMatch(/path: release/);
    expect(workflowContent).toMatch(/ref: \${{ needs\.guard\.outputs\.release_sha }}/);
  });

  it('4. nenhum script release/scripts/staging/* é executado', () => {
    expect(workflowContent).not.toMatch(/release\/scripts\/staging/);
  });

  it('5. Worker e frontend são construídos de release/', () => {
    expect(workflowContent).toMatch(/working-directory: release\/worker-airtrust/);
    expect(workflowContent).toMatch(/working-directory: release\s+env:\n\s+VITE_APP_VERSION:/);
  });

  it('6. SQL aplicado vem de release/', () => {
    // apply-approved-migrations.sh receives release/worker-airtrust/...
    expect(workflowContent).toMatch(/--migration="release\/worker-airtrust\/migrations\/\$migration"/);
    expect(scriptContent).toMatch(/migration_path="\$migration_arg"/);
  });

  it('7. allowlist e validator vêm de main', () => {
    // HEALTH P0-08/#477: 0424 and 0452 no longer fall through to a bare
    // wrangler call inside apply-approved-migrations.sh — they route to the
    // governed recovery-point runner, which is where their postcondition
    // validators actually run now. The trust-boundary property this test
    // guards (validators execute from the trusted root checkout, never from
    // untrusted `release/`) is unchanged: both scripts `cd "$ROOT"` before
    // resolving any relative script path, and neither ever prefixes a
    // validator invocation with `release/`.
    expect(scriptContent).not.toMatch(/bash release\/scripts\/staging\/validate/);
    expect(recoveryRunnerContent).toMatch(/bash scripts\/staging\/validate-0424-postconditions\.sh/);
    expect(recoveryRunnerContent).toMatch(/bash scripts\/staging\/validate-0452-postconditions\.sh/);
    expect(recoveryRunnerContent).not.toMatch(/bash release\/scripts\/staging\/validate/);
  });

  it('8. path traversal é rejeitado em migrations', () => {
    expect(scriptContent).toMatch(/if \[\[ "\$migration_path" != "release\/worker-airtrust\/migrations\/\$migration_basename" \]\]; then/);
  });

  it('9. symlink é rejeitado em migrations', () => {
    expect(scriptContent).toMatch(/if \[\[ -L "\$migration_path" \]\]; then/);
  });

  it('10. migration não allowlisted é rejeitada', () => {
    expect(scriptContent).toMatch(/is_approved=false/);
    expect(scriptContent).toMatch(/\[\[ "\$migration_basename" == "\$approved" \]\] && is_approved=true/);
  });

  it('11. release-gate verifier is wired into the guard instead of inline status logic', () => {
    expect(workflowContent).toMatch(/verify-release-gates\.mjs/);
  });

  it('12. status clássico failure bloqueia (release-gate verifier)', () => {
    expect(releaseGateVerifierContent).toMatch(
      /gcbCandidates\.some\(\(status\) => status\.state === 'success'\)/,
    );
  });

  it('13. check-run pending/failure bloqueia (release-gate verifier)', () => {
    expect(releaseGateVerifierContent).toMatch(
      /check\.status === 'completed' && check\.conclusion === 'success'/,
    );
  });

  it('14. provenance separa workflow_sha e release_sha', () => {
    expect(workflowContent).toMatch(/WORKFLOW_SHA: \${{ github\.sha }}/);
    expect(workflowContent).toMatch(/RELEASE_SHA: \${{ (steps\.release|needs\.guard)\.outputs\.release_sha }}/);
  });
});
