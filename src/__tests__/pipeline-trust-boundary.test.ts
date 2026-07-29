import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Staging Pipeline Trust Boundary', () => {
  const workflowPath = path.resolve(__dirname, '../../.github/workflows/deploy-staging.yml');
  const applyMigrationPath = path.resolve(__dirname, '../../scripts/staging/apply-approved-migrations.sh');

  const workflowContent = fs.readFileSync(workflowPath, 'utf8');
  const scriptContent = fs.readFileSync(applyMigrationPath, 'utf8');

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
    // Scripts are run via `bash scripts/staging/validate...` (root checkout)
    expect(scriptContent).toMatch(/bash "\$ROOT\/scripts\/staging\/validate-0424-postconditions\.sh"/);
    expect(scriptContent).toMatch(/bash "\$ROOT\/scripts\/staging\/validate-0452-postconditions\.sh"/);
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

  it('11. statuses vazios + check-runs verdes são aceitos', () => {
    // Logic changed to if (statuses.statuses.length > 0 && ...)
    expect(workflowContent).toMatch(/if \(statuses\.statuses\.length > 0 && statuses\.statuses\.some/);
  });

  it('12. status clássico failure bloqueia', () => {
    expect(workflowContent).toMatch(/statuses\.statuses\.some\(\(status\) => status\.state !== 'success'\)/);
  });

  it('13. check-run pending/failure bloqueia', () => {
    expect(workflowContent).toMatch(/const badCheck = relevantChecks\.find\(\(check\) => check\.status !== 'completed' \|\| check\.conclusion !== 'success'\);/);
  });

  it('14. provenance separa workflow_sha e release_sha', () => {
    expect(workflowContent).toMatch(/WORKFLOW_SHA: \${{ github\.sha }}/);
    expect(workflowContent).toMatch(/RELEASE_SHA: \${{ (steps\.release|needs\.guard)\.outputs\.release_sha }}/);
  });
});
