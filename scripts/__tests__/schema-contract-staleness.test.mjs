import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  computeSchemaV2Digest,
  evaluateStaleness,
  extractDdlTargets,
  sha256,
} from '../../src/schema-contract/contractStaleness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs/database/schema-contracts/production-d1-baseline-v2.json',
);
const CHANGES_DIR = path.join(REPO_ROOT, 'worker-airtrust/schema-v2/changes');
const GUARD_SCRIPT = path.join(REPO_ROOT, 'scripts/schema-contract/check-contract-staleness.mjs');

function makeWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'schema-contract-staleness-node-'));
  const changesDir = path.join(root, 'worker-airtrust/schema-v2/changes');
  mkdirSync(changesDir, { recursive: true });
  mkdirSync(path.join(root, 'worker-airtrust/schema-v2'), { recursive: true });
  mkdirSync(path.join(root, 'docs/database/schema-contracts'), { recursive: true });
  return { root, changesDir };
}

function writeChange(changesDir, name, sql) {
  writeFileSync(path.join(changesDir, name), sql, 'utf8');
  return { change_file: name, sha256: sha256(sql), targets: extractDdlTargets(sql) };
}

function contractFor(entries, overrides = {}) {
  return {
    scoped_tables: ['scoped_table'],
    provenance: {
      baseline_state: 'PRODUCTION_CONFIRMED',
      confirmed_via: 'snapshot.json',
      snapshot_generated_at: '2026-07-29T00:00:00.000Z',
    },
    staleness_guard: {
      schema_v2_changes_dir: 'worker-airtrust/schema-v2/changes',
      reviewed_manifests_dir: 'worker-airtrust/schema-v2',
      schema_v2_digest: computeSchemaV2Digest(
        entries.map((e) => ({ change_file: e.change_file, sha256: e.sha256 })),
      ),
    },
    schema_v2_since_baseline: entries.map((e) => ({
      change_file: e.change_file,
      change_id: null,
      sha256: e.sha256,
      targets: e.targets,
      coverage: 'OUT_OF_CONTRACT_SCOPE',
      governance_state: 'REPO_EXPECTED',
      reviewed_manifest: null,
      ...(e.override ?? {}),
    })),
    ...overrides,
  };
}

test('committed contract is not stale against the repo tree', () => {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const result = evaluateStaleness({ contract, rootDir: REPO_ROOT });
  assert.equal(
    result.status,
    'PASS',
    result.issues.map((i) => `[${i.code}] ${i.message}`).join('\n'),
  );
});

test('every Schema V2 change on disk is classified in the committed contract', () => {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const onDisk = readdirSync(CHANGES_DIR)
    .filter((n) => n.toLowerCase().endsWith('.sql'))
    .sort();
  const classified = (contract.schema_v2_since_baseline ?? []).map((e) => e.change_file).sort();
  assert.deepEqual(classified, onDisk);
});

test('committed schema_v2_digest recomputes from disk', () => {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const onDisk = readdirSync(CHANGES_DIR)
    .filter((n) => n.toLowerCase().endsWith('.sql'))
    .sort()
    .map((name) => ({ change_file: name, sha256: sha256(readFileSync(path.join(CHANGES_DIR, name), 'utf8')) }));
  assert.equal(computeSchemaV2Digest(onDisk), contract.staleness_guard.schema_v2_digest);
});

test('guard CLI exits 0 on the real repo', () => {
  const out = execFileSync('node', [GUARD_SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.match(out, /staleness OK/);
});

test('guard CLI exits non-zero when a change file is added without a contract entry', () => {
  const ws = makeWorkspace();
  try {
    const entry = writeChange(ws.changesDir, '0500_demo.sql', 'CREATE TABLE demo_x (id INTEGER);');
    writeChange(ws.changesDir, '0501_unclassified.sql', 'CREATE TABLE demo_y (id INTEGER);');
    const contractPath = path.join(ws.root, 'docs/database/schema-contracts/production-d1-baseline-v2.json');
    writeFileSync(contractPath, JSON.stringify(contractFor([entry]), null, 2), 'utf8');

    let failed = false;
    let stderr = '';
    try {
      execFileSync('node', [GUARD_SCRIPT, '--contract', contractPath, '--root', ws.root], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      failed = true;
      stderr = String(error.stderr ?? '');
    }
    assert.ok(failed, 'guard should exit non-zero');
    assert.match(stderr, /STALENESS_UNCLASSIFIED_CHANGE/);
  } finally {
    rmSync(ws.root, { recursive: true, force: true });
  }
});

test('critical guard: a change touching a scoped table must be REFLECTED_IN_CONTRACT', () => {
  const ws = makeWorkspace();
  try {
    const entry = writeChange(
      ws.changesDir,
      '0502_touches_scoped.sql',
      'ALTER TABLE scoped_table ADD COLUMN novo TEXT;',
    );
    const stale = contractFor([entry]); // coverage defaults to OUT_OF_CONTRACT_SCOPE
    let result = evaluateStaleness({ contract: stale, rootDir: ws.root });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.issues.some((i) => i.code === 'STALENESS_SCOPED_TABLE_CHANGED'));

    const reconciled = contractFor([{ ...entry, override: { coverage: 'REFLECTED_IN_CONTRACT' } }]);
    result = evaluateStaleness({ contract: reconciled, rootDir: ws.root });
    assert.equal(result.status, 'PASS', JSON.stringify(result.issues));
  } finally {
    rmSync(ws.root, { recursive: true, force: true });
  }
});
