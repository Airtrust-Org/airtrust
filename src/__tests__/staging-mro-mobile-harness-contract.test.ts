import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/staging-mro-mobile-qa.yml');
const specPath = path.join(root, 'e2e/frontend-pr-ui-qa/mro-audit-closure.spec.ts');

function read(pathname: string) {
  return fs.readFileSync(pathname, 'utf8');
}

describe('staging MRO mobile governed harness contract', () => {
  it('keeps the release provenance boundary fail closed and staging only', () => {
    const workflow = read(workflowPath);

    expect(workflow).toContain("[[ \"$EVENT_REF\" == 'refs/heads/main' ]]");
    expect(workflow).toContain('AIRTRUST_STAGING_MRO_MOBILE_QA');
    expect(workflow).toContain('^[0-9a-fA-F]{40}$');
    expect(workflow).toContain('git merge-base --is-ancestor "$RELEASE_SHA" HEAD');
    expect(workflow).toContain('node scripts/ci/verify-release-gates.mjs');
    expect(workflow).toContain('STAGING_WORKER_SHA_MISMATCH');
    expect(workflow).toContain('https://airtrust-api-staging.airtrust.workers.dev');
    expect(workflow).toContain('https://staging.airtrust.pages.dev');
    expect(workflow).not.toContain('https://api.airtrust.online');
    expect(workflow).not.toContain('https://airtrust.online');
  });

  it('runs only the trusted-main MRO responsive spec through the authenticated read-only profile', () => {
    const workflow = read(workflowPath);

    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('AUDIT_PROFILE: audit-closure');
    expect(workflow).toContain('mro-audit-closure.spec.ts --config=e2e/frontend-pr-ui-qa.config.ts --project=chromium');
    expect(workflow).toContain('credential-pair.mjs');
    expect(workflow).not.toContain('wrangler d1 execute');
    expect(workflow).not.toContain('wrangler deploy');
    expect(workflow).not.toContain('deploy-staging.yml');
  });

  it('locks all audited MRO routes, both mobile viewports and zero-mutation checks', () => {
    const spec = read(specPath);

    expect(spec).toContain("{ key: 'mobile_390', width: 390, height: 844 }");
    expect(spec).toContain("{ key: 'mobile_375', width: 375, height: 812 }");
    expect(spec).toContain("{ key: 'dashboard', path: '/mro' }");
    expect(spec).toContain("{ key: 'ordens_servico', path: '/mro/os' }");
    expect(spec).toContain("{ key: 'aeronaves', path: '/mro/aeronaves' }");
    expect(spec).toContain('installReadOnlyGuard(page)');
    expect(spec).toContain("expect(guard.mutationCount, 'MRO responsive QA must remain read-only').toBe(0)");
  });
});
