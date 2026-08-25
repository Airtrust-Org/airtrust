import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');

function jobBlock(jobId: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  expect(start, `job ${jobId} must exist`).toBeGreaterThan(-1);

  const next = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:$/.test(line),
  );
  return lines.slice(start, next === -1 ? lines.length : next).join('\n');
}

describe('staging Cloudflare credential contract', () => {
  it('reuses the staging Worker token for D1 release operations', () => {
    expect(workflow).not.toContain('CLOUDFLARE_D1_BACKUP_API_TOKEN');
    expect(workflow).not.toContain('CLOUDFLARE_D1_MIGRATION_API_TOKEN');

    for (const jobId of [
      'check-d1-backup-token',
      'check-d1-migration-token',
      'backup',
      'preflight',
      'apply-migrations',
      'postconditions',
    ]) {
      expect(jobBlock(jobId), `${jobId} must use the staging Worker token`).toContain(
        'CLOUDFLARE_WORKER_API_TOKEN',
      );
    }
  });

  it('keeps Pages on its independent Pages token', () => {
    expect(jobBlock('check-pages-token')).toContain('CLOUDFLARE_PAGES_API_TOKEN');
    expect(jobBlock('deploy-frontend')).toContain('CLOUDFLARE_PAGES_API_TOKEN');
  });
});
