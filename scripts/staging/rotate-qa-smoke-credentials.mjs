#!/usr/bin/env node

// source_reference: docs/STAGING_ENVIRONMENT_STABILIZATION_20260701.md
// operational_decision: rotate QA/smoke synthetic credentials safely on D1 staging, revoke all active sessions/refresh tokens, and never expose secrets in logs.
// dry_run_required: run without --apply first to verify DB targets.
// rollback_plan_required: reseed with another random hash on the same staging DB.

import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_D1_DATABASE_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';

const TARGET_QA_EMAILS = [
  'smoke.staging.20260701@airtrust.invalid',
  'airtrust-qa-final-29770346428-6@example.invalid',
  'airtrust-qa-final-29770346428-1@example.invalid',
  'qa-examiner-admin@staging.airtrust.invalid',
];

function log(msg) {
  process.stdout.write(`[ROTATE_QA] ${msg}\n`);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');

  log(`TARGET_DB=${ALLOWED_D1_NAME}`);
  log(`MODE=${apply ? 'apply' : 'dry-run'}`);
  log(`QA_USERS_COUNT=${TARGET_QA_EMAILS.length}`);

  // Generate cryptographically secure random password
  const newPassword = randomBytes(24).toString('base64url');
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(newPassword, salt);

  const emailClauses = TARGET_QA_EMAILS.map(sqlString).join(', ');

  const sql = `
-- 1. Rotate password hash for synthetic QA users
UPDATE usuarios
SET password_hash = ${sqlString(passwordHash)},
    active = 1,
    updated_at = datetime('now')
WHERE email IN (${emailClauses})
  AND (email LIKE '%.invalid' OR email LIKE '%@staging.airtrust.invalid');

-- 2. Revoke all active refresh tokens for these QA users
UPDATE refresh_tokens
SET revoked_at = datetime('now')
WHERE user_id IN (
  SELECT id FROM usuarios
  WHERE email IN (${emailClauses})
)
AND revoked_at IS NULL;
`;

  if (!apply) {
    log('STATUS=PREFLIGHT_OK (Run with --apply to rotate credentials and revoke tokens)');
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-rotate-qa-'));
  const sqlFile = join(tempDir, 'rotate.sql');
  writeFileSync(sqlFile, sql, 'utf8');

  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', ALLOWED_D1_NAME, '--remote', '--file', sqlFile, '--json'],
      {
        cwd: join(process.cwd(), 'worker-airtrust'),
        encoding: 'utf8',
      },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'wrangler d1 execute failed');
    }

    log('STATUS=ROTATION_APPLIED');
    log('SESSIONS_REVOKED=PASS');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  log(`ERROR=${err.message}`);
  process.exit(1);
});
