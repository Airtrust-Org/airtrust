import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// HEALTH P0-08 / #477 — architectural guard.
//
// scripts/staging/apply-approved-migrations.sh used to allowlist a migration
// and then, for anything not explicitly routed to a dedicated runner, fall
// through to a bare `wrangler d1 execute --remote --file=` call guarded only
// by a preflight and an ad hoc per-migration postcondition check. That path
// had no ledger/recovery-point atomicity and no idempotent
// already-applied-is-a-no-op check — unlike the governed runner used for the
// reviewed 0467-0476 schema migrations.
//
// This test proves the hybrid/legacy fallback cannot silently return: every
// name declared in APPROVED_MIGRATIONS must be reachable only through a
// dispatch branch that `exec`s into another script, and the bare
// `wrangler d1 execute ... --file="../$migration_path"` call signature must
// not exist anywhere in the file.

const ROOT = join(__dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line.trim()))
    .join('\n');
}

describe('scripts/staging/apply-approved-migrations.sh — no hybrid/legacy replay path', () => {
  const source = read('scripts/staging/apply-approved-migrations.sh');
  const executable = stripComments(source);

  it('never executes a bare wrangler d1 call against the raw migration path', () => {
    expect(executable).not.toContain('--file="../$migration_path"');
    expect(executable).not.toMatch(/wrangler\s+d1\s+execute\s+"\$db_name"\s+--remote\s+--file=/);
    expect(executable).not.toMatch(/d1\s+migrations\s+apply/);
  });

  it('routes every allowlisted migration to a dedicated or governed runner script', () => {
    const listMatch = source.match(/APPROVED_MIGRATIONS=\(([^)]*)\)/);
    expect(listMatch).not.toBeNull();
    const names = Array.from(listMatch![1].matchAll(/"([^"]+\.sql)"/g)).map((m) => m[1]);
    // Guard against the extraction itself silently matching nothing.
    expect(names.length).toBeGreaterThanOrEqual(16);

    const branches = source
      .split(/(?=if \[\[ "\$migration_basename")/g)
      .filter((chunk) => chunk.startsWith('if [[ "$migration_basename"'));
    expect(branches.length).toBeGreaterThan(0);

    for (const name of names) {
      const branch = branches.find((chunk) => chunk.includes(`"${name}"`));
      expect(branch, `expected a dispatch branch routing ${name} to a runner`).toBeTruthy();
      expect(
        branch,
        `expected the branch for ${name} to exec into a dedicated/governed runner`,
      ).toMatch(/exec bash "\$ROOT\/scripts\/staging\/[^"]+\.sh"/);
    }
  });

  it('fails closed with a drift error if an allowlisted name reaches the end unrouted', () => {
    // The last statement in the file must be a hard failure, not a fallback
    // apply — this is what makes a future allowlist/dispatch drift loud
    // instead of silently executing an unrouted, non-ledger-aware migration.
    const trimmed = executable.trim();
    expect(trimmed.endsWith('exit 1')).toBe(true);
    expect(source).toContain('drift allowlist/dispatch');
  });
});

describe('scripts/staging/apply-approved-migration-with-recovery-point.sh — absorbs the former hybrid-path migrations', () => {
  const recoveryRunner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');

  it.each([
    '0424_examiner_universal_training_fichas.sql',
    '0425_examiner_event_models_and_assignment_owned_fichas.sql',
    '0452_operational_domain_rbac.sql',
    '0457_qualification_category_lms_contract.sql',
    '0459_sk76_periodic_code_denominator.sql',
  ])('allowlists %s', (name) => {
    expect(recoveryRunner).toContain(`"${name}"`);
  });

  it('checks the d1_migrations ledger before ever writing, for an idempotent already-applied path', () => {
    expect(recoveryRunner).toContain('read_ledger_count');
    expect(recoveryRunner).toContain('MIGRATION_ALREADY_APPLIED_AND_VALIDATED');
    expect(recoveryRunner).toContain('RECOVERY_POINT_CAPTURED=false');
  });

  it('captures a D1 Time Travel recovery point before the one remote write it performs', () => {
    const recoveryIndex = recoveryRunner.indexOf('d1 time-travel info');
    const writeIndex = recoveryRunner.indexOf('--file="$combined_sql"');
    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(recoveryIndex);
  });
});
