import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url) as any);
const readRepoFile = (path: string) => readFileSync(new URL(path, `file://${REPO_ROOT}/`) as any, 'utf8');
const BLOCK_SENTINEL = 'LOCAL_PRODUCTION_DEPLOY_DISABLED_USE_GITHUB_ACTIONS';

const hardBlockedEntrypoints = [
  'scripts/preflight-clean-deploy.sh',
  'scripts/deploy-worker-only.sh',
  'scripts/deploy-production-full.sh',
  'scripts/build-and-deploy.sh',
  'scripts/deploy-validated.sh',
] as const;

describe('production deploy entrypoint governance', () => {
  it.each(hardBlockedEntrypoints)('%s is fail-closed outside the governed workflow', (path) => {
    const source = readRepoFile(path);

    expect(source).toContain(BLOCK_SENTINEL);
    expect(source).toContain('.github/workflows/deploy-airtrust.yml');
    expect(source).toMatch(/exit\s+1/);
    expect(source).not.toMatch(/wrangler\s+(?:pages\s+)?deploy/);
  });

  it('keeps the worker safe script emergency-only and main-parity protected', () => {
    const source = readRepoFile('scripts/deploy-worker-safe.sh');
    const emergencyGuardIndex = source.indexOf('AIRTRUST_LOCAL_EMERGENCY_WRAPPER');
    const deployIndex = source.indexOf('wrangler deploy');

    expect(emergencyGuardIndex).toBeGreaterThanOrEqual(0);
    expect(deployIndex).toBeGreaterThan(emergencyGuardIndex);
    expect(source).toContain('AIRTRUST_ALLOW_LOCAL_EMERGENCY_DEPLOY');
    expect(source).toContain('AIRTRUST_CONFIRM_LOCAL_EMERGENCY_DEPLOY');
    expect(source).toContain('HEAD_SHA');
    expect(source).toContain('ORIGIN_MAIN_SHA');
    expect(source).toContain('HEAD == origin/main');
  });

  it('allows the emergency worker path only through the reviewed wrapper', () => {
    const source = readRepoFile('scripts/release-worker-local-emergency.sh');

    expect(source).toContain('AIRTRUST_LOCAL_EMERGENCY_WRAPPER=YES');
    expect(source).toContain('AIRTRUST_ALLOW_LOCAL_EMERGENCY_DEPLOY');
    expect(source).toContain('AIRTRUST_CONFIRM_LOCAL_EMERGENCY_DEPLOY');
    expect(source).toContain('scripts/deploy-worker-safe.sh');
  });

  it('keeps npm production aliases chained to blocked or emergency-gated entrypoints', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> };

    expect(pkg.scripts.deploy).toContain('deploy:pages');
    expect(pkg.scripts['deploy:pages']).toContain('scripts/preflight-clean-deploy.sh');
    expect(pkg.scripts['deploy:worker']).toContain('deploy:worker:only');
    expect(pkg.scripts['deploy:worker:only']).toContain('scripts/deploy-worker-only.sh');
    expect(pkg.scripts['deploy:worker:safe']).toContain('scripts/deploy-worker-safe.sh');
    expect(pkg.scripts['deploy:all']).toContain('scripts/build-and-deploy.sh');
  });

  it('keeps the routine production release on the governed GitHub Actions path', () => {
    const workflow = readRepoFile('.github/workflows/deploy-airtrust.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('validate-production-deploy-dispatch.mjs');
    expect(workflow).toContain('verify-release-gates.mjs');
    expect(workflow).toContain('environment: production');
  });
});
