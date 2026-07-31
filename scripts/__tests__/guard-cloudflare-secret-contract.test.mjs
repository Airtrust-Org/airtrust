// source_reference: positive/negative coverage for the Cloudflare secret
// contract guard (scripts/ci/guard-cloudflare-secret-contract.mjs,
// scripts/ci/cloudflare-secret-contract-lib.mjs). One fixture per rule
// proves the rule fires on the offending pattern and stays silent on the
// compliant equivalent.
// dry_run_required: pure string fixtures only; nothing touches the real
// repository or any workflow file on disk.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { checkWorkflowContent } from '../ci/cloudflare-secret-contract-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const COMPLIANT_WORKER_JOB = `
name: Fixture
on:
  workflow_dispatch:
jobs:
  diagnose-worker:
    name: Diagnose Worker Token
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Diagnose
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: echo ok
`;

describe('cloudflare-secret-contract-lib: checkWorkflowContent', () => {
  it('passes a compliant worker job with no violations', () => {
    assert.deepEqual(checkWorkflowContent('fixture.yml', COMPLIANT_WORKER_JOB), []);
  });

  it('flags direct use of the generic secrets.CLOUDFLARE_API_TOKEN', () => {
    const content = COMPLIANT_WORKER_JOB.replace(
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}',
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}',
    );
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('secrets.CLOUDFLARE_API_TOKEN')));
  });

  it('flags a Worker job that reads the Pages token', () => {
    const content = COMPLIANT_WORKER_JOB.replace(
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}',
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_API_TOKEN }}',
    );
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(
      violations.some((v) =>
        v.includes('looks like a Worker job but references CLOUDFLARE_PAGES_API_TOKEN'),
      ),
    );
  });

  it('flags a Pages job that reads the Worker token', () => {
    const content = `
