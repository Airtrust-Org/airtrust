// source_reference: reviewed eDB Schema V2 manifests 0477-0480 and canonical migration copies.
// operational_decision: assert staging bundles contain both governance-ledger inserts without executing SQL.
// dry_run_required: test-only builder invocation writes temporary local files; no D1/network writes occur.
// rollback_plan_required: not applicable to this test because it never mutates a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  buildEdbDualLedgerApply,
  EDB_SCHEMA_V2_MANIFEST_BY_MIGRATION,
} from '../staging/build-edb-dual-ledger-apply.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const RELEASE_SHA = 'a'.repeat(40);

for (const [migrationName, manifestName] of Object.entries(EDB_SCHEMA_V2_MANIFEST_BY_MIGRATION)) {
  test(`builds reviewed dual-ledger bundle for ${migrationName}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-dual-ledger-test-'));
    try {
      const outputPath = join(dir, 'bundle.sql');
      const result = buildEdbDualLedgerApply({
        releaseRoot: ROOT,
        migrationName,
        releaseSha: RELEASE_SHA,
        outputPath,
      });
      const bundle = readFileSync(outputPath, 'utf8');
      const manifest = JSON.parse(
        readFileSync(join(ROOT, 'worker-airtrust', 'schema-v2', manifestName), 'utf8'),
      );
      const migration = readFileSync(
        join(ROOT, 'worker-airtrust', 'migrations', migrationName),
        'utf8',
      ).trimEnd();

      assert.equal(result.migrationName, migrationName);
      assert.equal(result.changeId, manifest.changeId);
      assert.equal(result.baselineId, manifest.baselineId);
      assert.equal(result.fileHash, manifest.fileHash);
      assert.equal(result.planHash, manifest.planHash);
      assert.equal(result.releaseSha, RELEASE_SHA);
      assert.ok(bundle.startsWith(migration));
      assert.match(bundle, /INSERT INTO airtrust_schema_changes_v2/);
      assert.match(bundle, new RegExp(`'${manifest.changeId}'`));
      assert.match(bundle, /INSERT INTO d1_migrations \(name\) VALUES/);
      assert.match(bundle, new RegExp(`'${migrationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('rejects migrations outside the explicit eDB allowlist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-dual-ledger-test-'));
  try {
    assert.throws(
      () =>
        buildEdbDualLedgerApply({
          releaseRoot: ROOT,
          migrationName: '9999_not_allowed.sql',
          releaseSha: RELEASE_SHA,
          outputPath: join(dir, 'bundle.sql'),
        }),
      /EDB_DUAL_LEDGER_MIGRATION_NOT_ALLOWLISTED/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
