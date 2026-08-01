import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const workflow = readFileSync(
  join(ROOT, '.github/workflows/staging-browser-rendering-runtime-sync.yml'),
  'utf8',
);

describe('staging Browser Rendering runtime sync', () => {
  it('runs only after a reviewed merge to main changes this controlled workflow', () => {
    expect(workflow).toMatch(/on:\n\s+push:\n\s+branches:\n\s+- main/);
    expect(workflow).toContain("'.github/workflows/staging-browser-rendering-runtime-sync.yml'");
    expect(workflow).toContain(
      "'worker-airtrust/src/__tests__/ops/staging-browser-rendering-runtime-sync.test.ts'",
    );
    expect(workflow).not.toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });

  it('is fail-closed and fixed to staging resources', () => {
    for (const token of [
      'environment: staging',
      'refs/heads/main',
      'airtrust-api-staging',
      'https://airtrust-api-staging.airtrust.workers.dev',
      'airtrust-db-staging-baseline-20260701',
      'bf9963f4-eb12-439b-a830-20bbf577ac22',
      'api.airtrust.online',
      '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
      'assert-staging-worker-targets.py',
      'PRODUCTION_HOST_REJECTED',
      'PRODUCTION_DB_REJECTED',
    ]) {
      expect(workflow).toContain(token);
    }
    expect(workflow).not.toContain('wrangler d1 execute');
    expect(workflow).not.toContain('migrations apply');
    expect(workflow).not.toContain('--env production');
  });

  it('preflights only a dedicated credential against Cloudflare Browser Rendering', () => {
    expect(workflow).toContain('/browser-rendering/pdf');
    expect(workflow).toContain("head -c 4 \"$pdf\" | grep -q '^%PDF'");
    expect(workflow).toContain('BROWSER_TOKEN_CANONICAL');
    expect(workflow).toContain('BROWSER_TOKEN_ALIAS');
    expect(workflow).not.toContain('worker-token-fallback');
    expect(workflow).not.toContain('validate_candidate worker');
    expect(workflow).toContain('STAGING_BROWSER_TOKEN_MISSING_OR_UNAUTHORIZED');
  });

  it('synchronizes only the two required runtime secrets without logging their values', () => {
    expect(workflow).toContain('secret put CF_ACCOUNT_ID --env staging');
    expect(workflow).toContain('secret put CF_BROWSER_API_TOKEN --env staging');
    expect(workflow).toContain('> "$selected_token_file"');
    expect(workflow).toContain('chmod 600 "$selected_token_file"');
    expect(workflow).not.toMatch(/echo\s+"?\$browser_token/);
    expect(workflow).not.toMatch(/cat\s+"?\$selected_token_file"?\s*$/m);
  });

  it('proves secret rotation did not change the deployed code identity', () => {
    for (const field of ['version', 'sourceSha', 'sourceTree', 'workerBundleSha256']) {
      expect(workflow).toContain(field);
    }
    expect(workflow).toContain('STAGING_CODE_IDENTITY_CHANGED_AFTER_SECRET_SYNC');
    expect(workflow).toContain('STAGING_BROWSER_RENDERING_RUNTIME_READY');
  });
});