jobs:
  diagnose-pages:
    name: Diagnose Pages Token
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Diagnose
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: echo ok
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(
      violations.some((v) =>
        v.includes('looks like a Pages job but references CLOUDFLARE_WORKER_API_TOKEN'),
      ),
    );
  });

  it('flags a step that combines Worker and Pages tokens', () => {
    const content = `
jobs:
  deploy:
    name: Deploy Everything
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy
        env:
          WORKER_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
          PAGES_TOKEN: \${{ secrets.CLOUDFLARE_PAGES_API_TOKEN }}
        run: echo ok
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('combining multiple scoped tokens')));
  });

  it('flags instructions to create a new token as the fix', () => {
    const content = `
jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - name: Check
        run: echo "Please create a new token with Workers, Pages and Account permissions"
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('instructs creating a new Cloudflare token')));
  });

  it('flags a hardcoded Account-ID-shaped literal', () => {
    const content = `
jobs:
  diagnose:
    name: Diagnose
    runs-on: ubuntu-latest
    steps:
      - name: Check
        run: echo "account=4dca4e5fddc6a351651dd224f456586f"
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('literal Account-ID-shaped hex string')));
  });

  it('flags smoke credentials described as a token', () => {
    const content = `
jobs:
  smoke:
    name: Smoke
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Check
        run: echo "validating smoke token STAGING_SMOKE_EMAIL"
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('smoke credentials as a "token"')));
  });

  it('flags smoke credentials mapped into a *TOKEN* variable', () => {
    const content = `
jobs:
  smoke:
    name: Smoke
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Check
        env:
          SMOKE_TOKEN: \${{ secrets.STAGING_SMOKE_EMAIL }}
        run: echo ok
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('variable named like a token')));
  });

  it('flags a job reading environment-scoped secrets without declaring environment', () => {
    const content = `
jobs:
  deploy-worker:
    name: Deploy Worker
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: echo ok
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('does not declare "environment:"')));
  });

  it('flags staging smoke credentials read outside the staging environment', () => {
    const content = `
jobs:
  smoke:
    name: Smoke
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Check
        env:
          STAGING_SMOKE_EMAIL: \${{ secrets.STAGING_SMOKE_EMAIL }}
        run: echo ok
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('outside the staging environment')));
  });

  it('flags printing a token/secret length', () => {
    const content = `
jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - name: Check
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: echo "length=\${#CLOUDFLARE_API_TOKEN}"
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(violations.some((v) => v.includes('prints a token/secret length')));
  });

  it('flags echoing a token/credential value directly', () => {
    const content = `
jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Check
        env:
          CLOUDFLARE_WORKER_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: echo "$CLOUDFLARE_WORKER_API_TOKEN"
`;
    const violations = checkWorkflowContent('fixture.yml', content);
    assert.ok(
      violations.some((v) => v.includes('echoes/prints a Cloudflare token or smoke credential')),
    );
  });

  it('flags printenv', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: printenv
`;
    assert.ok(
      checkWorkflowContent('fixture.yml', content).some((v) =>
        v.includes('echoes/prints a Cloudflare token or smoke credential'),
      ),
    );
  });

  it('flags bare shell env command', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |
          env
`;
    assert.ok(
      checkWorkflowContent('fixture.yml', content).some((v) =>
        v.includes('echoes/prints a Cloudflare token or smoke credential'),
      ),
    );
  });

  it('flags set -x', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: set -x
`;
    assert.ok(
      checkWorkflowContent('fixture.yml', content).some((v) =>
        v.includes('echoes/prints a Cloudflare token or smoke credential'),
      ),
    );
  });

  it('flags os.environ full dump in python', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: python3 -c "import os; print(os.environ)"
`;
    assert.ok(
      checkWorkflowContent('fixture.yml', content).some((v) =>
        v.includes('echoes/prints a Cloudflare token or smoke credential'),
      ),
    );
  });

  it('flags os.environ specific token dump in python', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: python3 -c "import os; print(os.environ['CLOUDFLARE_WORKER_API_TOKEN'])"
`;
    assert.ok(
      checkWorkflowContent('fixture.yml', content).some((v) =>
        v.includes('echoes/prints a Cloudflare token or smoke credential'),
      ),
    );
  });

  it('passes --env production without false positive', () => {
    const content = `
jobs:
  deploy-worker:
    name: Deploy Worker
    runs-on: ubuntu-latest
    environment: production
    steps:
      - env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: npx wrangler deploy --env production
`;
    assert.deepEqual(checkWorkflowContent('fixture.yml', content), []);
  });

  it('passes env.NODE_VERSION without false positive', () => {
    const content = `
jobs:
  deploy-worker:
    name: Deploy Worker
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: echo \${{ env.NODE_VERSION }}
`;
    assert.deepEqual(checkWorkflowContent('fixture.yml', content), []);
  });

  it('passes env.staging without false positive', () => {
    const content = `
jobs:
  deploy-worker:
    name: Deploy Worker
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: echo \${{ env.staging }}
`;
    assert.deepEqual(checkWorkflowContent('fixture.yml', content), []);
  });

  it('passes env=valor attribution without false positive', () => {
    const content = `
jobs:
  deploy-worker:
    name: Deploy Worker
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: env="some_value"
`;
    assert.deepEqual(checkWorkflowContent('fixture.yml', content), []);
  });

  it('passes safe subprocess env assignment', () => {
    const content = `
jobs:
  deploy-worker:
    name: Deploy Worker
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
        run: env SOME_VAR=1 command
`;
    assert.deepEqual(checkWorkflowContent('fixture.yml', content), []);
  });
});

describe('guard:cloudflare-secret-contract (CLI)', () => {
  it('recognizes the EAD reconciliation as a D1 job with tokens isolated by step', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/ead-reconciliation.yml'), 'utf8');
    assert.match(workflow, /^  d1-reconciliation:\n    name: D1 EAD Reconciliation$/m);
    assert.match(
      workflow,
      /name: Verify backup Wrangler access[\s\S]*?CLOUDFLARE_D1_BACKUP_API_TOKEN/,
    );
    assert.match(
      workflow,
      /name: Apply Reconciliation to remote D1[\s\S]*?CLOUDFLARE_D1_MIGRATION_API_TOKEN/,
    );
    assert.doesNotMatch(workflow, /^    CLOUDFLARE_API_TOKEN:/m);
    assert.deepEqual(checkWorkflowContent('ead-reconciliation.yml', workflow), []);
  });

  it('passes against the current repository workflows', () => {
    const result = spawnSync('node', ['scripts/ci/guard-cloudflare-secret-contract.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /OK: guard:cloudflare-secret-contract/);
  });
});
