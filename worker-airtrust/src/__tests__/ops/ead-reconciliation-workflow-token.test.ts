import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const workflow = readFileSync(
  join(ROOT, '.github/workflows/ead-reconciliation.yml'),
  'utf8',
);
const executableWorkflow = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');

describe('ead-reconciliation.yml — dedicated D1 credential', () => {
  it('uses the environment-scoped D1 migration token', () => {
    expect(executableWorkflow).toContain(
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN }}',
    );
    expect(executableWorkflow).toContain(
      'CLOUDFLARE_D1_MIGRATION_API_TOKEN_MISSING_',
    );
  });

  it('does not reuse Worker, Pages, or generic Cloudflare secrets for D1 reconciliation', () => {
    expect(executableWorkflow).not.toContain(
      'secrets.CLOUDFLARE_WORKER_API_TOKEN',
    );
    expect(executableWorkflow).not.toContain(
      'secrets.CLOUDFLARE_PAGES_API_TOKEN',
    );
    expect(executableWorkflow).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
  });

  it('keeps the dry-run remote write steps gated off', () => {
    expect(executableWorkflow).toContain("inputs.mode == 'apply'");
    expect(executableWorkflow).toContain('Verify read-only D1 access');
    expect(executableWorkflow).toContain('SELECT 1 AS d1_read_only_access');
  });
});
