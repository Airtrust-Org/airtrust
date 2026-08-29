#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';
import { buildLedgerAppliedSql } from '../../worker-airtrust/scripts/lib/migration-remote-apply.mjs';

const SAFE_SHA = /^[0-9a-f]{40}$/;

export const EDB_SCHEMA_V2_MANIFEST_BY_MIGRATION = Object.freeze({
  '0477_edb_operational_core.sql': 'edb-operational-core-0477.json',
  '0478_edb_anac_receipt_integrity.sql': 'edb-anac-receipt-integrity-0478.json',
  '0479_edb_relational_integrity.sql': 'edb-relational-integrity-0479.json',
  '0480_edb_diary_lifecycle_integrity.sql': 'edb-diary-lifecycle-integrity-0480.json',
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(message);
}

/**
 * Builds the exact staging apply file for eDB 0477-0480.
 *
 * The reviewed Schema V2 builder validates manifest/SQL/plan hashes and adds
 * airtrust_schema_changes_v2. This helper additionally proves that the classic
 * migration copy is byte-identical to the reviewed Schema V2 SQL, then appends
 * the d1_migrations ledger entry to the same remote --file payload.
 */
export function buildEdbDualLedgerApply({ releaseRoot, migrationName, releaseSha, outputPath }) {
  const manifestName = EDB_SCHEMA_V2_MANIFEST_BY_MIGRATION[migrationName];
  if (!manifestName) fail(`EDB_DUAL_LEDGER_MIGRATION_NOT_ALLOWLISTED:${migrationName}`);
  if (!SAFE_SHA.test(releaseSha)) fail('EDB_DUAL_LEDGER_RELEASE_SHA_INVALID');

  const root = resolve(releaseRoot);
  const migrationPath = join(root, 'worker-airtrust', 'migrations', migrationName);
  const manifestPath = join(root, 'worker-airtrust', 'schema-v2', manifestName);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (typeof manifest.changeId !== 'string' || !manifest.changeId.trim()) {
    fail('EDB_DUAL_LEDGER_CHANGE_ID_INVALID');
  }
  if (typeof manifest.baselineId !== 'string' || !manifest.baselineId.trim()) {
    fail('EDB_DUAL_LEDGER_BASELINE_ID_INVALID');
  }
  if (typeof manifest.filePath !== 'string' || basename(manifest.filePath) !== migrationName) {
    fail('EDB_DUAL_LEDGER_SCHEMA_FILE_MISMATCH');
  }

  const migrationSql = readFileSync(migrationPath);
  const reviewedSql = readFileSync(join(root, manifest.filePath));
  if (!migrationSql.equals(reviewedSql)) fail('EDB_DUAL_LEDGER_SQL_COPIES_DIFFER');
  if (sha256(migrationSql) !== manifest.fileHash) fail('EDB_DUAL_LEDGER_MIGRATION_HASH_MISMATCH');

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-edb-schema-v2-'));
  const reviewedOutput = join(tempDir, 'reviewed-schema-v2.sql');
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    const reviewed = buildReviewedSchemaApply({
      manifestPath,
      outputPath: reviewedOutput,
      expectedChangeId: manifest.changeId,
      githubSha: releaseSha,
    });
    const reviewedBundle = readFileSync(reviewedOutput, 'utf8');
    const dualLedgerBundle = buildLedgerAppliedSql({
      migrationSql: reviewedBundle,
      migrationName,
    });
    writeFileSync(resolve(outputPath), dualLedgerBundle, { encoding: 'utf8', mode: 0o600 });
    return {
      migrationName,
      changeId: reviewed.changeId,
      baselineId: reviewed.baselineId,
      fileHash: reviewed.fileHash,
      planHash: reviewed.planHash,
      manifestHash: reviewed.manifestHash,
      releaseSha,
      outputPath: resolve(outputPath),
    };
  } finally {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [releaseRoot, migrationName, releaseSha, outputPath] = process.argv.slice(2);
  if (!releaseRoot || !migrationName || !releaseSha || !outputPath) {
    fail(
      'usage: build-edb-dual-ledger-apply.mjs <release-root> <migration-name> <release-sha> <output-path>',
    );
  }
  const result = buildEdbDualLedgerApply({ releaseRoot, migrationName, releaseSha, outputPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
