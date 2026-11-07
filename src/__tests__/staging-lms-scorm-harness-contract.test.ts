import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const specPath = path.join(root, 'e2e/frontend-pr-ui-qa/lms-scorm-staging.spec.ts');
const workflowPath = path.join(root, '.github/workflows/staging-lms-scorm-qa.yml');
const harnessPath = path.join(root, 'scripts/staging/lms-scorm-staging-qa.mjs');

function read(pathname: string) {
  return fs.readFileSync(pathname, 'utf8');
}

describe('staging LMS SCORM governed harness contract', () => {
  it('uses real staging Worker responses without intercepting or synthesizing API traffic', () => {
    const source = read(specPath);

    // The previous browser QA proxied a delayed real conformance response
    // through Playwright interception with a timeout. The candidate-first UI guard
    // deliberately does NOT invoke conformance or intercept requests.
    // Reintroducing interception requires a separately reviewed harness
    // contract; this test must fail rather than silently accept a mock.
    expect(source).not.toMatch(/\b(?:page|context)\.route\s*\(/);
    expect(source).not.toMatch(/\broute\.(?:fetch|fulfill|continue|abort)\s*\(/);
    expect(source).toContain('draftUrl.hostname !== STAGING_API_HOST');
    expect(source).toContain('draftResponse.status() !== 200');
    expect(source).toContain('draftResponse.json().catch(() => null)');
    expect(source).toContain("realZipUpload: 'NOT_RUN_NO_EXACT_F5_GRANT'");
    expect(source).toContain("functionalCertification: 'UNCERTIFIED'");
  });

  it('keeps release provenance and target guards fail-closed', () => {
    const workflow = read(workflowPath);

    expect(workflow).toContain("[[ \"$EVENT_REF\" == 'refs/heads/main' ]]");
    expect(workflow).toContain('^[0-9a-fA-F]{40}$');
    expect(workflow).toContain('git merge-base --is-ancestor "$RELEASE_SHA" HEAD');
    expect(workflow).toContain('STAGING_WORKER_SHA_MISMATCH');
    expect(workflow).toContain('https://airtrust-api-staging.airtrust.workers.dev');
    expect(workflow).toContain('https://staging.airtrust.pages.dev');
    expect(workflow).not.toContain('https://api.airtrust.online');
    expect(workflow).not.toContain('https://airtrust.online');
  });

  it('accepts only a reviewed open same-repo candidate when staging SHA is outside main', () => {
    const workflow = read(workflowPath);
    expect(workflow).toContain('pr_number:');
    expect(workflow).toContain('OPEN_REVIEWED_PR_REQUIRED');
    expect(workflow).toContain('OPEN_REVIEWED_PR_SHA_OR_SCOPE_MISMATCH');
    expect(workflow).toContain("pr.state !== 'open' || pr.draft");
    expect(workflow).toContain("pr.base?.ref !== 'main'");
    expect(workflow).toContain("pr.head?.repo?.full_name !== repo");
    expect(workflow).toContain("pr.head?.sha?.toLowerCase() !== sha");
    expect(workflow).toContain('verify-release-gates.mjs');
    expect(workflow).toContain('STAGING_WORKER_SHA_MISMATCH');
  });

  it('keeps synthetic SCORM fixtures unique across workflow reruns', () => {
    const harness = read(harnessPath);

    expect(harness).toContain("const RUN_ID = String(process.env.GITHUB_RUN_ID || Date.now());");
    expect(harness).toContain("const RUN_ATTEMPT = String(process.env.GITHUB_RUN_ATTEMPT || '1');");
    expect(harness).toContain('const RUN_MARKER = `${RUN_ID}-${RUN_ATTEMPT}`;');
    expect(harness).toContain('packageVersion: `qa-${RUN_MARKER}`');
    expect(harness).toContain('const title = `QA SCORM ${label} ${RUN_MARKER}`;');
    expect(harness).toContain('const zipName = `qa-scorm-${key}-${RUN_MARKER}.zip`;');
  });

  it('keeps cleanup idempotent and verifies synthetic courses are unreachable', () => {
    const harness = read(harnessPath);
    const workflow = read(workflowPath);

    expect(harness).toContain('removed.status === 200 || removed.status === 404');
    expect(harness).toContain("assert(verify.status === 404, `curso sintético ${id} ainda visível após cleanup`);");
    expect(workflow).toContain('- name: Cleanup disposable LMS SCORM fixtures');
    expect(workflow).toContain('if: always()');
  });
});
