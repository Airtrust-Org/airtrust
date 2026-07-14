import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function readWorkflow(name: string): string {
  return readFileSync(join(ROOT, `.github/workflows/${name}`), 'utf8');
}

describe('deploy-airtrust.yml — production schema hard block', () => {
  const workflow = readWorkflow('deploy-airtrust.yml');

  it('keeps workflow_dispatch but hard-fails legacy migrations', () => {
    expect(workflow).toContain('run_migrations:');
    expect(workflow).toContain('LEGACY_MIGRATION_RUNNER_DISABLED_USE_SCHEMA_V2');
    expect(workflow).not.toMatch(/wrangler d1 migrations apply/);
  });

  it('does not keep an Apply D1 migrations step', () => {
    expect(workflow).not.toContain('Apply D1 migrations');
  });
});

describe('apply-schema-change-v2.yml — controlled single-file apply', () => {
  const workflow = readWorkflow('apply-schema-change-v2.yml');

  it('runs only on workflow_dispatch and never deploys worker/pages', () => {
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).not.toMatch(/wrangler deploy/);
    expect(workflow).not.toMatch(/pages deploy/);
  });

  it('requires exact production confirmation and main branch', () => {
    expect(workflow).toContain('AIRTRUST_PRODUCTION');
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('expected_sha');
  });

  it('applies exactly one allowlisted file under worker-airtrust/schema-v2/', () => {
    expect(workflow).toContain('worker-airtrust/schema-v2/');
    expect(workflow).toContain('change not already applied');
    expect(workflow).not.toMatch(/d1\s+migrations\s+apply/);
  });
});
