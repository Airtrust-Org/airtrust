import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const specPath = path.join(root, 'e2e/frontend-pr-ui-qa/lms-scorm-staging.spec.ts');
const workflowPath = path.join(root, '.github/workflows/staging-lms-scorm-qa.yml');

function read(pathname: string) {
  return fs.readFileSync(pathname, 'utf8');
}

describe('staging LMS SCORM governed harness contract', () => {
  it('keeps the Playwright proxy timeout above the real conformance timeout', () => {
    const source = read(specPath);
    const match = source.match(/route\.fetch\(\{\s*timeout:\s*([\d_]+)\s*\}\)/);

    expect(match, 'delayed real-response route.fetch timeout must stay explicit').not.toBeNull();

    const timeoutMs = Number(match?.[1].replaceAll('_', ''));
    expect(timeoutMs).toBeGreaterThan(30_000);
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
});
