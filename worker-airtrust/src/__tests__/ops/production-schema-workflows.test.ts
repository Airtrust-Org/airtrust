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

describe('security token guard — least privilege', () => {
  const applySchema = readWorkflow('apply-schema-change-v2.yml');
  const deployAirtrust = readWorkflow('deploy-airtrust.yml');

  it('forbids generic CLOUDFLARE_API_TOKEN usage directly', () => {
    expect(applySchema).not.toMatch(/secrets\.CLOUDFLARE_API_TOKEN/);
    expect(deployAirtrust).not.toMatch(/secrets\.CLOUDFLARE_API_TOKEN/);
  });

  it('schema workflow requires D1 migration token and fail-closed gate', () => {
    expect(applySchema).toContain('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN');
    expect(applySchema).toContain('PRODUCTION_D1_MIGRATION_TOKEN_MISSING');
    expect(applySchema).not.toMatch(/CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
  });

  it('deploy-airtrust continues using only Worker and Pages tokens', () => {
    expect(deployAirtrust).toContain('secrets.CLOUDFLARE_WORKER_API_TOKEN');
    expect(deployAirtrust).toContain('secrets.CLOUDFLARE_PAGES_API_TOKEN');
    expect(deployAirtrust).not.toContain('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN');
  });

  it('error handling blocks do not contain corrupt redirections', () => {
    expect(applySchema).not.toContain('>echo');
    expect(applySchema).not.toContain('>&22');
  });
});
