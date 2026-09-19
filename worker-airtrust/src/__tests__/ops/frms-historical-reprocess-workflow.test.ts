import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The issue-comment path resumes the same durable scope instead of creating a second execution.
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
    expect(workflow).not.toContain('CLOUDFLARE_D1_BACKUP_API_TOKEN');
    expect(workflow).toContain('CLOUDFLARE_D1_MIGRATION_API_TOKEN');
    expect(workflow).toContain(
      'CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN }}',
    );
  });

  it('accepts only the exact owner authorization comment and preserves the reviewed scope', () => {
    expect(workflow).toContain('issue_comment:');
    expect(workflow).toContain('github.event.issue.number == 827');
    expect(workflow).toContain('github.event.comment.user.login == github.repository_owner');
    expect(workflow).toContain(
      "github.event.comment.body == 'FRMS_REPROCESS_ALL_HISTORICAL 2578ee339be7788bf3cc5a1da8a23bd50b06b524'",
    );
    expect(workflow).toContain('APPROVED_FORMULA_SHA: 2578ee339be7788bf3cc5a1da8a23bd50b06b524');
    expect(workflow).toContain('git merge-base --is-ancestor "$expected_sha" "$main_sha"');
    expect(workflow).toContain('Reviewed FRMS formula or executor changed after approval.');
    expect(workflow).toContain('Record authorized production start');
    expect(workflow).toContain('Publish sanitized production result to authorization issue');
  });

  it('uses a one-shot main trigger compatible with the production environment branch policy', () => {
    const trigger = readFileSync(
      join(root, '.github', 'frms-historical-reprocess-0499.trigger'),
      'utf8',
    );
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain('.github/frms-historical-reprocess-0499.trigger');
    expect(workflow).toContain('One-shot FRMS trigger already existed in the first parent.');
    expect(workflow).toContain('One-shot FRMS trigger was not introduced by this main merge.');
    expect(workflow).toContain('One-shot FRMS trigger content does not match the approved 0499 scope.');
    expect(trigger).toContain('operation=execute');
    expect(trigger).toContain('empresa_id=6');
    expect(trigger).toContain('data_inicio=2026-01-01');
    expect(trigger).toContain('data_fim=2026-09-16');
    expect(trigger).toContain('target_revision_id=frms-empresa6-helicopter-offshore-v2-history-0499');
    expect(trigger).toContain('recalc_run_id=frms-recalc-empresa6-v2-history-2026-0499');
    expect(trigger).toContain('confirmation=FRMS_REPROCESS_ALL_HISTORICAL');
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
    expect(executor).toContain('if (current.id === row.id) continue;');
    expect(executor).toContain("UPDATE frms_acumulo_rolling SET deleted_at = datetime('now')");
    expect(executor).toContain('COMPLETED_REVIEW_REQUIRED');
    expect(executor).toContain('FRMS_TENANT_PREFLIGHT_FAILED');
  });

  it('has no 24-month or 1000-row historical cap', () => {
    expect(executor).not.toContain("date('now', '-24 months')");
    expect(executor).not.toContain('LIMIT 1000');
    expect(executor).toContain('const PAGE_SIZE = 250');
    expect(executor).toContain('ORDER BY CAST(j.tripulante_id AS INTEGER), j.data, j.id');
  });
  it('pins the V2 historical backfill to Costa do Sol, the approved date range and revision', () => {
    expect(workflow).toContain("APPROVED_EMPRESA_ID: '6'");
    expect(workflow).toContain("APPROVED_DATA_INICIO: '2026-01-01'");
    expect(workflow).toContain("APPROVED_DATA_FIM: '2026-09-16'");
    expect(workflow).toContain('frms-empresa6-helicopter-offshore-v2-history-0499');
    expect(workflow).toContain('frms-recalc-empresa6-v2-history-2026-0499');
    expect(executor).toContain('APPROVED_DRY_RUN_SCOPE_MISMATCH');
    expect(executor).toContain('FRMS_TARGET_REVISION_NOT_EFFECTIVE');
    expect(executor).toContain('f.empresa_id = ?');
  });

  it('recalculates only persisted recovery evidence before journey factorization and supports rollback', () => {
    expect(executor).toContain('loadRecoveryEvidenceRows');
    expect(executor).toContain('processRecoveryAssessment');
    expect(executor).toContain('computeRecoveryCredit');
    expect(executor).toContain("payload.kind === 'recovery'");
    expect(executor).toContain('FRMS_RECOVERY_TARGET_REVISION_MISMATCH');
    expect(executor).toContain('recovery_credit_total');
  });

});
