import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain('only runs from refs/heads/main');
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

  it('uses the staging GitHub environment for every write-capable job', () => {
    const jobNames = ['backup', 'preflight', 'apply-migrations', 'deploy-worker', 'deploy-frontend', 'smoke'];
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

  it('records SHA, run ID, actor, deployment IDs, and rollback target in the summary', () => {
    const summaryJob = workflow.slice(workflow.indexOf('summary:'));
    for (const token of ['github.sha', 'github.run_id', 'github.actor', 'worker_version_id', 'rollback target']) {
      expect(summaryJob).toContain(token);
    }
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
    const result = runScript('node', [
      'scripts/staging/seed-qa-examiner-training.mjs',
      '--apply',
    ], { QA_EXAMINER_ADMIN_PASSWORD: 'not-a-real-secret-fixture-only' });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('CONFIRM_STAGING_QA_SEED');
  });

  it('never references Costa do Sol as a fixture identity value', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/seed-qa-examiner-training.mjs'), 'utf8');
    const executable = stripComments(source);
    expect(executable).not.toMatch(/costa do sol/i);
    expect(source).toContain('AirTrust Staging Examiner QA');
  });

  it('creates a QA setor fixture and binds seeded funcionarios to setor_id', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/seed-qa-examiner-training.mjs'), 'utf8');
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
    const result = runScript('bash', [
      'scripts/staging/apply-approved-migrations.sh',
      '--migration=0424_examiner_universal_training_fichas.sql',
    ]);
    expect(result.status).not.toBe(0);
    expect((result.stdout + result.stderr).toLowerCase()).toContain('backup');
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
    const source = readFileSync(join(ROOT, 'scripts/staging/migration-ledger-preflight.mjs'), 'utf8');
    const executable = stripComments(source);
    expect(executable).not.toMatch(/d1\s+(migrations\s+apply|create|delete)/);
    expect(executable).not.toContain('INSERT INTO');
    expect(executable).not.toContain('UPDATE ');
    expect(executable).not.toContain('DELETE FROM');
  });

  it('supports a narrow release scope without widening to arbitrary filenames', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/migration-ledger-preflight.mjs'), 'utf8');
    expect(source).toContain('--scope=');
    expect(source).toContain("file.startsWith(`${token}_`)");
  });
});

describe('scripts/staging/reconcile-approved-migration-ledger.mjs — guards', () => {
  it('requires an exact confirmation phrase for --apply', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'), 'utf8');
    expect(source).toContain('AIRTRUST_STAGING_LEDGER_RECONCILIATION');
  });

  it('hard-blocks non-staging database targets through the shared allowlist', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'), 'utf8');
    expect(source).toContain('airtrust-db-staging-baseline-20260701');
    expect(source).toContain('7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae');
  });

  it('closes the allowlist to 0421, 0422, and 0423 only', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'), 'utf8');
    expect(source).toContain('0421_shared_session_segment_curricula.sql');
    expect(source).toContain('0422_modelos_sessao_requisitos.sql');
    expect(source).toContain('0423_shared_session_multi_curricula_per_participant.sql');
    expect(source).not.toContain('0424_examiner_universal_training_fichas.sql');
  });

  it('uses only explicit ledger INSERT statements and never migrations apply', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/reconcile-approved-migration-ledger-lib.mjs'), 'utf8');
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
    const source = readFileSync(join(ROOT, 'scripts/staging/validate-0424-postconditions.sh'), 'utf8');
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

describe('deploy-staging.yml — no free-text workflow_dispatch input spliced directly into a run: body', () => {
  it('every `run:` step block references inputs/github context only via env:, never via ${{ }} inline', () => {
    const workflow = readWorkflow();
    // Split into step blocks and, for each `run: |` body, confirm it contains
    // no `${{ inputs.` or `${{ github.` — those values must arrive as $VAR
    // through an `env:` block instead (GitHub Actions renders ${{ }} into the
    // generated shell script before bash parses it — splicing free-text
    // workflow_dispatch input there is a script-injection hole).
    const runBlocks = [...workflow.matchAll(/run:\s*\|\n([\s\S]*?)(?=\n\s{0,10}- name:|\n\s{0,8}[a-z-]+:\n|$)/g)].map(
      (m) => m[1],
    );
    expect(runBlocks.length).toBeGreaterThan(5);
    for (const block of runBlocks) {
      expect(block).not.toMatch(/\$\{\{\s*inputs\./);
      expect(block).not.toMatch(/\$\{\{\s*github\./);
    }
  });

  it('declares a minimal top-level permissions block', () => {
    const workflow = readWorkflow();
    expect(workflow).toMatch(/^permissions:\s*\n\s*contents:\s*read/m);
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
