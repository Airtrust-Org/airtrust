import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production Worker/Pages release parity', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../.github/workflows/deploy-airtrust.yml'),
    'utf8',
  );

  it('serializes Pages after Worker when both components are requested', () => {
    const pages = workflow.slice(workflow.indexOf('  deploy-pages:'), workflow.indexOf('  verify-release-parity:'));
    expect(pages).toContain('needs: [guard, prepare, deploy-worker]');
    expect(pages).toContain("(inputs.deploy_worker == false || needs.deploy-worker.result == 'success')");
  });

  it('requires an exact post-deploy Worker/Pages version parity check', () => {
    const parity = workflow.slice(workflow.indexOf('  verify-release-parity:'));
    expect(parity).toContain('needs: [guard, deploy-worker, deploy-pages]');
    expect(parity).toContain("needs.deploy-worker.result == 'success'");
    expect(parity).toContain("needs.deploy-pages.result == 'success'");
    expect(parity).toContain('WORKER_VERSION_ENDPOINT');
    expect(parity).toContain('assert-pages-build-version.mjs');
    expect(parity).toContain("actual !== expected");
  });
});
