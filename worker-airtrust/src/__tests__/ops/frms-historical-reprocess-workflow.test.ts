import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '..');
const workflow = readFileSync(
  join(root, '.github', 'workflows', 'frms-historical-reprocess.yml'),
  'utf8',
);
const entrypoint = readFileSync(
  join(root, 'scripts', 'production', 'frms-historical-reprocess.mjs'),
  'utf8',
);
const executor = readFileSync(
  join(root, 'ops', 'production', 'frms-historical-reprocess.mjs'),
  'utf8',
);

describe('FRMS historical reprocessing governance', () => {
  it('is production-gated, exact-SHA-bound and always backs up before writes', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('FRMS_REPROCESS_ALL_HISTORICAL');
    expect(workflow).toContain('expected_sha does not match github.sha');
    expect(workflow).toContain('The approved SHA is no longer the current origin/main');

    const backupIndex = workflow.indexOf('Export and verify production D1 backup');
    const dryRunIndex = workflow.indexOf('Run full historical dry-run against backup copy');
    const timeTravelIndex = workflow.indexOf('Capture D1 Time Travel recovery point');
    const executeIndex = workflow.indexOf('Execute governed production reprocessing');

    expect(backupIndex).toBeGreaterThan(-1);
    expect(dryRunIndex).toBeGreaterThan(backupIndex);
    expect(timeTravelIndex).toBeGreaterThan(dryRunIndex);
    expect(executeIndex).toBeGreaterThan(timeTravelIndex);
    expect(workflow).toContain('CLOUDFLARE_D1_BACKUP_API_TOKEN');
    expect(workflow).toContain('CLOUDFLARE_D1_MIGRATION_API_TOKEN');
  });

  it('uses a disposable backup dry-run and uploads only sanitized JSON reports', () => {
    expect(workflow).toContain('sqlite3 "$local_db" < "$BACKUP_SQL"');
    expect(workflow).toContain('--target sqlite');
    expect(workflow).toContain('--approved-dry-run "$DRY_RUN_REPORT"');
    expect(workflow).toContain('frms-historical-dry-run.json');
    expect(workflow).toContain('frms-historical-production-report.json');
    expect(workflow).not.toContain('${{ env.BACKUP_SQL }}');
    expect(workflow).not.toContain('airtrust-db-production.sql\n          if-no-files-found');
  });

  it('keeps operational-source markers in the entrypoint', () => {
    expect(entrypoint).toContain('source_reference');
    expect(entrypoint).toContain('operational_decision');
    expect(entrypoint).toContain('dry_run_required');
    expect(entrypoint).toContain('rollback_plan_required');
    expect(entrypoint).toContain("import '../../ops/production/frms-historical-reprocess.mjs'");
  });

  it('reuses the durable cron ledger for idempotency, snapshots and rollback', () => {
    expect(executor).toContain("const JOB_NAME = 'frms_historical_reprocess_v2'");
    expect(executor).toContain("existing?.status === 'SUCCEEDED'");
    expect(executor).toContain('SNAPSHOT_BEFORE');
    expect(executor).toContain('before,');
    expect(executor).toContain('after, delta');
    expect(executor).toContain("stage = 'ROLLED_BACK'");
    expect(executor).toContain('COMPLETED_REVIEW_REQUIRED');
    expect(executor).toContain('FRMS_TENANT_PREFLIGHT_FAILED');
  });

  it('has no 24-month or 1000-row historical cap', () => {
    expect(executor).not.toContain("date('now', '-24 months')");
    expect(executor).not.toContain('LIMIT 1000');
    expect(executor).toContain('const PAGE_SIZE = 250');
    expect(executor).toContain('ORDER BY CAST(j.tripulante_id AS INTEGER), j.data, j.id');
  });
});
