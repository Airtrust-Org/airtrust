#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';
import { buildLedgerAppliedSql } from '../../worker-airtrust/scripts/lib/migration-remote-apply.mjs';

const MIGRATION_NAME = '0438_controle_voos_rdv_coordenacao_workflow.sql';
const MANIFEST_NAME = '0438-rdv-coordination-workflow-production.json';
const CHANGE_ID = '0438-rdv-coordination-workflow-production';
const SAFE_SHA = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function build0438DualLedgerApply({ releaseRoot, releaseSha, outputPath }) {
  if (!SAFE_SHA.test(releaseSha)) fail('RDV_0438_RELEASE_SHA_INVALID');

  const root = resolve(releaseRoot);
  const migrationPath = join(root, 'worker-airtrust', 'migrations', MIGRATION_NAME);
  const manifestPath = join(root, 'worker-airtrust', 'schema-v2', MANIFEST_NAME);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (manifest.changeId !== CHANGE_ID) fail('RDV_0438_CHANGE_ID_MISMATCH');
  if (manifest.filePath !== `worker-airtrust/schema-v2/changes/${MIGRATION_NAME}`) {
    fail('RDV_0438_SCHEMA_FILE_MISMATCH');
  }

  const migrationSql = readFileSync(migrationPath);
  const reviewedSql = readFileSync(join(root, manifest.filePath));
  if (!migrationSql.equals(reviewedSql)) fail('RDV_0438_SQL_COPIES_DIFFER');
  if (sha256(migrationSql) !== manifest.fileHash) fail('RDV_0438_SQL_HASH_MISMATCH');

  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-rdv-0438-schema-v2-'));
  const reviewedOutput = join(tempDir, 'reviewed-schema-v2.sql');
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    const reviewed = buildReviewedSchemaApply({
      manifestPath,
      outputPath: reviewedOutput,
      expectedChangeId: CHANGE_ID,
      githubSha: releaseSha,
    });

    const bootstrap = readFileSync(
      join(root, 'worker-airtrust', 'schema-v2', 'bootstrap', '0000_initialize_schema_ledger_v2.sql'),
      'utf8',
    );
    const reviewedBundle = readFileSync(reviewedOutput, 'utf8');
    const combined = buildLedgerAppliedSql({
      migrationSql: `${bootstrap}\n\n${reviewedBundle}`,
      migrationName: MIGRATION_NAME,
    });
    writeFileSync(resolve(outputPath), combined, { encoding: 'utf8', mode: 0o600 });

    return {
      migrationName: MIGRATION_NAME,
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
  const [releaseRoot, releaseSha, outputPath] = process.argv.slice(2);
  if (!releaseRoot || !releaseSha || !outputPath) {
    fail('usage: build-0438-dual-ledger-apply.mjs <release-root> <release-sha> <output-path>');
  }
  process.stdout.write(`${JSON.stringify(build0438DualLedgerApply({ releaseRoot, releaseSha, outputPath }))}\n`);
}
