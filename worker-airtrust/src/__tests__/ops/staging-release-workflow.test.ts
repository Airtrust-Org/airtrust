import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function readWorkflow(): string {
  return readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');
}

function runScript(cmd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/** Strips comment-only lines so assertions check executable logic, not doc prose. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/)/.test(line))
    .join('\n');
}

describe('deploy-staging.yml — static guards', () => {
  const workflow = readWorkflow();

  it('only triggers on workflow_dispatch — never push/pull_request/schedule', () => {
    const onBlock = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\nconcurrency:'));
    expect(onBlock).toContain('workflow_dispatch');
    expect(onBlock).not.toMatch(/^\s*push:/m);
    expect(onBlock).not.toMatch(/^\s*pull_request:/m);
    expect(onBlock).not.toMatch(/^\s*schedule:/m);
  });

  it('uses a staging confirmation phrase distinct from the production one', () => {
    expect(workflow).toContain('STAGING_CONFIRMATION: AIRTRUST_STAGING');
    expect(workflow).toContain('confirmation must be exactly ${STAGING_CONFIRMATION}');
    // The env var value itself (not documentation prose) must never equal the
    // production confirmation phrase used by deploy-airtrust.yml.
    const envLine = workflow.match(/STAGING_CONFIRMATION:\s*(\S+)/);
    expect(envLine?.[1]).toBe('AIRTRUST_STAGING');
    expect(envLine?.[1]).not.toBe('AIRTRUST_PRODUCTION');
  });

  it('hard-blocks the production database ID and host', () => {
    expect(workflow).toContain('BLOCKED_PRODUCTION_DB_ID: 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae');
    expect(workflow).toContain('BLOCKED_PRODUCTION_HOST: api.airtrust.online');
    expect(workflow).toContain('production-target-guard');
  });

  it('requires branch main and forbids any other ref', () => {
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('only runs from refs/heads/main');
  });

  it('accepts only an exact reviewed PR head from the same repository', () => {
    for (const token of [
      'pr_number:',
      'release_sha:',
      '^[0-9a-fA-F]{40}$',
      '^[1-9][0-9]*$',
      '/pulls/${prNumber}',
      "pr.base?.ref !== 'main'",
      'PR_FROM_FORK_REJECTED',
      'OPEN_PR_HEAD_MISMATCH',
      'MERGED_PR_SHA_MISMATCH',
      'RELEASE_SHA_NOT_CURRENT_MAIN',
      'PR_NOT_OPEN_OR_MERGED',
      '/git/commits/${releaseSha}',
    ]) {
      expect(workflow).toContain(token);
    }
  });

  it('rejects a non-green release and an actor without release permission', () => {
    for (const token of [
      '/collaborators/${actor}/permission',
      "['write', 'push', 'maintain', 'admin']",
      '/check-runs?per_page=100',
      "check.status !== 'completed' || check.conclusion !== 'success'",
      '/status',
      // Per-status state check — applied only when statuses exist (empty statuses allowed)
      "status.state !== 'success'",
    ]) {
      expect(workflow).toContain(token);
    }
    // Empty statuses must not block when check-runs are green
    expect(workflow).toContain('statuses.statuses.length > 0');
    // The old aggregate statuses.state check must NOT be present — it incorrectly blocks repos with no classic statuses
    expect(workflow).not.toContain("statuses.state !== 'success'");
  });

  it('checks out the trusted release SHA into release/ and the pipeline itself from main', () => {
    // Each job that needs release code must checkout release_sha into release/
    const checkoutRefs =
      workflow.match(/ref:\s*\$\{\{ needs\.guard\.outputs\.release_sha \}\}/g) ?? [];
    expect(checkoutRefs.length).toBeGreaterThanOrEqual(6);
    expect(workflow).toContain('fetch-depth: 0');
    // Each job must also have a trusted pipeline checkout (from main, no explicit ref = default branch)
    expect(workflow).toContain('Checkout trusted pipeline (main)');
    // Release code must land in the release/ subdirectory
    expect(workflow).toContain('path: release');
    // No governance script must ever execute from release/
    expect(workflow).not.toMatch(/bash release\/scripts/);
    expect(workflow).not.toMatch(/node release\/scripts/);
  });

  it('keeps workflow and release provenance distinct', () => {
    expect(workflow).toContain('workflow_sha');
    expect(workflow).toContain('release_sha');
    expect(workflow).toContain('SOURCE_SHA: ${{ needs.guard.outputs.release_sha }}');
    expect(workflow).toContain('--commit-hash=${{ needs.guard.outputs.release_sha }}');
    expect(workflow).toContain('app_version="staging-${build_time}-${release_short_sha}"');
  });

  it('never applies the full migration chain — only allowlisted, one-at-a-time files', () => {
    expect(workflow).not.toMatch(/d1\s+migrations\s+apply/);
    expect(workflow).toContain('apply-approved-migrations.sh');
  });

  it('requires a verified backup and green preflight before any migration apply', () => {
    const applyJob = workflow.slice(
      workflow.indexOf('apply-migrations:'),
      workflow.indexOf('deploy-worker:'),
    );
    expect(applyJob).toContain('needs: [guard, production-target-guard, backup, preflight]');
    expect(applyJob).toContain("needs.backup.outputs.backup_ok == 'true'");
    expect(applyJob).toContain("needs.preflight.outputs.preflight_ok == 'true'");
  });

  it('never deploys frontend to the production Pages branch', () => {
    expect(workflow).toContain('PAGES_STAGING_BRANCH: staging');
    expect(workflow).not.toMatch(/--branch=production/);
  });

  it('validates staging worker targets with a structural parser instead of grepping the whole TOML file', () => {
    expect(workflow).toContain('python3 scripts/staging/assert-staging-worker-targets.py');
    expect(workflow).not.toContain(
      'grep -q "name = \\"${ALLOWED_STAGING_WORKER_NAME}\\"" worker-airtrust/wrangler.staging.toml',
    );
    expect(workflow).not.toContain(
      'grep -q "database_id = \\"${ALLOWED_STAGING_DB_ID}\\"" worker-airtrust/wrangler.staging.toml',
    );
  });

  it('uses the staging GitHub environment for every write-capable job', () => {
    const jobNames = [
      'backup',
      'preflight',
      'apply-migrations',
      'deploy-worker',
      'deploy-frontend',
      'smoke',
    ];
    const jobBoundaries = jobNames
      .map((name) => ({ name, index: workflow.indexOf(`\n  ${name}:`) }))
      .sort((a, b) => a.index - b.index);

    for (let i = 0; i < jobBoundaries.length; i++) {
      const { name, index } = jobBoundaries[i];
      expect(index, `job "${name}" not found in workflow`).toBeGreaterThan(-1);
      const end = i + 1 < jobBoundaries.length ? jobBoundaries[i + 1].index : workflow.length;
      const slice = workflow.slice(index, end);
      expect(slice, `${name} must declare environment: staging`).toMatch(/environment:\s*staging/);
    }
  });

  it('smoke only runs after deploy/migration succeed or are skipped, never after failure', () => {
    const smokeJob = workflow.slice(workflow.indexOf('smoke:'), workflow.indexOf('summary:'));
    expect(smokeJob).toContain('!failure()');
    expect(smokeJob).toContain('!cancelled()');
  });

  it('records workflow SHA, release SHA, actor, deployment IDs, and rollback target in the summary', () => {
    const summaryJob = workflow.slice(workflow.indexOf('summary:'));
    for (const token of [
      'WORKFLOW_SHA',
      'RELEASE_SHA',
      'github.run_id',
      'github.actor',
      'worker_version_id',
      'rollback target',
    ]) {
      expect(summaryJob).toContain(token);
    }
  });
});

describe('scripts/staging/assert-staging-worker-targets.py — resolved target guards', () => {
  const allowedArgs = [
    'scripts/staging/assert-staging-worker-targets.py',
    '--allowed-worker-name=airtrust-api-staging',
    '--blocked-production-worker-name=airtrust-api-production',
    '--allowed-db-name=airtrust-db-staging-baseline-20260701',
    '--allowed-db-id=bf9963f4-eb12-439b-a830-20bbf577ac22',
    '--blocked-production-db-id=7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
    '--allowed-bucket-name=airtrust-storage-staging',
    '--blocked-production-bucket-name=airtrust-storage',
    '--blocked-production-host=api.airtrust.online',
  ];

  function runGuard(config: string) {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-staging-guard-'));
    const configPath = join(dir, 'wrangler.toml');
    writeFileSync(configPath, config, 'utf8');
    try {
      return runScript('python3', [...allowedArgs, `--config=${configPath}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('passes when the file contains [env.production] but the resolved target is env.staging', () => {
    const result = runGuard(`
name = "airtrust-api"

[env.staging]
name = "airtrust-api-staging"

[env.staging.vars]
ENVIRONMENT = "staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"
database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"

[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"

[env.production]
name = "airtrust-api-production"

[env.production.vars]
ENVIRONMENT = "production"

[[env.production.d1_databases]]
binding = "DB"
database_name = "airtrust-db"
database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

[[env.production.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage"
preview_bucket_name = "airtrust-storage"
`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Staging deployment target validated');
  });

  it('passes for an already resolved staging-only config', () => {
    const result = runGuard(`
name = "airtrust-api-staging"

[vars]
ENVIRONMENT = "staging"

[[d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"
database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"
`);
    expect(result.status).toBe(0);
  });

  it('fails when the effective staging DB points at production', () => {
    const result = runGuard(`
[env.staging]
name = "airtrust-api-staging"

[env.staging.vars]
ENVIRONMENT = "staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"
database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"
`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('production database ID');
  });

  it('fails when the effective worker target is production', () => {
    const result = runGuard(`
[env.staging]
name = "airtrust-api-production"

[env.staging.vars]
ENVIRONMENT = "staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"
database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"

[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"
`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('worker name resolves to production');
  });

  it('fails when the effective staging config targets the production API host', () => {
    const result = runGuard(`
[env.staging]
name = "airtrust-api-staging"
routes = [{ pattern = "api.airtrust.online/*", zone_name = "airtrust.online" }]

[env.staging.vars]
ENVIRONMENT = "staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"
database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"

[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"
`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('production API host');
  });

  it('fails closed when staging is missing or undefined', () => {
    const result = runGuard(`
[env.production]
name = "airtrust-api-production"
`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[env.staging] is missing or empty');
  });

  it('cannot be bypassed by staging-looking comments', () => {
    const result = runGuard(`
# [env.staging]
# name = "airtrust-api-staging"
# [env.staging.vars]
# ENVIRONMENT = "staging"
# [[env.staging.d1_databases]]
# binding = "DB"
# database_name = "airtrust-db-staging-baseline-20260701"
# database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"
# [[env.staging.r2_buckets]]
# binding = "BUCKET"
# bucket_name = "airtrust-storage-staging"
# preview_bucket_name = "airtrust-storage-staging"

[env.production]
name = "airtrust-api-production"
`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[env.staging] is missing or empty');
  });

  it('cannot be bypassed by a staging-looking unused env.production block', () => {
    const result = runGuard(`
[env.staging]
name = "airtrust-api-staging"

[env.staging.vars]
ENVIRONMENT = "production"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db"
database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage"
preview_bucket_name = "airtrust-storage"

[env.production]
name = "airtrust-api-staging"

[env.production.vars]
ENVIRONMENT = "staging"

[[env.production.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"
database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"

[[env.production.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"
`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('vars.ENVIRONMENT resolves to production');
  });

  it('keeps the allowlist narrow instead of matching any staging-like string', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/assert-staging-worker-targets.py'),
      'utf8',
    );
    expect(source).toContain('blocked_production_worker_name');
    expect(source).toContain('production database ID');
    expect(source).not.toMatch(/contains\(['"]staging['"]\)/);
  });
});

describe('scripts/staging/backup-d1-staging.sh — guards', () => {
  it('dry-run against the allowed staging DB succeeds without --apply', () => {
    const result = runScript('bash', ['scripts/staging/backup-d1-staging.sh']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DRY-RUN');
  });

  it('refuses the production database name outright', () => {
    const result = runScript('bash', ['scripts/staging/backup-d1-staging.sh', '--apply'], {
      STAGING_D1_NAME: 'airtrust-db',
      STAGING_D1_ID: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/bloqueio|produção/);
  });

  it('refuses --apply without the confirmation env var, even against staging', () => {
    const result = runScript('bash', ['scripts/staging/backup-d1-staging.sh', '--apply']);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('CONFIRM_STAGING_BACKUP');
  });
});

describe('scripts/staging/seed-qa-examiner-training.mjs — guards', () => {
  it('dry-run succeeds and never writes', () => {
    const result = runScript('node', ['scripts/staging/seed-qa-examiner-training.mjs']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DRY_RUN');
    expect(result.stdout).toContain('qa_examiner_training');
  });

  it('is idempotent across two dry-run invocations (same fixture identity every time)', () => {
    const first = runScript('node', ['scripts/staging/seed-qa-examiner-training.mjs']);
    const second = runScript('node', ['scripts/staging/seed-qa-examiner-training.mjs']);
    expect(first.stdout).toBe(second.stdout);
  });

  it('refuses any database other than the allowlisted staging DB', () => {
    const result = runScript('node', ['scripts/staging/seed-qa-examiner-training.mjs'], {
      STAGING_D1_NAME: 'airtrust-db',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/bloqueado|produção/);
  });

  it('refuses --apply without the confirmation env var', () => {
    const result = runScript('node', ['scripts/staging/seed-qa-examiner-training.mjs', '--apply'], {
      QA_EXAMINER_ADMIN_PASSWORD: 'not-a-real-secret-fixture-only',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('CONFIRM_STAGING_QA_SEED');
  });

  it('never references Costa do Sol as a fixture identity value', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/seed-qa-examiner-training.mjs'),
      'utf8',
    );
    const executable = stripComments(source);
    expect(executable).not.toMatch(/costa do sol/i);
    expect(source).toContain('AirTrust Staging Examiner QA');
  });

  it('creates a QA setor fixture and binds seeded funcionarios to setor_id', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/seed-qa-examiner-training.mjs'),
      'utf8',
    );
    const executable = stripComments(source);
    expect(executable).toContain('INSERT INTO setores');
    expect(executable).toContain('QA-SETOR-EXA');
    expect(executable).toContain('setor_id');
  });
});

describe('scripts/staging/apply-approved-migrations.sh — guards', () => {
  it('refuses a migration not in the allowlist', () => {
    const result = runScript('bash', [
      'scripts/staging/apply-approved-migrations.sh',
      '--migration=0001_something.sql',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('não está na allowlist');
  });

  it('refuses to run without --migration', () => {
    const result = runScript('bash', ['scripts/staging/apply-approved-migrations.sh']);
    expect(result.status).not.toBe(0);
  });

  it('refuses the allowlisted migration without a verified backup file', () => {
    // Since the trust-boundary update, the script requires the full release/ path prefix.
    // Passing a bare filename is now rejected as path traversal, not as missing-backup.
    const resultBareFilename = runScript('bash', [
      'scripts/staging/apply-approved-migrations.sh',
      '--migration=0424_examiner_universal_training_fichas.sql',
    ]);
    expect(resultBareFilename.status).not.toBe(0);
    // Should be rejected due to invalid path (not the release/ prefix)
    expect((resultBareFilename.stdout + resultBareFilename.stderr).toLowerCase()).toMatch(
      /allowlist|caminho|inv.lido|path/,
    );

    // With the correct full path and a real temp file, it should fail on missing backup (not path/file error)
    const releaseMigrationsDir = join(ROOT, 'release', 'worker-airtrust', 'migrations');
    const sqlFile = join(releaseMigrationsDir, '0424_examiner_universal_training_fichas.sql');
    const createdDir = !existsSync(releaseMigrationsDir);
    try {
      if (createdDir) mkdirSync(releaseMigrationsDir, { recursive: true });
      writeFileSync(sqlFile, '-- test migration\n', 'utf8');
      const resultCorrectPath = runScript('bash', [
        'scripts/staging/apply-approved-migrations.sh',
        '--migration=release/worker-airtrust/migrations/0424_examiner_universal_training_fichas.sql',
      ]);
      expect(resultCorrectPath.status).not.toBe(0);
      expect((resultCorrectPath.stdout + resultCorrectPath.stderr).toLowerCase()).toContain(
        'backup',
      );
    } finally {
      try {
        rmSync(sqlFile, { force: true });
      } catch {}
      if (createdDir)
        try {
          rmSync(join(ROOT, 'release'), { recursive: true, force: true });
        } catch {}
    }
  });

  it('allowlists 0452/0453 narrowly and invokes their read-only postcondition validators', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/apply-approved-migrations.sh'), 'utf8');
    expect(source).toContain('0452_operational_domain_rbac.sql');
    expect(source).toContain('0453_ead_category_reconciliation_executor.sql');
    expect(source).toContain('RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453"');
    expect(source).toContain('validate-0452-postconditions.sh');
    expect(source).toContain('validate-0453-postconditions.sh');
    expect(source).not.toContain('APPROVED_MIGRATIONS=("*")');
  });

  it('never invokes `wrangler d1 migrations apply` (would replay the whole chain)', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/apply-approved-migrations.sh'), 'utf8');
    const executable = stripComments(source);
    expect(executable).not.toMatch(/d1\s+migrations\s+apply/);
  });
});

describe('scripts/staging/migration-ledger-preflight.mjs — guards', () => {
  it('refuses any target other than the allowlisted staging DB', () => {
    const result = runScript('node', ['scripts/staging/migration-ledger-preflight.mjs'], {
      STAGING_D1_NAME: 'airtrust-db',
      STAGING_D1_ID: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
    });
    expect(result.status).not.toBe(0);
  });

  it('is read-only — no wrangler write subcommand appears in the script', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/migration-ledger-preflight.mjs'),
      'utf8',
    );
    const executable = stripComments(source);
    expect(executable).not.toMatch(/d1\s+(migrations\s+apply|create|delete)/);
    expect(executable).not.toContain('INSERT INTO');
    expect(executable).not.toContain('UPDATE ');
    expect(executable).not.toContain('DELETE FROM');
  });

  it('supports a narrow release scope without widening to arbitrary filenames', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/migration-ledger-preflight.mjs'),
      'utf8',
    );
    expect(source).toContain('--scope=');
    expect(source).toContain('file.startsWith(`${token}_`)');
  });
});

describe('scripts/staging/reconcile-approved-migration-ledger.mjs — guards', () => {
  it('requires an exact confirmation phrase for --apply', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'),
      'utf8',
    );
    expect(source).toContain('AIRTRUST_STAGING_LEDGER_RECONCILIATION');
  });

  it('hard-blocks non-staging database targets through the shared allowlist', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'),
      'utf8',
    );
    expect(source).toContain('airtrust-db-staging-baseline-20260701');
    expect(source).toContain('7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae');
  });

  it('closes the allowlist to 0421, 0422, and 0423 only', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'),
      'utf8',
    );
    expect(source).toContain('0421_shared_session_segment_curricula.sql');
    expect(source).toContain('0422_modelos_sessao_requisitos.sql');
    expect(source).toContain('0423_shared_session_multi_curricula_per_participant.sql');
    expect(source).not.toContain('0424_examiner_universal_training_fichas.sql');
  });

  it('uses only explicit ledger INSERT statements and never migrations apply', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'),
      'utf8',
    );
    const executable = stripComments(source);
    expect(executable).toContain('INSERT INTO d1_migrations');
    expect(executable).not.toMatch(/d1\s+migrations\s+apply/);
  });
});

describe('scripts/staging/validate-0424-postconditions.sh — fails closed with no target', () => {
  it('refuses to run with no arguments — no silent default to the real staging DB', () => {
    const result = runScript('bash', ['scripts/staging/validate-0424-postconditions.sh']);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('--target=');
    // Regression guard: the script must never fall back to a hardcoded
    // ALLOWED_DB_NAME when no --target is given (this exact bug caused an
    // unauthorized live read against real staging D1 during PR #284 review).
    const source = readFileSync(
      join(ROOT, 'scripts/staging/validate-0424-postconditions.sh'),
      'utf8',
    );
    expect(source).not.toMatch(/db_name="\$\{1:-\$ALLOWED_DB_NAME\}"/);
  });

  it('refuses a non-allowlisted --target', () => {
    const result = runScript('bash', [
      'scripts/staging/validate-0424-postconditions.sh',
      '--target=airtrust-db',
    ]);
    expect(result.status).not.toBe(0);
  });
});

describe('scripts/staging/validate-0452-postconditions.sh — staging-only read-only guard', () => {
  it('fails closed without an explicit staging target', () => {
    const result = runScript('bash', ['scripts/staging/validate-0452-postconditions.sh']);
    expect(result.status).not.toBe(0);
  });

  it('contains all 0452 invariants and no mutating SQL', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/validate-0452-postconditions.sh'),
      'utf8',
    );
    const executable = stripComments(source);
    for (const token of [
      'airtrust-db-staging-baseline-20260701',
      'dominios_operacionais',
      'operational_domain_rbac_enabled',
      'idx_setores_dominio_codigo',
      'idx_qualificacoes_categorias_dominio_codigo',
      'idx_lms_cursos_dominio_codigo',
    ])
      expect(source).toContain(token);
    expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/);
  });
});

describe('scripts/staging/validate-0453-postconditions.sh — staging-only read-only guard', () => {
  it('fails closed without an explicit staging target', () => {
    const result = runScript('bash', ['scripts/staging/validate-0453-postconditions.sh']);
    expect(result.status).not.toBe(0);
  });

  it('checks the ledger schema, partial unique index, and empty pre-run state without DML', () => {
    const source = readFileSync(
      join(ROOT, 'scripts/staging/validate-0453-postconditions.sh'),
      'utf8',
    );
    const executable = stripComments(source);
    for (const token of [
      'ead_category_reconciliation_runs',
      'idx_ead_category_reconciliation_single_active',
      'CHECK (empresa_id = 6)',
      'APPLIED',
      'ROLLED_BACK',
      'PRAGMA table_info(ead_category_reconciliation_runs)',
      'SELECT COUNT(*) AS n FROM ead_category_reconciliation_runs',
      'qualificacoes_categorias',
      'qualificacoes_tipos',
      'historico_qualificacoes',
      'lms_cursos',
    ])
      expect(source).toContain(token);
    expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/);
  });
});

describe('deploy-staging.yml — no free-text workflow_dispatch input spliced directly into a run: body', () => {
  it('every `run:` step block references inputs/github context only via env:, never via ${{ }} inline', () => {
    const workflow = readWorkflow();
    // Split into step blocks and, for each `run: |` body, confirm it contains
    // no `${{ inputs.` or `${{ github.` — those values must arrive as $VAR
    // through an `env:` block instead (GitHub Actions renders ${{ }} into the
    // generated shell script before bash parses it — splicing free-text
    // workflow_dispatch input there is a script-injection hole).
    const runBlocks = [
      ...workflow.matchAll(
        /run:\s*\|\n([\s\S]*?)(?=\n\s{0,10}- name:|\n\s{0,10}- id:|\n\s{0,8}[a-z0-9-]+:\n|$)/g,
      ),
    ].map((m) => m[1]);
    expect(runBlocks.length).toBeGreaterThan(5);
    for (const block of runBlocks) {
      expect(block).not.toMatch(/\$\{\{\s*inputs\./);
      expect(block).not.toMatch(/\$\{\{\s*github\./);
    }
  });

  it('declares a minimal top-level permissions block', () => {
    const workflow = readWorkflow();
    expect(workflow).toMatch(/^permissions:\s*\n\s*contents:\s*read/m);
    expect(workflow).toMatch(/^\s*pull-requests:\s*read/m);
    expect(workflow).toMatch(/^\s*checks:\s*read/m);
    expect(workflow).not.toMatch(/^\s*\w+:\s*write\s*$/m);
  });
});

describe('scripts/staging/smoke-examiner-training.mjs — matches the real POST /sessoes contract', () => {
  it('uses horario_inicio/horario_fim (never hora_inicio/hora_fim) for the simple-session create call', () => {
    // worker-airtrust/src/routes/simuladores-sessoes.ts destructures
    // horario_inicio/horario_fim, not hora_inicio/hora_fim — the wrong field
    // names produce a guaranteed 400 on every real run (found in PR #284
    // review) and were silently masking scenarios C/D/G as skipped-not-failed.
    const source = readFileSync(join(ROOT, 'scripts/staging/smoke-examiner-training.mjs'), 'utf8');
    const bIndex = source.indexOf("'/api/simuladores/sessoes'");
    const bBlock = source.slice(bIndex, bIndex + 500);
    expect(bBlock).toContain('horario_inicio');
    expect(bBlock).toContain('horario_fim');
    expect(bBlock).not.toMatch(/[^_]hora_inicio/);
    expect(bBlock).toContain('simulador_id');
    expect(bBlock).toContain('instrutor_id');
    expect(bBlock).toContain('participantes');
  });

  it('resolves the PDF ficha via agendamento_slot_id, never a nonexistent sessao_id query param', () => {
    // GET /api/simuladores/fichas only accepts status/tipo_sessao query
    // params (worker-airtrust/src/routes/simuladores-fichas.ts) — there is no
    // sessao_id filter. Guessing one would silently return an unscoped list
    // and could pick the wrong ficha's PDF (false ok:true).
    const source = readFileSync(join(ROOT, 'scripts/staging/smoke-examiner-training.mjs'), 'utf8');
    expect(source).not.toContain('fichas?sessao_id=');
    expect(source).toContain('agendamento_slot_id');
  });

  it('does not assert a server-side EXA-model filter that the backend never enforces', () => {
    // GET /api/simuladores/modelos-sessao has no program/capability filter —
    // EXA-V0x visibility outside the examiner program is frontend-only.
    const source = readFileSync(join(ROOT, 'scripts/staging/smoke-examiner-training.mjs'), 'utf8');
    const eIndex = source.indexOf('E_generic_program_hides_examiner');
    const eBlock = source.slice(Math.max(0, eIndex - 400), eIndex + 200);
    expect(eBlock).toMatch(/ok:\s*null/);
    expect(eBlock).toContain('semiautomated');
  });
});

describe('FASE 5 - Independent Secrets & Validator Iteration', () => {
  const workflow = readWorkflow();

  it('1. guard não acessa secrets de staging', () => {
    const guardJob = workflow.slice(
      workflow.indexOf('\n  guard:'),
      workflow.indexOf('\n  production-target-guard:'),
    );
    expect(guardJob).not.toContain('CLOUDFLARE_D1_BACKUP_API_TOKEN');
    expect(guardJob).not.toContain('CLOUDFLARE_D1_MIGRATION_API_TOKEN');
    expect(guardJob).not.toContain('CLOUDFLARE_WORKER_API_TOKEN');
    expect(guardJob).not.toContain('CLOUDFLARE_PAGES_API_TOKEN');
  });

  it('2. cada secret é lido em job independente com environment staging', () => {
    const backupJob = workflow.slice(
      workflow.indexOf('\n  check-d1-backup-token:'),
      workflow.indexOf('\n  check-d1-migration-token:'),
    );
    expect(backupJob).toContain('environment: staging');
    expect(backupJob).toContain('secrets.CLOUDFLARE_D1_BACKUP_API_TOKEN');

    const migrationJob = workflow.slice(
      workflow.indexOf('\n  check-d1-migration-token:'),
      workflow.indexOf('\n  check-worker-token:'),
    );
    expect(migrationJob).toContain('environment: staging');
    expect(migrationJob).toContain('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN');

    const workerJob = workflow.slice(
      workflow.indexOf('\n  check-worker-token:'),
      workflow.indexOf('\n  check-pages-token:'),
    );
    expect(workerJob).toContain('environment: staging');
    expect(workerJob).toContain('secrets.CLOUDFLARE_WORKER_API_TOKEN');

    const pagesJob = workflow.slice(
      workflow.indexOf('\n  check-pages-token:'),
      workflow.indexOf('\n  cloudflare-secret-readiness-gate:'),
    );
    expect(pagesJob).toContain('environment: staging');
    expect(pagesJob).toContain('secrets.CLOUDFLARE_PAGES_API_TOKEN');
  });

  it('3. nenhum step combina Worker e Pages tokens', () => {
    // Assert no block contains both secrets in the whole workflow
    const lines = workflow.split('\n');
    let currentJob = '';
    let currentJobText = '';
    for (const line of lines) {
      if (line.match(/^  [a-zA-Z0-9-]+:/)) {
        if (currentJobText) {
          const hasWorker = currentJobText.includes('CLOUDFLARE_WORKER_API_TOKEN');
          const hasPages = currentJobText.includes('CLOUDFLARE_PAGES_API_TOKEN');
          expect(hasWorker && hasPages).toBe(false);
        }
        currentJob = line;
        currentJobText = '';
      } else {
        currentJobText += line + '\n';
      }
    }
  });

  it('4. nenhum step combina backup e migration tokens', () => {
    const lines = workflow.split('\n');
    let currentJob = '';
    let currentJobText = '';
    for (const line of lines) {
      if (line.match(/^  [a-zA-Z0-9-]+:/)) {
        if (currentJobText) {
          const hasBackup = currentJobText.includes('CLOUDFLARE_D1_BACKUP_API_TOKEN');
          const hasMigrate = currentJobText.includes('CLOUDFLARE_D1_MIGRATION_API_TOKEN');
          expect(hasBackup && hasMigrate).toBe(false);
        }
        currentJob = line;
        currentJobText = '';
      } else {
        currentJobText += line + '\n';
      }
    }
  });

  it('5. secret ausente bloqueia antes de qualquer deploy', () => {
    const readinessGate = workflow.slice(
      workflow.indexOf('\n  cloudflare-secret-readiness-gate:'),
      workflow.indexOf('\n  backup:'),
    );
    expect(readinessGate).toContain('secret_gate_ok=$ok');
    const writeGate = workflow.slice(
      workflow.indexOf('\n  release-write-gate:'),
      workflow.indexOf('\n  deploy-worker:'),
    );
    expect(writeGate).toContain(
      'needs: [cloudflare-secret-readiness-gate, backup, preflight, apply-migrations, postconditions]',
    );
    expect(writeGate).toContain(
      'SECRET_GATE_OK: ${{ needs.cloudflare-secret-readiness-gate.outputs.secret_gate_ok }}',
    );
    expect(writeGate).toContain('if [[ "$SECRET_GATE_OK" != "true" ]]; then');
  });

  it('6/7/8. condicionalidade dos inputs para a validação dos tokens', () => {
    const readinessGate = workflow.slice(
      workflow.indexOf('\n  cloudflare-secret-readiness-gate:'),
      workflow.indexOf('\n  backup:'),
    );
    expect(readinessGate).toContain('if [[ "$APPLY_MIGRATIONS" == "true" ]]; then');
    expect(readinessGate).toContain(
      'if [[ "$DEPLOY_WORKER" == "true" && "$WORKER_TOKEN_RESULT" != "success" ]]',
    );
    expect(readinessGate).toContain(
      'if [[ "$DEPLOY_FRONTEND" == "true" && "$PAGES_TOKEN_RESULT" != "success" ]]',
    );
  });

  it('9/10. postconditions intera sobre APPROVED_MIGRATIONS e usa script flexível', () => {
    const postconditionsJob = workflow.slice(
      workflow.indexOf('\n  postconditions:'),
      workflow.indexOf('\n  release-write-gate:'),
    );
    expect(postconditionsJob).toContain('for migration in $APPROVED_MIGRATIONS; do');
    expect(postconditionsJob).toContain(
      'validator="scripts/staging/validate-${prefix}-postconditions.sh"',
    );
    expect(postconditionsJob).toContain('bash "$validator" --target="${ALLOWED_STAGING_DB_NAME}"');
    expect(postconditionsJob).not.toContain('validate-0452-postconditions.sh');
  });

  it('11/12/13. smoke aguarda Worker e Pages de forma segura', () => {
    const smokeJob = workflow.slice(
      workflow.indexOf('\n  smoke:'),
      workflow.indexOf('\n  summary:'),
    );
    expect(smokeJob).toContain(
      'needs: [guard, production-target-guard, release-write-gate, deploy-worker, deploy-frontend]',
    );
    expect(smokeJob).toContain(
      "(inputs.deploy_worker == false || needs.deploy-worker.result == 'success')",
    );
    expect(smokeJob).toContain(
      "(inputs.deploy_frontend == false || needs.deploy-frontend.result == 'success')",
    );
    expect(smokeJob).toContain('!failure()');
    expect(smokeJob).toContain("needs.release-write-gate.outputs.write_gate_ok == 'true'");
  });

  it('14. apply_migrations=false + write_gate_ok=true permite Worker e Pages (sobrevive a skips intencionais)', () => {
    const workerJob = workflow.slice(
      workflow.indexOf('\n  deploy-worker:'),
      workflow.indexOf('\n  deploy-frontend:'),
    );
    expect(workerJob).toContain('always()');
    expect(workerJob).toContain('!cancelled()');
    expect(workerJob).toContain("needs.release-write-gate.outputs.write_gate_ok == 'true'");
    expect(workerJob).toContain('inputs.deploy_worker');

    const frontendJob = workflow.slice(
      workflow.indexOf('\n  deploy-frontend:'),
      workflow.indexOf('\n  smoke:'),
    );
    expect(frontendJob).toContain('always()');
    expect(frontendJob).toContain('!cancelled()');
    expect(frontendJob).toContain("needs.release-write-gate.outputs.write_gate_ok == 'true'");
    expect(frontendJob).toContain('inputs.deploy_frontend');
  });

  it('15. write_gate_ok=false ou cancelled bloqueia Worker e Pages', () => {
    const workerJob = workflow.slice(
      workflow.indexOf('\n  deploy-worker:'),
      workflow.indexOf('\n  deploy-frontend:'),
    );
    expect(workerJob).toContain("needs.release-write-gate.outputs.write_gate_ok == 'true'");
    expect(workerJob).toContain('!cancelled()');

    const frontendJob = workflow.slice(
      workflow.indexOf('\n  deploy-frontend:'),
      workflow.indexOf('\n  smoke:'),
    );
    expect(frontendJob).toContain("needs.release-write-gate.outputs.write_gate_ok == 'true'");
    expect(frontendJob).toContain('!cancelled()');
  });

  it('16. smoke roda após Worker e Pages verdes, bloqueado após falha', () => {
    const smokeJob = workflow.slice(
      workflow.indexOf('\n  smoke:'),
      workflow.indexOf('\n  summary:'),
    );
    expect(smokeJob).toContain("needs.deploy-worker.result == 'success'");
    expect(smokeJob).toContain("needs.deploy-frontend.result == 'success'");
    expect(smokeJob).toContain('!failure()');
    expect(smokeJob).toContain('!cancelled()');
    expect(smokeJob).toContain("needs.release-write-gate.outputs.write_gate_ok == 'true'");
  });
});
