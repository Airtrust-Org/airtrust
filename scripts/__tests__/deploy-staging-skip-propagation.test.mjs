import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Regression coverage for the 2026-08-25 staging run 32891294444 bug: with
// deploy_worker=false, deploy_frontend=false, run_smoke=false and
// apply_migrations=true, the migration chain (backup/preflight/
// apply-migrations/postconditions) was silently skipped even though every
// condition that mattered was satisfied, because each job's `if:` relied on
// GitHub Actions' implicit success()-of-all-direct-needs check instead of
// checking each upstream result explicitly. That implicit check treats a
// *skipped* direct need the same as a failed one.

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const workflow = readFileSync(path.join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');

function jobBlock(jobId) {
  const jobHeaderRe = new RegExp(`\\n  ${jobId}:\\n`);
  const start = workflow.search(jobHeaderRe);
  assert.notEqual(start, -1, `job "${jobId}" not found in deploy-staging.yml`);
  const rest = workflow.slice(start + 1);
  const nextJob = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

test('optional per-flag check jobs can be skipped without disabling the migration path', () => {
  // The tokens for deploy/pages/smoke are only checked when their own flags
  // are set — so with apply_migrations=true and the other flags false, they
  // are legitimately skipped, and every downstream job must tolerate that.
  assert.match(jobBlock('check-worker-token'), /if: \$\{\{ inputs\.deploy_worker \}\}/);
  assert.match(jobBlock('check-pages-token'), /if: \$\{\{ inputs\.deploy_frontend \}\}/);
  assert.match(jobBlock('check-smoke-secrets'), /if: \$\{\{ inputs\.run_smoke \}\}/);
});

test('cloudflare-secret-readiness-gate always evaluates, even with skipped optional token checks', () => {
  assert.match(jobBlock('cloudflare-secret-readiness-gate'), /if: always\(\)/);
});

for (const jobId of ['backup', 'preflight', 'apply-migrations', 'postconditions']) {
  test(`${jobId} job explicitly checks always() and every upstream .result, not implicit success()`, () => {
    const block = jobBlock(jobId);
    assert.match(block, /if: >-\s*\n\s*\$\{\{\s*\n\s*always\(\)\s*&&/, `${jobId} must open its if: with always() &&`);
    assert.match(block, /needs\.guard\.result == 'success'/, `${jobId} must explicitly check needs.guard.result`);
    assert.match(
      block,
      /needs\.production-target-guard\.result == 'success'/,
      `${jobId} must explicitly check needs.production-target-guard.result`,
    );
  });
}

test('backup gates on the secret readiness gate result and its computed ok flag', () => {
  const block = jobBlock('backup');
  assert.match(block, /needs\.cloudflare-secret-readiness-gate\.result == 'success'/);
  assert.match(block, /needs\.cloudflare-secret-readiness-gate\.outputs\.secret_gate_ok == 'true'/);
});

test('preflight gates on backup succeeding with backup_ok=true', () => {
  const block = jobBlock('preflight');
  assert.match(block, /needs\.backup\.result == 'success'/);
  assert.match(block, /needs\.backup\.outputs\.backup_ok == 'true'/);
});

test('apply-migrations gates on both backup and preflight succeeding with their ok flags', () => {
  const block = jobBlock('apply-migrations');
  assert.match(block, /needs\.backup\.result == 'success'/);
  assert.match(block, /needs\.backup\.outputs\.backup_ok == 'true'/);
  assert.match(block, /needs\.preflight\.result == 'success'/);
  assert.match(block, /needs\.preflight\.outputs\.preflight_ok == 'true'/);
});

test('postconditions gates on apply-migrations succeeding', () => {
  const block = jobBlock('postconditions');
  assert.match(block, /needs\.apply-migrations\.result == 'success'/);
});

test('a real failure anywhere in the migration chain still blocks release-write-gate (fail-closed)', () => {
  const block = jobBlock('release-write-gate');
  assert.match(block, /if: always\(\)/);
  // Any non-"success" result for backup/preflight/migration/postconditions
  // (whether skipped due to an upstream failure, or genuinely failed) must
  // still leave write_gate_ok=false.
  assert.match(
    block,
    /\("\$BACKUP_RESULT" == "success" && "\$PREFLIGHT_RESULT" == "success" && "\$MIGRATION_RESULT" == "success" && "\$POSTCONDITIONS_RESULT" == "success"\)/,
  );
});
